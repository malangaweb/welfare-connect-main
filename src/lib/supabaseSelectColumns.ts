/**
 * Narrow PostgREST select lists — avoids `select('*')` payload bloat and over-fetching.
 * Keep in sync with mapDbMemberToMember / CaseForm / transaction list mappings.
 */

export const MEMBER_DETAIL_COLUMNS = [
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
].join(", ");

export const DEPENDANT_COLUMNS = [
  "id",
  "member_id",
  "name",
  "gender",
  "relationship",
  "date_of_birth",
  "is_disabled",
  "is_eligible",
].join(", ");

/** Members list / reports / NewCase picker (mapDbMemberToMember) */
export const MEMBER_LIST_COLUMNS = MEMBER_DETAIL_COLUMNS;

export const CASE_ROW_COLUMNS = [
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
].join(", ");

export const TRANSACTION_LIST_COLUMNS =
  "id, member_id, case_id, amount, transaction_type, payment_method, mpesa_reference, reference, description, status, created_at, metadata";

/** Reports page transaction grid (subset of TRANSACTION_LIST_COLUMNS). */
export const REPORT_TRANSACTION_COLUMNS =
  "id, amount, mpesa_reference, description, created_at, transaction_type, status, member_id, case_id";

export const SETTINGS_ROW_COLUMNS =
  "id, organization_name, organization_email, organization_phone, registration_fee, renewal_fee, penalty_amount, paybill_number, member_id_start, case_id_start, mpesa_consumer_key, mpesa_consumer_secret, mpesa_passkey, mpesa_shortcode, mpesa_initiator_name, mpesa_initiator_password, mpesa_env, created_at, updated_at";

/** DB views used by FiscalReports */
export const MONTHLY_CONTRIBUTIONS_SUMMARY_COLUMNS =
  "month, transaction_type, transaction_count, total_amount, unique_members";

export const CASE_FUNDING_SUMMARY_COLUMNS =
  "case_id, case_number, case_type, affected_member_id, contribution_per_member, start_date, end_date, expected_amount, actual_amount, variance, is_active, is_finalized";

export const MEMBER_TRANSACTION_SUMMARY_COLUMNS =
  "member_id, member_number, name, phone_number, status, wallet_balance, contributions_count, total_contributions, disbursements_count, total_disbursements, last_transaction_date";

export const AUDIT_LOG_LIST_COLUMNS =
  "id, user_id, action, table_name, record_id, status, metadata, timestamp, created_at";

export const REVERSALS_AUDIT_COLUMNS =
  "reversal_id, member_id, member_name, member_number, reversal_amount, description, original_transaction_id, reason, admin_id, reversal_date, original_transaction_date, original_amount";

export const WRONG_MPESA_PENDING_COUNT_COLUMNS = "id, amount, reference, mpesa_receipt_number, status";

export const MEMBERS_ON_PROBATION_COMPLIANCE_COLUMNS =
  "id, member_number, name, days_overdue";
