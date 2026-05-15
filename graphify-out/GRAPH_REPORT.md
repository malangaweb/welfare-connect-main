# Graph Report - Malanga Welfare  (2026-05-15)

## Corpus Check
- 293 files · ~564,938 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1083 nodes · 1244 edges · 44 communities detected
- Extraction: 89% EXTRACTED · 11% INFERRED · 0% AMBIGUOUS · INFERRED: 141 edges (avg confidence: 0.8)
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
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]

## God Nodes (most connected - your core abstractions)
1. `toast()` - 57 edges
2. `package:flutter/material.dart` - 22 edges
3. `package:flutter_riverpod/flutter_riverpod.dart` - 17 edges
4. `../auth/auth_controller.dart` - 12 edges
5. `getCurrentUser()` - 12 edges
6. `../../core/services/live_data_service.dart` - 11 edges
7. `invokeWithAppToken()` - 11 edges
8. `../../core/constants/app_constants.dart` - 10 edges
9. `getCurrentMember()` - 10 edges
10. `hasRole()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `fetchCases()` --calls--> `toast()`  [INFERRED]
  src/pages/Cases.tsx → src/hooks/use-toast.ts
- `fetchResidences()` --calls--> `toast()`  [INFERRED]
  src/pages/Settings.tsx → src/hooks/use-toast.ts
- `onSubmitSettings()` --calls--> `toast()`  [INFERRED]
  src/pages/Settings.tsx → src/hooks/use-toast.ts
- `catch()` --calls--> `toast()`  [INFERRED]
  src/pages/Members.tsx → src/hooks/use-toast.ts
- `handleExportCSV()` --calls--> `toast()`  [INFERRED]
  src/pages/members/MemberReport.tsx → src/hooks/use-toast.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.02
Nodes (150): admin_shell.dart, ../auth/auth_controller.dart, ../../core/constants/app_constants.dart, ../../core/services/live_data_service.dart, ../../core/services/supabase_service.dart, main, AppColors, AdminDashboardScreen (+142 more)

### Community 1 - "Community 1"
Cohesion: 0.03
Nodes (52): fetchMembers(), handleTransfer(), handleTransferClick(), handleSubmit(), addToRemoveQueue(), dispatch(), genId(), reducer() (+44 more)

### Community 2 - "Community 2"
Cohesion: 0.04
Nodes (17): isInvalidUuidError(), resolveMemberId(), isInvalidUuidError(), resolveMemberId(), buildSettingsPayload(), toNullableString(), toPositiveNumber(), firstNonEmpty() (+9 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (33): useAuthHeader(), useAuthorizeQuery(), useCanAccessSettings(), useCurrentMember(), useCurrentUser(), canAccessReports(), canAccessSettings(), canManageCases() (+25 more)

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (26): handleCollectFee(), componentDidCatch(), MemberProtectedRoute(), handleLogout(), clearAppToken(), clearMemberSession(), decodeJwtPayload(), getAppToken() (+18 more)

### Community 5 - "Community 5"
Cohesion: 0.05
Nodes (38): core/router/app_router.dart, ../../core/theme/app_colors.dart, core/theme/app_theme.dart, ../../features/admin/admin_cases_screen.dart, ../../features/admin/admin_dashboard_screen.dart, ../../features/admin/admin_members_screen.dart, ../../features/admin/admin_settings_screen.dart, ../../features/admin/admin_transactions_screen.dart (+30 more)

### Community 6 - "Community 6"
Cohesion: 0.08
Nodes (30): createReportFilename(), downloadBlob(), exportRowsToCSV(), exportRowsToXLSX(), stamp(), loadXlsx(), buildCaseDescriptionOrFilter(), buildCaseDescriptionPatterns() (+22 more)

### Community 7 - "Community 7"
Cohesion: 0.06
Nodes (27): app.dart, core/config/app_config.dart, ../../core/services/storage_service.dart, AppConfig, Duration, Exception, validate, AdminDashboardSnapshot (+19 more)

### Community 8 - "Community 8"
Cohesion: 0.11
Nodes (19): RegisterPlugins(), FlutterWindow(), OnCreate(), Create(), Destroy(), EnableFullDpiSupportIfAvailable(), GetClientArea(), GetThisFromHandle() (+11 more)

### Community 9 - "Community 9"
Cohesion: 0.19
Nodes (16): mlg_base64url_decode(), mlg_first_non_empty(), mlg_get_app_token_from_request(), mlg_get_header_value(), mlg_handle_options(), mlg_http_json(), mlg_json_response(), mlg_load_env_files() (+8 more)

### Community 10 - "Community 10"
Cohesion: 0.11
Nodes (11): getNextCaseId(), handleSubmit(), fetchSafeSettings(), readFromCache(), fetchDefaultFee(), fetchResidences(), fetchSettings(), handleRefresh() (+3 more)

### Community 11 - "Community 11"
Cohesion: 0.13
Nodes (12): handleSubmit(), createManagedUser(), deleteMemberUserLinks(), listAdminUsers(), resetAdminUserPassword(), updateAdminUserRole(), updateAdminUserStatus(), handleDeleteMember() (+4 more)

### Community 12 - "Community 12"
Cohesion: 0.12
Nodes (4): getTransactionIcon(), getTransactionIcon(), walletRowDelta(), getTransactionTypeIcon()

### Community 13 - "Community 13"
Cohesion: 0.14
Nodes (4): fl_register_plugins(), main(), my_application_activate(), my_application_new()

### Community 14 - "Community 14"
Cohesion: 0.14
Nodes (13): AdminCasesScreen, _AdminCasesScreenState, AdminShell, build, Card, Center, Container, initState (+5 more)

### Community 15 - "Community 15"
Cohesion: 0.21
Nodes (8): loadHtml2canvas(), loadJsPdf(), fetchData(), groupByMonth(), groupCasesByType(), groupContributionsByCaseType(), handleExportCSV(), handleExportPDF()

### Community 16 - "Community 16"
Cohesion: 0.24
Nodes (5): storeWrongTransaction(), supabaseGet(), supabaseInsertStrict(), transactionAlreadyPosted(), wrongTransactionAlreadyStored()

### Community 17 - "Community 17"
Cohesion: 0.2
Nodes (5): buildCaseDescriptionPatterns(), buildCaseTransactionOrFilter(), fetchCases(), handleDeleteCase(), invalidateCaseCaches()

### Community 18 - "Community 18"
Cohesion: 0.25
Nodes (5): useDebounce(), useMembers(), useMemberSearch(), useTransactions(), useTransactionSearch()

### Community 19 - "Community 19"
Cohesion: 0.29
Nodes (7): checkTableExists(), fetchSuspenseTransactions(), handleAutoMatch(), handleIgnore(), handleManualInsert(), handleManualMatch(), handleReverse()

### Community 21 - "Community 21"
Cohesion: 0.47
Nodes (1): MpesaClient

### Community 22 - "Community 22"
Cohesion: 0.22
Nodes (3): getStatusColor(), getStatusText(), getStatusColor()

### Community 23 - "Community 23"
Cohesion: 0.22
Nodes (3): FlutterAppDelegate, FlutterImplicitEngineDelegate, AppDelegate

### Community 24 - "Community 24"
Cohesion: 0.22
Nodes (3): fetchMembers(), catch(), handleVisibilityChange()

### Community 25 - "Community 25"
Cohesion: 0.29
Nodes (2): buildMissingReceiptKey(), sanitizeReferencePart()

### Community 26 - "Community 26"
Cohesion: 0.43
Nodes (4): getNetPaidForCase(), resolveCaseDeductionConflict(), sb_get(), sb_patch()

### Community 27 - "Community 27"
Cohesion: 0.4
Nodes (2): isInvalidUuidError(), resolveMember()

### Community 28 - "Community 28"
Cohesion: 0.4
Nodes (2): isInvalidUuidError(), resolveMemberId()

### Community 29 - "Community 29"
Cohesion: 0.47
Nodes (4): wWinMain(), CreateAndAttachConsole(), GetCommandLineArguments(), Utf8FromUtf16()

### Community 30 - "Community 30"
Cohesion: 0.33
Nodes (4): app_colors.dart, AppTextStyles, ThemeData, package:google_fonts/google_fonts.dart

### Community 31 - "Community 31"
Cohesion: 0.33
Nodes (3): RegisterGeneratedPlugins(), NSWindow, MainFlutterWindow

### Community 34 - "Community 34"
Cohesion: 0.5
Nodes (2): findMemberByNumber(), memberNumberCandidates()

### Community 35 - "Community 35"
Cohesion: 0.4
Nodes (2): RunnerTests, XCTestCase

### Community 36 - "Community 36"
Cohesion: 0.7
Nodes (4): loadEnv(), main(), probeWithAutoTrim(), readEnvValue()

### Community 37 - "Community 37"
Cohesion: 0.6
Nodes (3): processStkPushCallback(), updateTransactionFailure(), updateTransactionSuccess()

### Community 40 - "Community 40"
Cohesion: 0.5
Nodes (2): handle_new_rx_page(), Intercept NOTIFY_DEBUGGER_ABOUT_RX_PAGES and touch the pages.

### Community 45 - "Community 45"
Cohesion: 0.67
Nodes (2): GeneratedPluginRegistrant, -registerWithRegistry

### Community 46 - "Community 46"
Cohesion: 0.67
Nodes (2): FlutterSceneDelegate, SceneDelegate

### Community 47 - "Community 47"
Cohesion: 0.67
Nodes (2): StorageService, package:flutter_secure_storage/flutter_secure_storage.dart

### Community 48 - "Community 48"
Cohesion: 0.67
Nodes (1): GeneratedPluginRegistrant

### Community 52 - "Community 52"
Cohesion: 1.0
Nodes (2): getErrorMessage(), getResourceId()

### Community 60 - "Community 60"
Cohesion: 1.0
Nodes (1): AppConstants

### Community 61 - "Community 61"
Cohesion: 1.0
Nodes (1): MainActivity

### Community 62 - "Community 62"
Cohesion: 1.0
Nodes (1): package:integration_test/integration_test_driver.dart

## Knowledge Gaps
- **224 isolated node(s):** `-registerWithRegistry`, `Intercept NOTIFY_DEBUGGER_ABOUT_RX_PAGES and touch the pages.`, `main`, `ProviderScope`, `package:malanga_welfare_companion/app.dart` (+219 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 21`** (10 nodes): `MpesaClient`, `.checkTransactionStatus()`, `.constructor()`, `.generatePassword()`, `.getAccessToken()`, `.getBaseUrl()`, `.getTimestamp()`, `.initiateStkPush()`, `.sendB2C()`, `client.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (8 nodes): `buildMissingReceiptKey()`, `normalizeMpesaReference()`, `normalizePhoneNumber()`, `parseMpesaTimestamp()`, `sanitizeReferencePart()`, `parseBillReference()`, `index.ts`, `reference-parser.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (6 nodes): `isInvalidUuidError()`, `jsonResponse()`, `normalizeCandidate()`, `resolveMember()`, `verifyToken()`, `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (6 nodes): `isInvalidUuidError()`, `jsonResponse()`, `normalizeCandidate()`, `resolveMemberId()`, `verifyToken()`, `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 34`** (5 nodes): `findMemberByNumber()`, `jsonResponse()`, `memberNumberCandidates()`, `normalizePhone()`, `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 35`** (5 nodes): `RunnerTests.swift`, `RunnerTests.swift`, `RunnerTests`, `.testExample()`, `XCTestCase`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 40`** (4 nodes): `handle_new_rx_page()`, `__lldb_init_module()`, `Intercept NOTIFY_DEBUGGER_ABOUT_RX_PAGES and touch the pages.`, `flutter_lldb_helper.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 45`** (3 nodes): `GeneratedPluginRegistrant.m`, `GeneratedPluginRegistrant`, `-registerWithRegistry`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 46`** (3 nodes): `SceneDelegate.swift`, `FlutterSceneDelegate`, `SceneDelegate`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 47`** (3 nodes): `storage_service.dart`, `StorageService`, `package:flutter_secure_storage/flutter_secure_storage.dart`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 48`** (3 nodes): `GeneratedPluginRegistrant.java`, `GeneratedPluginRegistrant`, `.registerWith()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 52`** (3 nodes): `getErrorMessage()`, `getResourceId()`, `NotFound.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 60`** (2 nodes): `app_constants.dart`, `AppConstants`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 61`** (2 nodes): `MainActivity.kt`, `MainActivity`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 62`** (2 nodes): `integration_test.dart`, `package:integration_test/integration_test_driver.dart`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `toast()` connect `Community 1` to `Community 4`, `Community 6`, `Community 10`, `Community 11`, `Community 15`, `Community 17`, `Community 24`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **Why does `package:flutter/material.dart` connect `Community 0` to `Community 14`, `Community 5`, `Community 30`, `Community 7`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **Why does `package:flutter_riverpod/flutter_riverpod.dart` connect `Community 0` to `Community 5`, `Community 7`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Are the 54 inferred relationships involving `toast()` (e.g. with `fetchCases()` and `handleDeleteCase()`) actually correct?**
  _`toast()` has 54 INFERRED edges - model-reasoned connections that need verification._
- **Are the 7 inferred relationships involving `getCurrentUser()` (e.g. with `useCurrentUser()` and `useAuthorizeQuery()`) actually correct?**
  _`getCurrentUser()` has 7 INFERRED edges - model-reasoned connections that need verification._
- **What connects `-registerWithRegistry`, `Intercept NOTIFY_DEBUGGER_ABOUT_RX_PAGES and touch the pages.`, `main` to the rest of the system?**
  _224 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.02 - nodes in this community are weakly interconnected._