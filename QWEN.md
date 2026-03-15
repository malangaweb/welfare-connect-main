# Malanga Welfare - Project Context

## Project Overview

**Malanga Welfare** (also known as "Welfare Connect") is a comprehensive welfare society management platform built for the Malanga Welfare Society. The system handles member management, financial contributions, welfare cases (education, sickness, death assistance), and payment processing via M-Pesa.

### Core Features
- **Member Management**: Registration, profiles, dependants, next of kin, probation tracking (90 days)
- **Financial Management**: Contributions, penalties, arrears, wallet balances, transaction reversals
- **Welfare Cases**: Education, sickness, and death assistance cases with disbursement tracking
- **Payment Integration**: M-Pesa Daraja API (STK Push, C2B, B2C, reversals)
- **Suspense Account**: Management of unmatched/wrong M-Pesa payments with auto-matching
- **SMS Notifications**: TextSMS Kenya integration for member communications
- **Authentication**: 
  - Admin: Username + password (bcrypt hashed in `users` table)
  - Member: Member Number + Phone Number (verified against `members` table)
- **Reporting**: Financial reports, defaulter tracking, contribution analytics, compliance reports
- **Audit Logging**: Complete audit trail for all system actions with reversal tracking

### Tech Stack
- **Frontend**: React 18.3.1 + TypeScript + Vite 5.4.1
- **UI Components**: shadcn-ui (Radix UI primitives)
- **Styling**: Tailwind CSS 3.4.11
- **State Management**: TanStack React Query (data fetching/caching)
- **Backend**: Supabase (PostgreSQL, Auth, Edge Functions)
- **Payments**: M-Pesa Daraja API (STK Push, C2B, B2C)
- **SMS**: TextSMS Kenya API
- **Forms**: React Hook Form + Zod validation
- **Reports**: jsPDF + jspdf-autotable, XLSX for Excel export

---

## Project Structure

```
Malanga Welfare/
├── src/
│   ├── components/       # Reusable UI components
│   │   ├── ui/          # shadcn-ui base components
│   │   ├── forms/       # Form components (MemberForm, UserForm)
│   │   ├── members/     # Member-related components
│   │   ├── accounts/    # Account management components
│   │   ├── users/       # User management components
│   │   └── transactions/# Transaction components
│   ├── contexts/        # React contexts (AuthContext)
│   ├── hooks/           # Custom React hooks (use-toast, etc.)
│   ├── integrations/    # External service integrations
│   │   ├── supabase/    # Supabase client & types
│   │   └── mpesa/       # M-Pesa payment integration
│   │       ├── client.ts          # M-Pesa API client
│   │       └── webhook-handler.ts # Payment callback handler
│   ├── layouts/         # Page layouts (DashboardLayout)
│   ├── lib/             # Utility libraries (types, cache, db-types)
│   ├── pages/           # Page components
│   │   ├── members/     # Member management pages
│   │   ├── Dashboard.tsx
│   │   ├── Login.tsx
│   │   ├── MemberLogin.tsx
│   │   ├── Members.tsx
│   │   ├── Transactions.tsx
│   │   ├── Accounts.tsx
│   │   ├── Cases.tsx
│   │   ├── Reports.tsx
│   │   ├── Settings.tsx
│   │   └── ...
│   ├── providers/       # Context providers
│   └── utils/           # Utility functions (idGenerators, formatters)
├── supabase/
│   ├── functions/       # Supabase Edge Functions
│   │   ├── send-sms/          # SMS notification function
│   │   ├── mpesa-stk-push/    # STK Push endpoint (to deploy)
│   │   ├── mpesa-callback/    # Payment webhook (to deploy)
│   │   └── mpesa-b2c/         # B2C payment endpoint (to deploy)
│   ├── migrations/    # Database migrations
│   │   ├── 20231217000000_create_transfer_function.sql
│   │   ├── 20260307000001_add_password_reset_tokens.sql
│   │   ├── 20260307000002_add_member_pin_auth.sql
│   │   ├── 20260307000003_create_audit_logging.sql
│   │   ├── 20260307000004_create_performance_functions.sql
│   │   ├── 20260307000005_add_performance_indexes.sql
│   │   ├── 20260307000006_add_rls_policies.sql
│   │   ├── 20260307000007_add_rate_limiting.sql
│   │   ├── 20260314000001_advanced_indexes_and_search.sql
│   │   ├── 20260314000002_welfare_system_upgrades.sql
│   │   └── 20260314000003_mpesa_settings.sql
│   ├── config.toml
│   └── .env
├── public/              # Static assets
├── .env                 # Environment variables (DO NOT COMMIT)
├── .env.example         # Environment template
├── db-schema.sql        # Complete database schema
├── IMPLEMENTATION_PLAN.md  # Detailed implementation roadmap
├── package.json         # Dependencies & scripts
└── tsconfig.json        # TypeScript configuration
```

