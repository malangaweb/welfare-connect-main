# Investigation Report — Members 1155, 1191, 1192

**Project:** mcwg-app (`hfojxbfcjozguobwtcgt`, Supabase, Postgres 15, eu-central-1)
**Date:** 2026-10-17
**Method:** Read-only SQL via Supabase Management API (no writes performed)
**Scope:** Data-integrity investigation of members 1155, 1191, 1192 and their related M-Pesa, transaction, audit, and status records.

---

## 1. Member overview

| Member | Name | UUID | Status | DOB | Phone | Registered | Wallet | Last login |
|---|---|---|---|---|---|---|---|---|
| 1155 | EUNICE DAMA RUWA | `9fc1ebf8-11f3-4327-910e-a990088e20e8` | **active** | **2025-12-04** | 0701791342 | 2025-12-18 | 80.00 | null |
| 1191 | JAMES MASHA KAHINDI | `5e9281e4-d7b4-4dbf-84ee-73f8ae0547ea` | probation | 1983-10-09 | **254720888758** | 2026-08-14 | 0.00 | null |
| 1192 | MWENDA ANGORE MUNGUMBA | `bf29eea8-db37-48a0-ad22-68c65f3c8d11` | probation | 1947-08-04 | **254720888758** | 2026-08-14 | 0.00 | null |

**Wallet reconciliation:** `member_wallet_balance_drift` reports **0 drift** for all three members — no money lost or unaccounted; the issues below are data-integrity/audit problems, not balance errors.

---

## 2. Findings

### F1 — Member 1155 has an implausible date of birth (High)
- DOB `2025-12-04` is one day before registration (`2025-12-18`): the member would be a ~10-month-old infant, inconsistent with wallet activity, login history, and a welfare-society membership.
- Likely a data-entry error (possibly `04/12/2005` or a day/month swap).

### F2 — Member 1155 status contradicts the latest status transition (High)
- `members.status = 'active'`, but the latest `member_status_transitions` row is:
  - **2026-07-05 15:56** — `active → probation`, reason `manual_status_update`, by `super_admin`.
- Full transition history:
  1. 2026-06-07 — `active → inactive`, reason `auto_inactive_two_consecutive_defaults` (system)
  2. 2026-06-28 — `inactive → active`, reason `manual_status_update` (super_admin)
  3. 2026-07-05 — `active → probation`, reason `manual_status_update` (super_admin)
- The member row was never updated to `probation` (or was reverted without a transition row). `probation_end_date = 2026-03-18` is also in the past (predates the July probation itself), so it is stale garbage.
- Consequence: a member placed on probation is displayed/treated as active; discipline views may skip them.

### F3 — Members 1191 and 1192 share one phone number (Medium)
- Both `254720888758`, both registered 2026-08-14, both `probation` with `probation_end_date = 2026-11-12`.
- Could be one person holding two memberships (against one-membership-per-person rules) or two household members sharing a phone. Needs confirmation against national ID / residence records.

### F4 — Crossed suspense matching on registration-day payments (High, net-zero)
Both 2026-08-14 registration payments in `wrong_mpesa_transactions` are matched to the **wrong** member:

| Receipt | Reference (bill_ref) | Matched to | Correct member | Amount | Time |
|---|---|---|---|---|---|
| `UHE0L2MDEJ` | 1191 (JAMES) | **bf29eea8… (1192)** | 1191 | 200.00 | 11:31:22 |
| `UHE0L2MHRT` | 1192 | **5e9281e4… (1191)** | 1192 | 200.00 | 11:32:40 |

- Both marked `status = 'matched'`, `reference_type = 'member_only'`, notes `M-Pesa C2B - JAMES - Account: 1191/1192 [member_only]`.
- The matcher appears to have swapped the two candidates (same phone hash, same sender name, 78 seconds apart).
- **Impact is net-zero:** the two +200 fundings crossed, and each member also paid a −200 registration fee, so wallets ended at 0.00. Ledger attribution per member is wrong in the source rows, but the net balances are correct.
- Mitigation: same phone number means both payments came from the same person.

