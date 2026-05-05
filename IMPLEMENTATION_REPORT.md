# Welfare Connect: Full Phased Implementation Plan + Quote (Updated)

**Client**: Malanga Welfare (Malindi)  
**Date**: April 14, 2026  
**Status**: Continuing Final Integration + Enhancements

## Summary
This plan formalizes the next work to:

1. Keep M-Pesa integration on cPanel PHP (`mlg/`) but standardize and extend it.
2. Add server-trusted authentication and data APIs via Supabase Edge Functions without breaking the existing UI.
3. Consolidate security and data access so privileged operations cannot be bypassed from the browser.
4. Implement "Pay to Case" (bulk deductions) so case reporting becomes accurate and audit-ready.
5. Upgrade reports and reconciliation to reflect real payment and deduction behavior (already paid).
6. Deliver Flutter companion app (Android first).
7. Migrate hosting fully to private servers (migration free; hosting billed annually).

## Phase 1: M-Pesa Integration (PHP on cPanel) Rename + Minor Changes
**Price**: KES 5,800

### Goal
Keep the current M-Pesa PHP integration (Daraja / Paybill callbacks etc.) but standardize naming and ensure stable behavior.

### Work
- Rename/standardize endpoint naming and logging labels (same implementation, clearer structure).
- Confirm correct handling of incoming payload variants and store raw payloads where required.
- Confirm idempotency behavior does not create duplicate inserts.

### Deliverables
- Updated endpoint naming conventions and documentation.
- Confirmed write behavior into Supabase tables for:
  - `transactions`
  - audit logs / suspense (where applicable)

### Gate
- Existing M-Pesa flow continues working end-to-end after rename/standardization.

## Phase 2: Server-Trusted Auth + Data Access (Supabase Edge Functions) + SMS Notifications
**Price**: KES 15,000

### Goal
Server-trusted auth + data access without breaking the existing UI, and add SMS notifications using Mobiwave SMS API.

### 2.1 Implement/standardize Supabase Edge Functions
Implement the following Edge Functions:

1. `auth-admin-login`
   - Server-side bcrypt verify
   - Returns: `app_token` + user profile

2. `auth-member-login`
   - Verify `member_number` + `phone_number`
   - Returns: `app_token` + member profile

3. `api-member-summary`
   - Returns: wallet balance + recent transactions + active cases summary

4. `api-member-transactions`
   - Returns: paginated transactions list for the member

5. `api-stk-push` (ONLY if STK is not solely via PHP)
   - Initiates payment without exposing secrets to the browser

### 2.2 `app_token` specification
- JWT signed by `APP_JWT_SECRET` (stored in Supabase secrets)
- Claims: `sub`, `role`, optional `member_id`, `exp`
- Client sends: `Authorization: Bearer <app_token>`

### 2.3 Web app migration (minimal, no UI break)
- Update web login flows first to use these endpoints.
- Remove any browser path that reads `users.password` directly.
- Keep the rest of the app functional; deeper conversion happens in Phase 3.

### 2.4 SMS notifications (Mobiwave SMS API via server)
Implement SMS sending server-side only (no secrets in browser):
- M-Pesa notifications (payment confirmed/received; failure where applicable)
- Case notifications (case announcements; closure updates if required)
- Broadcast messages (admin tool to send message to selected audience)

### Gate
- Web login works end-to-end using server-issued tokens only.
- SMS notifications can be triggered reliably for M-Pesa, cases, and broadcasts.

## Phase 3: Security + Data Access Consolidation (+ Optional USSD)
**Price**: KES 5,000

**Note**: USSD monthly maintenance is separate and not included in this phase price.

### Goal
Finalize enforceable security and data access:
- Remove bypassable client-side enforcement.
- Ensure privileged data access is only possible via trusted server endpoints.
- Keep compatibility with the PHP M-Pesa integration.

### Work (Security + Access)
1. Remove remaining direct frontend access to sensitive tables and privileged writes:
   - `users` (especially password/reset fields)
   - `settings` (especially secrets)
   - privileged writes to members/transactions/cases

2. Standardize authorization enforcement server-side:
   - Admin vs Treasurer vs Member access rules validated by server code

3. RLS posture reconciliation:
   - If RLS is off/partial: enable deny-by-default on sensitive tables and ensure intended access paths still work
   - Ensure trusted services (Edge Functions + PHP) can perform required writes

