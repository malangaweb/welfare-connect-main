import fs from "node:fs";
import path from "node:path";

function readEnvValue(envText, key) {
  const match = envText.match(new RegExp(`^${key}=(.*)$`, "m"));
  return match ? match[1].trim() : "";
}

function loadEnv() {
  const envPath = path.resolve(".env");
  if (!fs.existsSync(envPath)) {
    throw new Error(`Missing .env at ${envPath}`);
  }
  const envText = fs.readFileSync(envPath, "utf8");
  const url = readEnvValue(envText, "VITE_SUPABASE_URL");
  const anonKey = readEnvValue(envText, "VITE_SUPABASE_ANON_KEY");
  if (!url || !anonKey) {
    throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env");
  }
  return { url, anonKey };
}

const CANDIDATES = {
  members: [
    "id",
    "member_number",
    "name",
    "gender",
    "date_of_birth",
    "national_id_number",
    "phone_number",
    "email_address",
    "residence",
    "next_of_kin",
    "registration_date",
    "probation_end_date",
    "wallet_balance",
    "is_active",
    "status",
    "pin_hash",
    "pin_attempts",
    "pin_locked_until",
    "last_login",
    "created_at",
  ],
  dependants: [
    "id",
    "member_id",
    "name",
    "gender",
    "relationship",
    "date_of_birth",
    "is_disabled",
    "is_eligible",
  ],
  cases: [
    "id",
    "case_number",
    "affected_member_id",
    "dependant_id",
    "case_type",
    "contribution_per_member",
    "start_date",
    "end_date",
    "expected_amount",
    "actual_amount",
    "is_active",
    "is_finalized",
    "created_at",
    "updated_at",
  ],
  transactions: [
    "id",
    "member_id",
    "case_id",
    "amount",
    "transaction_type",
    "payment_method",
    "mpesa_reference",
    "reference",
    "description",
    "status",
    "created_at",
    "metadata",
  ],
  settings: [
    "id",
    "organization_name",
    "organization_email",
    "organization_phone",
    "registration_fee",
    "renewal_fee",
    "penalty_amount",
    "paybill_number",
    "member_id_start",
    "case_id_start",
    "mpesa_consumer_key",
    "mpesa_consumer_secret",
    "mpesa_passkey",
    "mpesa_shortcode",
    "mpesa_initiator_name",
    "mpesa_initiator_password",
    "mpesa_env",
    "created_at",
    "updated_at",
  ],
  monthly_contributions_summary: [
    "month",
    "transaction_type",
    "transaction_count",
    "total_amount",
    "unique_members",
  ],
  case_funding_summary: [
    "case_id",
    "case_number",
    "case_type",
    "affected_member_id",
    "contribution_per_member",
    "start_date",
    "end_date",
    "expected_amount",
    "actual_amount",
    "variance",
    "is_active",
    "is_finalized",
  ],
  member_transaction_summary: [
    "member_id",
    "member_number",
    "name",
    "phone_number",
    "status",
    "wallet_balance",
    "contributions_count",
    "total_contributions",
    "disbursements_count",
    "total_disbursements",
    "last_transaction_date",
  ],
  audit_logs: [
    "id",
    "user_id",
    "action",
    "table_name",
    "record_id",
    "status",
    "metadata",
    "timestamp",
    "created_at",
  ],
  reversals_audit: [
    "reversal_id",
    "member_id",
    "member_name",
    "member_number",
    "reversal_amount",
    "description",
    "original_transaction_id",
    "reason",
    "admin_id",
    "reversal_date",
    "original_transaction_date",
    "original_amount",
  ],
  wrong_mpesa_transactions: ["id", "amount", "reference", "mpesa_receipt_number", "status"],
  members_on_probation: ["id", "member_number", "name", "days_overdue"],
  residences: ["id", "name", "created_at"],
};

async function probeWithAutoTrim({ url, anonKey, relation, columns }) {
  let current = [...columns];
  for (let i = 0; i < 30; i += 1) {
    const endpoint = `${url}/rest/v1/${relation}?select=${encodeURIComponent(current.join(","))}&limit=1`;
    const response = await fetch(endpoint, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
    });
    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { message: text };
    }
    if (response.ok) {
      return { ok: true, relation, columns: current, status: response.status };
    }
    const message = String(body?.message || text || "");
    const badColumnMatch = message.match(/column\s+[^.]+\.(\S+)\s+does not exist/i);
    if (badColumnMatch) {
      const badColumn = badColumnMatch[1].replaceAll('"', "").trim();
      const next = current.filter((column) => column !== badColumn);
      if (next.length === current.length) {
        return { ok: false, relation, columns: current, status: response.status, message };
      }
      current = next;
      continue;
    }
    return { ok: false, relation, columns: current, status: response.status, message };
  }
  return { ok: false, relation, columns: current, status: 0, message: "Probe iteration limit reached" };
}

async function main() {
  const env = loadEnv();
  const generatedAt = new Date().toISOString();
  const result = {
    generated_at: generatedAt,
    source: "supabase-rest-probe-anon",
    relations: {},
  };

  for (const [relation, columns] of Object.entries(CANDIDATES)) {
    // eslint-disable-next-line no-await-in-loop
    const probe = await probeWithAutoTrim({ ...env, relation, columns });
    result.relations[relation] = probe;
    if (probe.ok) {
      console.log(`${relation}: ok (${probe.columns.length} cols)`);
    } else {
      console.log(`${relation}: fail [${probe.status}] ${probe.message || "unknown error"}`);
    }
  }

  const outPath = path.resolve("src/lib/liveSelectMap.generated.json");
  fs.writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`\nWrote ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