### F5 — Suspense table is the live matcher for post-June-2026 payments (Medium, architectural)
- `mpesa_transactions` (C2B staging) contains **7,811 rows**, latest `trans_time = 2026-06-11 10:53:55` — the staging pipeline appears to have stopped ingesting on 2026-06-11.
- **0 rows** in `mpesa_transactions` with `bill_ref_number` 1191/1192; the later receipts (`UHN0L3OTVF`, `UHN0L3PJE4`, `UIH0L6K0CE`, `UIH0L6K1SB`) exist only in `wrong_mpesa_transactions` (139 rows, 2026-04-22 → 2026-10-15).
- Since June 2026, all C2B matching runs through `wrong_mpesa_transactions` ("suspense") rather than the staging table. This both explains F4's environment and means the healthy-sounding table name `wrong_mpesa_transactions` now carries normal, correctly matched production payments — naming/telemetry trap for future audits.
- Investigate why the `mpesa_transactions` ingestion (likely a webhook/edge function or cron) stopped on 2026-06-11.

### F6 — Members 1191/1192 have `probation` status with no transition history (Medium)
- Neither has any `member_status_transitions` or `member_reinstatement_events` row, yet both are `probation`.
- Probation must have been set at registration time (2026-08-14) or by a code path that skips the transition logger — either way, status provenance is unauditable for these two.

### F7 — Audit trail asymmetry (Low/Medium)
- **1155:** no `audit_logs` rows tying to the suspicious 2026-07-05 probation change beyond a generic `MEMBER_STATUS_UPDATE` (record_id = member id); no rows at all for the DOB/registration anomalies. Also note `member_id` is null on member-scoped rows (uses `record_id` instead) — any audit query filtering on `member_id` misses them.
- **1191/1192:** 4 rows on 2026-09-17, all from `auto_wallet_payment_waterfall`:
  - 1191: `WALLET_FUNDING` +120 (receipt `UIH0L6K0CE`) paired with `LATE_PAYMENT` −120 "Late payment for closed case #C057" (case `5d634030-a99e-40b3-a2c8-376de79d8799`).
  - 1192: same pattern (receipt `UIH0L6K1SB`).
  - These later matches were **correctly** matched by bill_ref.
- No `sms_logs` or `login_attempts` rows exist for any of the three (SMS test data ends 2025-06; login-attempt logging appears unused), so neither member has ever logged in (`last_login = null` for all three).

### F8 — Discipline views: 1191/1192 in probation view, none in defaulters (Informational)
- `members_on_probation`: 1191 and 1192 present, `days_overdue = -26`, wallet 0.00; 1155 absent (consistent with F2 — the view trusts `members.status`, which says `active`).
- `active_defaulters`: none of the three.

---

## 3. What checks out (no issue)

- **Wallet balances reconcile exactly** — `member_wallet_balance_drift` = 0.00 drift for all three (1155 stored/computed 80.00).
- **1155's M-Pesa history is intact**: 9 `mpesa_transactions` rows (bill_ref `1155`, 2025-12-29 → 2026-04-30, amounts 100/120/240) map into the `transactions` ledger (5 fundings totaling 1,220; the remainder is aggregation/suspense routing).
- No rows in `dependants`, `cases` (as affected member), `users`, or `membership_applications` for any of the three.
- Notifications: 1155 = 53, 1191 = 32, 1192 = 32 (normal volumes).

---

## 4. Recommendations

1. **Fix 1155's status:** reconcile `members.status` with the 2026-07-05 `active → probation` transition (either the row is stale or a missing transition row exists); correct `probation_end_date`.
2. **Correct the 1155 DOB** after confirming the true date with the member's records.
3. **Repair the crossed suspense matches:** swap `matched_member_id` on `UHE0L2MDEJ` ↔ `UHE0L2MHRT` (or append compensating corrections — net balances already correct, so do not double-credit).
4. **Confirm the 1191/1192 shared phone:** one person with two memberships vs. a shared household phone; act accordingly.
5. **Investigate the 2026-06-11 stall** of `mpesa_transactions` ingestion; either restore it or formally deprecate it so suspense matching is the documented path.
6. **Fix the matcher** that swapped the two candidates 78 seconds apart (deterministic tie-break when reference, phone hash, and sender name collide across candidate members).
7. **Make probation-at-registration emit a `member_status_transitions` row** so `probation` status is always auditable (F6).
8. **Stop logging member-scoped audit rows with `member_id = null`** (they use `record_id`), or backfill `member_id`.

---

## 5. Security note

A Supabase access token (`sbp_…`) was used for this investigation and appears in the session transcript. **Rotate/revoke it** via Supabase dashboard → Access Tokens.

*All queries were read-only (SELECT only). No data was modified.*