4. Audit + safety checks:
   - Verify no `VITE_` secrets are shipped to browser bundles
   - Confirm there is no path that allows password reads or role escalation from a public client

### Optional Add-On: USSD implementation (payments + information)
USSD setup can be implemented optionally in this phase, but has recurring monthly costs handled separately.

**USSD monthly maintenance (separate):**
- KES 8,000/month (higher number of extensions)
- KES 6,000/month (medium)
- KES 4,000/month (low)

**USSD capabilities (if enabled):**
- Payments entrypoint (handoff to Paybill/STK rules you define)
- Member information lookup (wallet balance, contribution status, case status)
- Simple menus with extensions per feature area

### Deliverables
- Browser cannot bypass privileged access by calling Supabase tables directly.
- Trusted API endpoints are the supported path for auth and privileged operations.
- Optional: USSD menus implemented and connected to the correct backend functions.

### Gate
- Privileged operations require server validation.
- Direct public client access to sensitive operations is blocked.
- If USSD enabled: USSD flows return correct information and trigger correct payment actions.

## Phase 4: Pay to Cases (Bulk Deduct Workflow) via PHP (Not Supabase Edge)
**Price**: KES 10,000

### Goal
Enable realistic, auditable case contribution reporting by implementing explicit case-linked deductions.

### Required Behavior
1. After creating a case: do not deduct automatically.
2. Treasurer/Admin workflow:
   - Go to Members list
   - Bulk select members
   - Click "Deduct to Case"
   - Modal opens and allows selecting active case
3. Deduction rules (per selected member):
   - Deduct only members who have not paid for the selected case
   - Deduct only members whose wallet balance is greater than or equal to required amount
   - If insufficient balance: do not deduct
4. When case is closed:
   - Members who have not paid for the closed case are marked as defaulters

### Implementation
- UI: member list bulk action + modal + results summary (`deducted`, `skipped_already_paid`, `skipped_insufficient`)
- Backend: PHP endpoint executes rules and writes case-linked transactions
- DB: add/confirm supporting indexes so paid/unpaid checks are fast

### Deliverables
- Bulk deduction end-to-end
- Correct defaulter marking on case close
- No double-deduction when retried

### Gate
- Deductions are correct and idempotent.
- Reporting can reliably compute paid/unpaid per case.

## Phase 5: Reports Upgrade + Reconciliation
**Price**: Already paid

### Goal
Upgrade reports to become realistic and audit-ready using Phase 4 truths.

### Deliverables
- Case funding: expected vs collected, coverage %, paid/unpaid lists
- Defaulters by closed case, and per-member missed case counts
- Reconciliation: wallet funding vs case deductions; suspense vs matched
- Updated exports (Excel/PDF) reflect the above totals correctly

## Phase 6: Flutter Companion App (Android First)
**Price**: KES 45,000

### Goal
Android-first member companion app using the secured API pathways.

### Scope
- Member login
- Dashboard summary
- Wallet balance
- Transactions list + detail
- Case status (paid/unpaid)
- Payment initiation aligned to the PHP M-Pesa flow

### Gate
- Member can log in and see accurate wallet/transactions/case status.
- Payment initiation works end-to-end.

## Phase 7: Hosting Full Migration (Private Servers)
**Migration work price**: Free  
**Hosting fee**: KES 2,500/month paid annually (KES 30,000/year)

### Goal
Move hosting off Netlify to private servers with SSL, stable deployments, and backups.

### Deliverables
- New hosting live, SSL enabled, domain configured
- Deployment procedure established
- Backups scheduled and verified

## Quote Summary
| Phase | Description | Price |
|---|---|---|
| Phase 1 | M-Pesa Integration (PHP on cPanel) Rename + Minor Changes | KES 5,800 |
| Phase 2 | Server-Trusted Auth + Data Access (Supabase Edge Functions) + SMS Notifications | KES 15,000 |
| Phase 3 | Security + Data Access Consolidation (+ Optional USSD) | KES 5,000 |
| Phase 4 | Pay to Cases (Bulk Deduct Workflow) via PHP (Not Supabase Edge) | KES 10,000 |
| Phase 5 | Reports Upgrade + Reconciliation | Already paid |
| Phase 6 | Flutter Companion App (Android First) | KES 45,000 |
| Phase 7 | Hosting Full Migration (Private Servers) | Free migration + KES 30,000/year hosting |

