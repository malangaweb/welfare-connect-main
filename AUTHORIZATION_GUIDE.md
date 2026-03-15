# Authorization & Access Control Strategy

**Date Implemented:** March 15, 2026  
**Status:** CRITICAL - Required for production deployment

## Overview

Since the Welfare Connect system uses custom authentication (bcrypt + localStorage) instead of Supabase Auth, RLS policies cannot be used (they depend on `auth.uid()` which is null for custom auth). 

Instead, we implement **app-level authorization** to control data access at the application layer.

---

## Architecture

### Three Layers of Authorization

#### 1. **Route-Level Authorization** (ProtectedRoute.tsx)
```typescript
<ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.TREASURER]}>
  <TransactionsPage />
</ProtectedRoute>
```
- Checks user authentication and role before rendering components
- Redirects unauthorized users to login

#### 2. **Query-Level Authorization** (queryAuthorization.ts)
```typescript
// Check before making Supabase queries
authorizeQuery({
  resourceType: 'member',
  resourceId: memberId,
});

// Or apply authorization filters
const filter = buildAuthFilter('transaction', memberId);
```
- Validates authorization before executing database queries
- Prevents unauthorized data access at the source

#### 3. **Component-Level Authorization** (useAuthorization.ts)
```typescript
const canEdit = useCanModifyMember();
const canViewSettings = useCanAccessSettings();

return (
  <>
    {canEdit && <EditButton />}
    {canViewSettings && <SettingsButton />}
  </>
);
```
- Conditionally renders UI based on user permissions
- Enhances UX by hiding unavailable features

---

## User Roles & Permissions

### Role Hierarchy

```
SUPER_ADMIN (highest privileges)
├── Can manage everything
├── Can access all reports
├── Can manage users
└── Can view audit logs

CHAIRPERSON
├── Can manage cases
├── Can view members
├── Can access some reports
└── Cannot manage finances

TREASURER  
├── Can manage financial transactions
├── Can view reports
├── Can process payments
├── Cannot manage cases

SECRETARY
├── Can manage member records
├── Can create new members
├── Can manage dependants
└── Cannot access finances

MEMBER (lowest privileges)
└── Can only view own data
```

### Permission Matrix

| Action | Super Admin | Chairperson | Treasurer | Secretary | Member |
|--------|:-----------:|:-----------:|:---------:|:---------:|:------:|
| View Members | ✅ | ✅ | ✅ | ✅ | Own only |
| Edit Members | ✅ | ✅ | ❌ | ✅ | No |
| Manage Cases | ✅ | ✅ | ❌ | ❌ | No |
| View Transactions | ✅ | ✅ | ✅ | ❌ | Own only |
| Process Payments | ✅ | ❌ | ✅ | ❌ | No |
| View Reports | ✅ | ✅ | ✅ | ❌ | No |
| Manage Users | ✅ | ❌ | ❌ | ❌ | No |
| View Settings | ✅ | ❌ | ❌ | ❌ | No |

---

## Implementation Guide

### 1. Check Authorization in Components

```typescript
import { useAuth } from '@/contexts/AuthContext';
import { useCanViewMember, useIsAdmin } from '@/hooks/useAuthorization';

export function MemberDetails({ memberId }: { memberId: string }) {
  const { logout } = useAuth();
  const canView = useCanViewMember(memberId);
  const isAdmin = useIsAdmin();

  if (!canView) {
    return <div>You don't have permission to view this member</div>;
  }

  return (
    <div>
      <h1>Member Details</h1>
      {isAdmin && <AdminPanel />}
    </div>
  );
}
```

### 2. Protect Routes

```typescript
// In App.tsx
<Route
  path="/transactions"
  element={
    <ProtectedRoute 
      allowedRoles={[
        UserRole.SUPER_ADMIN, 
        UserRole.TREASURER
      ]}
    >
      <TransactionsPage />
    </ProtectedRoute>
  }
/>
```

### 3. Authorize Database Queries

```typescript
import { authorizeQuery, buildAuthFilter } from '@/lib/queryAuthorization';
import { supabase } from '@/integrations/supabase/client';

async function fetchMemberTransactions(memberId: string) {
  // Check authorization before querying
  authorizeQuery({
    resourceType: 'transaction',
    memberId,
  });

  // Build filtered query
  let query = supabase
    .from('transactions')
    .select('*')
    .eq('member_id', memberId);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}
```

### 4. Handle Authorization Errors

```typescript
import { useAuth } from '@/contexts/AuthContext';
import { useCanProcessPayments } from '@/hooks/useAuthorization';
import { toast } from '@/components/ui/use-toast';

export function PaymentButton() {
  const { logout } = useAuth();
  const canProcess = useCanProcessPayments();

  const handleClick = async () => {
    if (!canProcess) {
      toast({
        variant: 'destructive',
        title: 'Access Denied',
        description: 'You do not have permission to process payments.',
      });
      return;
    }

    // Process payment...
  };

  return (
    <button 
      onClick={handleClick}
      disabled={!canProcess}
    >
      Process Payment
    </button>
  );
}
```

---

## Key Files