---

## Building and Running

### Prerequisites
- Node.js 18+ (recommended via nvm)
- npm or bun package manager
- Supabase project account
- M-Pesa Daraja developer account (for payments)

### Installation

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env
# Edit .env with your actual credentials
```

### Development

```bash
# Start development server (port 8080)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Lint code
npm run lint
```

### Environment Configuration

Required environment variables in `.env`:

```env
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here

# M-Pesa Configuration (Daraja API)
VITE_MPESA_CONSUMER_KEY=your-consumer-key
VITE_MPESA_CONSUMER_SECRET=your-consumer-secret
VITE_MPESA_SHORTCODE=your-shortcode
VITE_MPESA_PASSKEY=your-passkey
VITE_MPESA_CALLBACK_URL=https://your-domain.com/api/mpesa-webhook

# SMS Configuration (TextSMS Kenya)
VITE_SMS_API_KEY=your-sms-api-key
VITE_SMS_PARTNER_ID=your-partner-id
VITE_SMS_SHORTCODE=WELFARE

# Application URLs
VITE_APP_URL=https://your-domain.com
```

### Database Setup

1. Run the main schema in Supabase SQL Editor:
   - `db-schema.sql` - Complete database schema with tables, indexes, triggers, and functions

2. Or use Supabase CLI:
```bash
supabase db push
```

3. Hash existing admin passwords (if upgrading from plain-text):
```sql
UPDATE users
SET password = crypt(password, gen_salt('bf', 12))
WHERE password NOT LIKE '$2a$%' AND password NOT LIKE '$2b$%' AND password NOT LIKE '$2y$%';
```

---

## Database Schema

### Core Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `members` | Registered welfare society members | id, member_number, name, phone_number, wallet_balance, status, probation_end_date |
| `users` | Admin/staff user accounts with roles | id, username, password (bcrypt), role, member_id |
| `cases` | Welfare cases (education, sickness, death) | id, case_number, affected_member_id, case_type, contribution_per_member |
| `transactions` | All financial transactions | id, member_id, case_id, amount, transaction_type, status, mpesa_reference |
| `accounts` | System financial accounts | id, name, type, balance, is_system |
| `residences` | Member residence locations | id, name, location |
| `audit_logs` | Audit trail for all system actions | id, user_id, action, table_name, record_id, status, metadata |
| `settings` | System configuration | id, registration_fee, renewal_fee, mpesa_* config |
| `wrong_mpesa_transactions` | Suspense account for unmatched payments | id, mpesa_receipt_number, phone_number, amount, status, matched_member_id |

### Key Database Functions

| Function | Purpose |
|----------|---------|
| `calculate_wallet_balance(member_id)` | Calculate member wallet balance from transactions |
| `get_defaulters_count()` | Get members with negative balances |
| `get_total_contributions()` | Total contributions sum |
| `get_case_contributions(case_id)` | Contributions for specific case |
| `get_recent_members(limit)` | Recently registered members |
| `get_recent_transactions(limit)` | Recent transaction history |
| `get_dashboard_summary()` | Efficient dashboard stats in single call |
| `update_updated_at_column()` | Trigger function to auto-update timestamps |
| `revert_transaction(id, admin_id, reason)` | Reverse a transaction with audit trail |
| `match_suspense_transactions()` | Auto-match wrong M-Pesa payments to members |
| `safe_delete_member(id, admin_id)` | Safe member deletion with balance check |
| `insert_member(...)` | Secure member insertion with PIN hashing |
| `update_member_pin(id, old_pin, new_pin)` | Secure PIN change for members |

### Database Views

| View | Purpose |
|------|---------|
| `active_defaulters` | Members with negative balance who are active |
| `members_on_probation` | Members currently on 90-day probation |

---

## Authentication System

### Admin Authentication
- **Location**: `src/pages/Login.tsx`
- **Credentials**: Username + password (stored in `users` table)
- **Password Hashing**: bcrypt with 12 rounds (supports legacy plain-text for migration)
- **Roles**: `super_admin`, `chairperson`, `treasurer`, `secretary`, `member`
- **Session**: Stored in localStorage with token and currentUser
- **Verification**: 
  ```typescript
  if (storedPassword.startsWith('$2')) {
    isValidPassword = await bcryptjs.compare(values.password, storedPassword);
  } else {
    isValidPassword = values.password === storedPassword; // Legacy
  }
  ```

### Member Authentication
- **Location**: `src/pages/MemberLogin.tsx`
- **Credentials**: Member Number + Phone Number (stored in `members` table)
- **Verification**: Phone number comparison (normalized, removes spaces/dashes/parentheses)
- **Session**: Stored in localStorage (member_member_id, member_name, member_phone_number)
- **Status Check**: Only active members can login

---

## Member Management

### Member Status
Members have a status field with the following values:
- `probation` - New member in 90-day probation period
- `active` - Full member (probation completed)
- `inactive` - Temporarily or permanently inactive
- `deceased` - Member has passed away

### Probation Period
- New members are automatically placed on 90-day probation
- `probation_end_date` is set at registration
- Auto-update job runs daily to activate members whose probation has ended
- Members on probation still pay contributions and cases

### Member Actions (Super Admin)
- Edit member details
- Change member status
- Delete member (only if wallet balance is zero)
- View member transaction history
- Transfer member to different residence

---

## Payment & Transaction Management

### Transaction Types
- `registration` - Member registration fee
- `renewal` - Annual membership renewal
- `contribution` - Regular welfare contributions
- `penalty` - Late payment penalties
- `arrears` - Outstanding payments
- `wallet_funding` - Wallet top-ups (including M-Pesa)
- `disbursement` - Case benefit payouts
- `transfer` - Fund transfers

### Transaction Reversal (Super Admin Only)
- Accessible from Transactions page
- Requires reversal reason
- Creates opposite transaction entry
- Marks original as `reversed`
- Updates member wallet balance
- Logs to audit trail
- Optional M-Pesa B2C reversal for M-Pesa payments

### Suspense Account (Wrong M-Pesa Transactions)
- Tracks payments sent to wrong paybill/number
- Auto-matching by phone number via `match_suspense_transactions()`
- Manual matching UI for unmatched payments
- Can be reversed/ignored
- Matched payments create wallet funding transactions

---

## M-Pesa Integration

### Features
- **STK Push**: Initiate payment prompt on member's phone
- **C2B**: Receive payments via paybill
- **B2C**: Send money to members (disbursements, reversals)
- **Webhooks**: Real-time payment notifications
- **Reversals**: Reverse M-Pesa transactions via B2C

### Edge Functions (To Deploy)
```bash
supabase functions deploy mpesa-stk-push
supabase functions deploy mpesa-callback
supabase functions deploy mpesa-b2c
supabase functions deploy mpesa-b2c-callback
```

### M-Pesa Client Usage
```typescript
import { MpesaClient } from '@/integrations/mpesa/client'