**USSD monthly maintenance (separate):**
- KES 8,000/month or KES 6,000/month or KES 4,000/month (depending on number of extensions)

## Remaining Work (Detailed) After R1-R3 Paid
### Financial Summary
- Already paid: R1-R3
- Remaining implementation phases: R4-R6

## Phase R4: Membership Status Automation & Disciplinary Rules
**Price**: KES 8,000

### Goal
Automate compliant member-state transitions using enforceable system rules.

### Scope
Enforce and standardize statuses:
- `active`
- `inactive`
- `probation`
- `deceased`

Implement automatic inactivation rule:
- 1 default: remain active
- 2 consecutive defaults: auto-transition to inactive

Ensure defaulter tracking aligns to finalized-case outcomes.
Add status-transition audit trail for accountability.

### Deliverables
- Status transition logic implemented server-side
- Consecutive default counter/evaluation mechanism
- Auto-inactive trigger on second consecutive default
- Transition audit records visible for admin review

### Gate (Acceptance)
- A member with two consecutive defaults is automatically marked inactive with traceable logs.
- Statuses remain consistent across web, reports, and API responses.

## Phase R5: Reinstatement Workflow
**Price**: KES 7,000

### Goal
Make reinstatement controlled, policy-compliant, and auditable.

### Policy Rules to Enforce
Inactive member must:
1. Pay fixed KES 300 penalty.
2. Settle all unpaid active/closed case obligations.
3. Serve 3-month probation after reinstatement.

### Scope
- Build trusted reinstatement pre-check + execute flow.
- Validate penalty payment and outstanding obligations before status change.
- On successful reinstatement:
  - set `status = probation`
  - set `is_active = true`
  - set probation end date to reinstatement date + 3 months
- Log reinstatement action and linked transactions.

### Deliverables
- Admin/treasurer reinstatement workflow (API-backed)
- Clear pre-check output: eligible/not eligible + blockers
- Post-reinstatement probation scheduling and audit logging

### Gate (Acceptance)
- Reinstatement blocked unless all three requirements pass.
- Successful reinstatement always lands member in 3-month probation.

## Phase R6: Reports & Reconciliation Upgrade (New Rules)
**Price**: KES 7,000

### Goal
Make reporting reflect the new default/inactive/reinstatement discipline accurately.

### Scope
Add/adjust report views and exports for:
- status distribution (`active`/`inactive`/`probation`/`deceased`)
- default behavior and consecutive-default outcomes
- reinstatement counts and timelines
- penalty collections and unpaid-settlement tracking

Reconcile totals so UI numbers and exports match.

### Deliverables
- Updated report datasets and filters
- Corrected Excel/PDF export totals and categories
- Reconciliation checks for rule-driven transitions and related payments

### Gate (Acceptance)
- Report totals match ledger reality.
- Export output matches on-screen report metrics.

## R4-R6 Execution Status (As of May 4, 2026)
### R4: Membership Status Automation & Disciplinary Rules
- `Implemented (Backend)`: default streak tracking, auto-inactive on second consecutive default, and status transition audit trail.
- `Implemented (Data Model)`: `member_default_streaks`, `member_status_transitions` with indexes and trigger-driven updates.
- `Pending (UI/QA)`: admin-facing transition history views and end-to-end UAT sign-off against real finalized-case scenarios.

### R5: Reinstatement Workflow
- `Implemented (Backend)`: reinstatement pre-check API and execute API with enforceable rules.
- `Implemented (Policy Rules)`: KES 300 penalty transaction, unpaid-obligations gate, and 3-month probation assignment on success.
- `Implemented (Audit)`: reinstatement event logging + linked status transition records.
- `Pending (UI/QA)`: admin/treasurer reinstatement screens and workflow acceptance testing.

### R6: Reports & Reconciliation Upgrade (New Rules)
- `Implemented (Backend Metrics)`: status distribution and discipline/reinstatement aggregates added to reporting API and SQL views.
- `Pending (UI/Exports)`: full report filter surfaces and Excel/PDF layout/category alignment for all new discipline metrics.
- `Pending (Reconciliation Sign-off)`: formal proof that on-screen totals equal export totals in all reporting slices.
