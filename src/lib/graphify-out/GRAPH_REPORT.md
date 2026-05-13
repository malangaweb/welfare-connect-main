# Graph Report - src/lib  (2026-05-13)

## Corpus Check
- 19 files · ~7,047 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 93 nodes · 122 edges · 8 communities detected
- Extraction: 90% EXTRACTED · 10% INFERRED · 0% AMBIGUOUS · INFERRED: 12 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]

## God Nodes (most connected - your core abstractions)
1. `hasRole()` - 10 edges
2. `getCurrentUser()` - 9 edges
3. `invokeWithAppToken()` - 8 edges
4. `getCurrentMember()` - 8 edges
5. `isAdmin()` - 4 edges
6. `isSuperAdmin()` - 4 edges
7. `authorizeQuery()` - 4 edges
8. `buildAuthFilter()` - 4 edges
9. `clearMemberSession()` - 3 edges
10. `isAppTokenExpired()` - 3 edges

## Surprising Connections (you probably didn't know these)
- `logSystemEvent()` --calls--> `invokeWithAppToken()`  [INFERRED]
  systemLog.ts → appAuth.ts
- `updateAdminUserStatus()` --calls--> `invokeWithAppToken()`  [INFERRED]
  adminUsersApi.ts → appAuth.ts
- `updateAdminUserRole()` --calls--> `invokeWithAppToken()`  [INFERRED]
  adminUsersApi.ts → appAuth.ts
- `getAuthContext()` --calls--> `getCurrentUser()`  [INFERRED]
  dataService.ts → authorization.ts
- `executeAuthorizedQuery()` --calls--> `authorizeQuery()`  [INFERRED]
  dataService.ts → queryAuthorization.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.17
Nodes (9): updateAdminUserRole(), updateAdminUserStatus(), clearAppToken(), clearMemberSession(), decodeJwtPayload(), getAppToken(), invokeWithAppToken(), isAppTokenExpired() (+1 more)

### Community 1 - "Community 1"
Cohesion: 0.23
Nodes (13): canViewMember(), canViewTransactions(), getCurrentMember(), getCurrentUser(), isAdmin(), isAuthenticated(), logAuthorizationFailure(), executeAuthorizedQuery() (+5 more)

### Community 2 - "Community 2"
Cohesion: 0.25
Nodes (12): canAccessReports(), canAccessSettings(), canManageCases(), canManageFinances(), canManageMembers(), canManageUsers(), canModifyMember(), canProcessPayments() (+4 more)

### Community 4 - "Community 4"
Cohesion: 0.22
Nodes (6): createReportFilename(), downloadBlob(), exportRowsToCSV(), exportRowsToXLSX(), stamp(), loadXlsx()

### Community 5 - "Community 5"
Cohesion: 0.83
Nodes (3): mapDbCaseToCase(), mapDbMemberToMember(), normalizeMemberStatus()

### Community 6 - "Community 6"
Cohesion: 0.67
Nodes (2): fetchSafeSettings(), readFromCache()

### Community 7 - "Community 7"
Cohesion: 0.67
Nodes (2): canAccessPath(), getAllowedRolesForPath()

### Community 8 - "Community 8"
Cohesion: 1.0
Nodes (2): logSystemEvent(), trimText()

## Knowledge Gaps
- **Thin community `Community 6`** (4 nodes): `fetchSafeSettings()`, `readFromCache()`, `writeCache()`, `settingsClient.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 7`** (4 nodes): `canAccessPath()`, `getAllowedRolesForPath()`, `normalizeRole()`, `rbac.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 8`** (3 nodes): `logSystemEvent()`, `trimText()`, `systemLog.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getCurrentUser()` connect `Community 1` to `Community 2`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **Why does `invokeWithAppToken()` connect `Community 0` to `Community 8`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Why does `getCurrentMember()` connect `Community 1` to `Community 2`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `getCurrentUser()` (e.g. with `getAuthContext()` and `authorizeQuery()`) actually correct?**
  _`getCurrentUser()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **Are the 3 inferred relationships involving `invokeWithAppToken()` (e.g. with `logSystemEvent()` and `updateAdminUserStatus()`) actually correct?**
  _`invokeWithAppToken()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Are the 3 inferred relationships involving `getCurrentMember()` (e.g. with `authorizeQuery()` and `buildAuthFilter()`) actually correct?**
  _`getCurrentMember()` has 3 INFERRED edges - model-reasoned connections that need verification._