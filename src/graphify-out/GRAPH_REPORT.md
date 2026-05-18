# Graph Report - src  (2026-05-15)

## Corpus Check
- 176 files · ~104,059 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 540 nodes · 606 edges · 23 communities detected
- Extraction: 78% EXTRACTED · 22% INFERRED · 0% AMBIGUOUS · INFERRED: 133 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 30|Community 30]]

## God Nodes (most connected - your core abstractions)
1. `toast()` - 56 edges
2. `getCurrentUser()` - 12 edges
3. `invokeWithAppToken()` - 11 edges
4. `getCurrentMember()` - 10 edges
5. `hasRole()` - 10 edges
6. `MpesaClient` - 9 edges
7. `createReportFilename()` - 9 edges
8. `fetchSuspenseTransactions()` - 7 edges
9. `normalizeType()` - 6 edges
10. `handleFundingSuccess()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `handleTransfer()` --calls--> `toast()`  [INFERRED]
  components/accounts/AccountTransactionsList.tsx → pages/Members.tsx
- `useCurrentUser()` --calls--> `getCurrentUser()`  [INFERRED]
  hooks/useAuthorization.ts → lib/authorization.ts
- `useCurrentMember()` --calls--> `getCurrentMember()`  [INFERRED]
  hooks/useAuthorization.ts → lib/authorization.ts
- `useAuthHeader()` --calls--> `getCurrentUser()`  [INFERRED]
  hooks/useAuthorization.ts → lib/authorization.ts
- `fetchCasePageData()` --calls--> `mapDbCaseToCase()`  [INFERRED]
  pages/CaseDetails.tsx → lib/db-types.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (32): handleSubmit(), normalizeMemberNumber(), loadJsPdfWithAutotable(), validateDependants(), fetchResidences(), executeReinstatement(), handleDeleteMember(), handleStatusChange() (+24 more)

### Community 1 - "Community 1"
Cohesion: 0.1
Nodes (29): useAuthHeader(), useAuthorizeQuery(), useCurrentMember(), useCurrentUser(), canAccessReports(), canAccessSettings(), canManageCases(), canManageFinances() (+21 more)

### Community 2 - "Community 2"
Cohesion: 0.08
Nodes (23): handleCollectFee(), MemberProtectedRoute(), handleLogout(), handleSubmit(), clearAppToken(), clearMemberSession(), decodeJwtPayload(), getAppToken() (+15 more)

### Community 3 - "Community 3"
Cohesion: 0.12
Nodes (23): createReportFilename(), downloadBlob(), exportRowsToCSV(), exportRowsToXLSX(), stamp(), loadXlsx(), buildCaseDescriptionOrFilter(), buildCaseDescriptionPatterns() (+15 more)

### Community 4 - "Community 4"
Cohesion: 0.12
Nodes (10): getNextCaseId(), fetchSafeSettings(), readFromCache(), fetchDefaultFee(), fetchResidences(), fetchSettings(), handleRefresh(), handleResidenceAdded() (+2 more)

### Community 5 - "Community 5"
Cohesion: 0.17
Nodes (12): mapDbCaseToCase(), mapDbMemberToMember(), normalizeMemberStatus(), fetchMember(), getResidenceId(), handleDeductToAccount(), handleDependantSubmit(), handleEditClick() (+4 more)

### Community 6 - "Community 6"
Cohesion: 0.13
Nodes (12): handleSubmit(), createManagedUser(), deleteMemberUserLinks(), listAdminUsers(), resetAdminUserPassword(), updateAdminUserRole(), updateAdminUserStatus(), handleDeleteMember() (+4 more)

### Community 7 - "Community 7"
Cohesion: 0.12
Nodes (4): getTransactionIcon(), getTransactionIcon(), walletRowDelta(), getTransactionTypeIcon()

### Community 8 - "Community 8"
Cohesion: 0.23
Nodes (8): getContributionSignedAmount(), isArrearsTransaction(), isContributionTransaction(), isCountableTransaction(), isPenaltyTransaction(), isPositiveContribution(), normalizeStatus(), normalizeType()

### Community 9 - "Community 9"
Cohesion: 0.21
Nodes (8): loadHtml2canvas(), loadJsPdf(), fetchData(), groupByMonth(), groupCasesByType(), groupContributionsByCaseType(), handleExportCSV(), handleExportPDF()

### Community 10 - "Community 10"
Cohesion: 0.21
Nodes (5): calculateCollectedNet(), fetchCaseContributionTransactions(), fetchCases(), handleDeleteCase(), invalidateCaseCaches()

### Community 11 - "Community 11"
Cohesion: 0.25
Nodes (5): useDebounce(), useMembers(), useMemberSearch(), useTransactions(), useTransactionSearch()

### Community 12 - "Community 12"
Cohesion: 0.29
Nodes (7): checkTableExists(), fetchSuspenseTransactions(), handleAutoMatch(), handleIgnore(), handleManualInsert(), handleManualMatch(), handleReverse()

### Community 14 - "Community 14"
Cohesion: 0.47
Nodes (1): MpesaClient

### Community 15 - "Community 15"
Cohesion: 0.22
Nodes (3): getStatusColor(), getStatusText(), getStatusColor()

### Community 16 - "Community 16"
Cohesion: 0.22
Nodes (3): fetchMembers(), catch(), handleVisibilityChange()

### Community 17 - "Community 17"
Cohesion: 0.29
Nodes (4): useCanAccessSettings(), canAccessPath(), getAllowedRolesForPath(), canAccess()

### Community 18 - "Community 18"
Cohesion: 0.48
Nodes (5): addToRemoveQueue(), dispatch(), genId(), reducer(), toast()

### Community 19 - "Community 19"
Cohesion: 0.33
Nodes (3): fetchMembers(), handleTransfer(), handleTransferClick()

### Community 20 - "Community 20"
Cohesion: 0.33
Nodes (3): componentDidCatch(), logSystemEvent(), trimText()

### Community 21 - "Community 21"
Cohesion: 0.4
Nodes (2): fetchTransactions(), handleSave()

### Community 23 - "Community 23"
Cohesion: 0.6
Nodes (3): processStkPushCallback(), updateTransactionFailure(), updateTransactionSuccess()

### Community 30 - "Community 30"
Cohesion: 1.0
Nodes (2): getErrorMessage(), getResourceId()

## Knowledge Gaps
- **Thin community `Community 14`** (10 nodes): `client.ts`, `MpesaClient`, `.checkTransactionStatus()`, `.constructor()`, `.generatePassword()`, `.getAccessToken()`, `.getBaseUrl()`, `.getTimestamp()`, `.initiateStkPush()`, `.sendB2C()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 21`** (6 nodes): `fetchTransactions()`, `handleEdit()`, `handleRevert()`, `handleSave()`, `handleSearchChange()`, `Transactions.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (3 nodes): `getErrorMessage()`, `getResourceId()`, `NotFound.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `toast()` connect `Community 0` to `Community 2`, `Community 3`, `Community 4`, `Community 5`, `Community 6`, `Community 9`, `Community 10`, `Community 16`, `Community 19`, `Community 21`?**
  _High betweenness centrality (0.182) - this node is a cross-community bridge._
- **Why does `invokeWithAppToken()` connect `Community 2` to `Community 0`, `Community 20`, `Community 6`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **Why does `createReportFilename()` connect `Community 3` to `Community 0`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Are the 54 inferred relationships involving `toast()` (e.g. with `fetchCases()` and `handleDeleteCase()`) actually correct?**
  _`toast()` has 54 INFERRED edges - model-reasoned connections that need verification._
- **Are the 7 inferred relationships involving `getCurrentUser()` (e.g. with `useCurrentUser()` and `useAuthorizeQuery()`) actually correct?**
  _`getCurrentUser()` has 7 INFERRED edges - model-reasoned connections that need verification._
- **Are the 6 inferred relationships involving `invokeWithAppToken()` (e.g. with `handleCollectFee()` and `handleStatusChange()`) actually correct?**
  _`invokeWithAppToken()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **Are the 5 inferred relationships involving `getCurrentMember()` (e.g. with `useCurrentMember()` and `useAuthorizeQuery()`) actually correct?**
  _`getCurrentMember()` has 5 INFERRED edges - model-reasoned connections that need verification._