### Authorization Layer
- **`src/lib/authorization.ts`** - Core authorization functions
- **`src/lib/queryAuthorization.ts`** - Supabase query authorization
- **`src/hooks/useAuthorization.ts`** - React hooks for authorization checks

### Context & Routes
- **`src/contexts/AuthContext.tsx`** - Global auth context (updated)
- **`src/components/ProtectedRoute.tsx`** - Route-level authorization (updated)
- **`src/components/ErrorBoundary.tsx`** - Global error handling (new)

---

## Best Practices

### 1. Always Check Before Querying

```typescript
// ❌ BAD - No authorization check
const { data } = await supabase.from('members').select('*');

// ✅ GOOD - Check authorization first
authorizeQuery({ resourceType: 'member' });
const { data } = await supabase.from('members').select('*');
```

### 2. Filter Data for Members

```typescript
// ❌ BAD - Returns all member data
const { data } = await supabase
  .from('members')
  .select('*');

// ✅ GOOD - Filter by member if not admin
const filter = buildAuthFilter('member', currentMember?.id);
let query = supabase.from('members').select('*');
if (filter) query = query.eq(filter.column, filter.value);
const { data } = await query;
```

### 3. Show Only Available Actions

```typescript
// ❌ BAD - Show disabled button (confusing UX)
<Button disabled={!canEdit}>Edit</Button>

// ✅ GOOD - Show only if authorized
{canEdit && <Button>Edit</Button>}
```

### 4. Use Consistent Error Messages

```typescript
import { getAuthErrorMessage } from '@/lib/authorization';

throw new Error(getAuthErrorMessage('access this member'));
// Error: You do not have permission to access this member. 
//        Please contact an administrator.
```

---

## Testing Authorization

### Test Cases

```typescript
// Test 1: Admin can access all members
expect(canViewMember(anyMemberId, admin)).toBe(true);

// Test 2: Member can access own record only
expect(canViewMember(ownId, member)).toBe(true);
expect(canViewMember(otherId, member)).toBe(false);

// Test 3: Unauthorized role cannot access
expect(canViewMember(memberId, chairperson)).toBe(false);
```

### Manual Testing Checklist

- [ ] Login as each role and verify correct pages are accessible
- [ ] Verify disabled users cannot access any pages
- [ ] Verify members can only see their own data
- [ ] Verify admins can see all appropriate data
- [ ] Verify authorization failure is logged
- [ ] Verify error boundary catches unhandled errors

---

## Audit Logging

All authorization failures are logged via `logAuthorizationFailure()`:

```typescript
await logAuthorizationFailure(
  'route_access',
  '/transactions',
  'User role admin not in allowed roles [super_admin, treasurer]'
);
```

These logs appear in the browser console and could be extended to the audit_logs table.

---

## Migration from RLS

### Why Not Use RLS?

| Aspect | RLS | App-Level Auth |
|--------|-----|-----------------|
| **Requires** | Supabase Auth | Custom auth |
| **Uses** | auth.uid() | localStorage + JWT |
| **Overhead** | Database-level | Application-level |
| **Compatibility** | ❌ Breaks with custom auth | ✅ Works perfectly |

### Future Migration Option

If the system migrates to Supabase Auth:

1. Enable RLS policies (already created in migrations)
2. Remove app-level authorization checks
3. Remove ErrorBoundary wrapping
4. Keep authorization utilities for UI layer

---

## Security Considerations

### ✅ What's Protected

- API routes check user role before executing queries
- Frontend routes check authorization before rendering
- Database queries filter data by user
- All actions logged for audit trail

### ⚠️ Never Rely Only On Frontend

Frontend authorization can be bypassed via console. **Always validate on server:**

```typescript
// This should be done on a backend endpoint/Edge Function
async function processPayment(memberId: string) {
  // ❌ DON'T TRUST CLIENT-SIDE AUTH
  
  // ✅ DO validate on backend/Edge Function
  const user = getCurrentUser(); // From JWT or session
  if (user.role !== 'treasurer') {
    throw new Error('Unauthorized');
  }
  
  // Process payment...
}
```

---

## Troubleshooting

### "You don't have permission" errors

1. Check user's role in localStorage:
   ```javascript
   JSON.parse(localStorage.getItem('currentUser')).role
   ```

2. Verify route has correct `allowedRoles`

3. Check ProtectedRoute component is properly wrapping the route

### Authorization not working

1. Ensure `ErrorBoundary` is at top of App.tsx
2. Check `useAuth()` is called within `AuthProvider`
3. Verify user login stored `currentUser` in localStorage

---

## Deployment Checklist

- [ ] All routes wrapped in ProtectedRoute with appropriate roles
- [ ] Query authorization checks added to all sensitive operations
- [ ] Error boundary integrated and tested
- [ ] Authorization utilities exported and documented
- [ ] Team trained on new authorization system
- [ ] Audit logging enabled
- [ ] Security review completed

---

## Support & Questions

For questions about authorization implementation, refer to:
- `src/lib/authorization.ts` - Function documentation
- `src/hooks/useAuthorization.ts` - Hook examples
- `src/lib/queryAuthorization.ts` - Query authorization patterns