const mpesa = new MpesaClient(config)

// STK Push
await mpesa.initiateStkPush({
  phoneNumber: '0712345678',
  amount: 1000,
  accountReference: member.id,
  transactionDesc: 'Welfare contribution'
})

// B2C Payment
await mpesa.sendB2C(
  '0712345678',
  5000,
  'Case disbursement'
)

// Check Status
await mpesa.checkTransactionStatus(checkoutRequestId)
```

---

## Security Features

- **Admin Password Hashing**: bcrypt with 12 rounds (in `users` table)
- **Member Authentication**: Phone number verification (in `members` table)
- **Row Level Security (RLS)**: Enabled on all sensitive tables
- **Audit Logging**: All login actions and data changes logged with member/user ID and status
- **CORS**: Restricted to allowed origins only
- **Input Validation**: Zod schemas for admin login forms
- **Transaction Reversal**: Requires Super Admin role, logged with reason
- **Member Deletion**: Blocked if wallet balance is non-zero

---

## Development Conventions

### Code Style
- TypeScript with strict mode disabled (gradual adoption)
- Path aliases: `@/*` maps to `./src/*`
- Functional components with hooks
- shadcn-ui component patterns

### File Naming
- Components: PascalCase (e.g., `MemberCard.tsx`)
- Hooks: camelCase with `use` prefix (e.g., `useMembers.ts`)
- Pages: PascalCase matching route names

### Type Safety
- Domain types in `src/lib/types.ts`
- Database types in `src/integrations/supabase/types.ts`
- Mapping functions in `src/lib/db-types.ts`

---

## Key Documentation

| File | Description |
|------|-------------|
| `IMPLEMENTATION_PLAN.md` | Detailed roadmap with code samples |
| `COMPLETE_IMPLEMENTATION_GUIDE.md` | Phase-by-phase implementation guide |
| `Audit_report7.md` | Comprehensive security & performance audit |
| `db-schema.sql` | Complete database schema with indexes |
| `ALL_FIXES_SUMMARY.md` | Summary of all fixes applied |

---

## Common Operations

### Add New Member
1. Navigate to `/new-member`
2. Fill member details (generates numeric member number)
3. Set registration fee (default from settings)
4. Optionally set credentials (username/password for admin access)
5. Member automatically placed on 90-day probation

### Process Payment
1. Go to Transactions page
2. Select member
3. Choose transaction type (contribution, penalty, etc.)
4. Select payment method (M-Pesa, cash)
5. Enter amount and reference

### Reverse Transaction (Super Admin)
1. Go to Transactions page
2. Find transaction
3. Click "Reverse" button
4. Enter reversal reason
5. Optionally process M-Pesa B2C reversal
6. Confirm reversal

### Manage Suspense Payments
1. Go to Accounts → Suspense Account
2. View unmatched M-Pesa transactions
3. Click "Auto-Match All" or manually match
4. For manual match, search member by phone
5. Confirm match to create wallet funding

### Change Member Status
1. Go to Members page
2. Find member
3. Click on member row or actions menu
4. Select new status (probation, active, inactive, deceased)
5. Save changes

---

## Deployment

### Production Checklist
- [ ] All database migrations deployed
- [ ] M-Pesa Edge Functions deployed
- [ ] Environment variables set in hosting provider
- [ ] M-Pesa credentials configured for production
- [ ] SMS API credentials rotated from development
- [ ] CORS origins updated for production domain
- [ ] Database backup strategy in place
- [ ] Audit log monitoring enabled
- [ ] Probation auto-update cron job configured

### Current Deployment
- **URL**: https://mwelfare.netlify.app (also malangawelfare.org)
- **Hosting**: Netlify
- **Domain Renewal**: July 29th annually

---

## Troubleshooting

### Login Issues
```sql
-- Check if admin passwords are hashed
SELECT id, password FROM users LIMIT 1;
-- Should start with $2a$, $2b$, or $2y$ for hashed passwords
```

### Slow Dashboard
```sql
-- Check if using RPC function
EXPLAIN ANALYZE SELECT * FROM get_dashboard_summary();
-- Should be fast (< 100ms)
```

### M-Pesa Payment Not Matching
```sql
-- Check suspense table
SELECT * FROM wrong_mpesa_transactions WHERE status = 'pending';

-- Run auto-match
SELECT match_suspense_transactions();
```

### Member Stuck on Probation
```sql
-- Check probation end date
SELECT member_number, name, registration_date, probation_end_date, status
FROM members WHERE status = 'probation';

-- Manually activate if overdue
UPDATE members SET status = 'active'
WHERE probation_end_date <= CURRENT_DATE AND status = 'probation';
```

### Transaction Reversal Failed
```sql
-- Check if already reversed
SELECT status FROM transactions WHERE id = 'transaction-id';

-- Check member balance impact
SELECT wallet_balance FROM members WHERE id = 'member-id';
```

---

## Support Resources

- **Supabase Docs**: https://supabase.com/docs
- **M-Pesa Daraja**: https://developer.safaricom.co.ke
- **shadcn-ui**: https://ui.shadcn.com
- **TanStack Query**: https://tanstack.com/query
- **React Hook Form**: https://react-hook-form.com

---

## Implementation Status

| Feature | Status | Notes |
|---------|--------|-------|
| Admin Authentication | ✅ Complete | Bcrypt passwords |
| Member Authentication | ✅ Complete | Phone number based |
| Member Management | ✅ Complete | Status, probation, deletion |
| Transaction Management | ✅ Complete | Reversals implemented |
| Suspense Account | ✅ Complete | Auto-match ready |
| M-Pesa Client | ✅ Complete | STK Push, B2C, queries |
| M-Pesa Edge Functions | ⏳ To Deploy | Need Supabase deployment |
| Case Management | 🟡 Partial | Basic CRUD, needs enhancements |
| Reports | 🟡 Partial | Basic reports, needs fiscal/compliance |
| Probation Auto-Job | ⏳ To Deploy | Needs cron setup |

---

**Last Updated:** March 14, 2026
**Version:** 2.0
