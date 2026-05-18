# Graph Report - flt_app  (2026-05-15)

## Corpus Check
- 68 files · ~347,084 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 468 nodes · 566 edges · 32 communities detected
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 8 edges (avg confidence: 0.8)
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
- [[_COMMUNITY_Community 20|Community 20]]
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

## God Nodes (most connected - your core abstractions)
1. `package:flutter/material.dart` - 28 edges
2. `package:flutter_riverpod/flutter_riverpod.dart` - 23 edges
3. `../auth/auth_controller.dart` - 18 edges
4. `../../core/services/live_data_service.dart` - 17 edges
5. `package:intl/intl.dart` - 14 edges
6. `admin_shell.dart` - 11 edges
7. `../../core/constants/app_constants.dart` - 10 edges
8. `package:go_router/go_router.dart` - 9 edges
9. `AppDelegate` - 8 edges
10. `member_shell.dart` - 7 edges

## Surprising Connections (you probably didn't know these)
- `SetChildContent()` --calls--> `OnCreate()`  [INFERRED]
  windows/runner/win32_window.cpp → windows/runner/flutter_window.cpp
- `GetClientArea()` --calls--> `OnCreate()`  [INFERRED]
  windows/runner/win32_window.cpp → windows/runner/flutter_window.cpp
- `wWinMain()` --calls--> `CreateAndAttachConsole()`  [INFERRED]
  windows/runner/main.cpp → windows/runner/utils.cpp
- `wWinMain()` --calls--> `GetCommandLineArguments()`  [INFERRED]
  windows/runner/main.cpp → windows/runner/utils.cpp
- `OnCreate()` --calls--> `RegisterPlugins()`  [INFERRED]
  windows/runner/flutter_window.cpp → windows/flutter/generated_plugin_registrant.cc

## Communities

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (33): ../../core/constants/app_constants.dart, ../../core/services/supabase_service.dart, build, CasesScreen, _CasesScreenState, Center, Container, dispose (+25 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (30): admin_shell.dart, ../../core/services/live_data_service.dart, AdminDashboardScreen, _AdminDashboardScreenState, AdminShell, build, Card, Center (+22 more)

### Community 2 - "Community 2"
Cohesion: 0.11
Nodes (19): RegisterPlugins(), FlutterWindow(), OnCreate(), Create(), Destroy(), EnableFullDpiSupportIfAvailable(), GetClientArea(), GetThisFromHandle() (+11 more)

### Community 3 - "Community 3"
Cohesion: 0.08
Nodes (24): ../auth/auth_controller.dart, ../../core/auth/role_access.dart, AdminMemberDetailsScreen, _AdminMemberDetailsScreenState, AdminShell, build, Center, Divider (+16 more)

### Community 4 - "Community 4"
Cohesion: 0.08
Nodes (22): app_colors.dart, AppColors, AppTextStyles, ThemeData, build, Center, Color, Container (+14 more)

### Community 5 - "Community 5"
Cohesion: 0.08
Nodes (21): ../../core/services/storage_service.dart, AppConfig, Duration, Exception, validate, AdminDashboardSnapshot, Exception, fetchMemberSummary (+13 more)

### Community 6 - "Community 6"
Cohesion: 0.08
Nodes (23): ../auth/role_access.dart, ../../features/admin/admin_accounts_screen.dart, ../../features/admin/admin_case_details_screen.dart, ../../features/admin/admin_cases_screen.dart, ../../features/admin/admin_dashboard_screen.dart, ../../features/admin/admin_member_details_screen.dart, ../../features/admin/admin_members_screen.dart, ../../features/admin/admin_reports_screen.dart (+15 more)

### Community 7 - "Community 7"
Cohesion: 0.08
Nodes (22): core/router/app_router.dart, ../../core/theme/app_colors.dart, core/theme/app_theme.dart, ../../features/auth/auth_controller.dart, build, ColoredBox, MalangaCompanionApp, Stack (+14 more)

### Community 8 - "Community 8"
Cohesion: 0.09
Nodes (20): AdminAccountsScreen, _AdminAccountsScreenState, AdminShell, build, Card, Center, initState, ListView (+12 more)

### Community 9 - "Community 9"
Cohesion: 0.11
Nodes (18): dart:io, AdminMembersScreen, _AdminMembersScreenState, AdminShell, build, Center, _chip, Container (+10 more)

### Community 10 - "Community 10"
Cohesion: 0.11
Nodes (18): build, Center, Container, _copyReportToClipboard, Exception, initState, ListView, MemberReportScreen (+10 more)

### Community 11 - "Community 11"
Cohesion: 0.11
Nodes (17): AdminShell, build, Card, Center, Container, initState, _isHiddenHashRef, ListTile (+9 more)

### Community 12 - "Community 12"
Cohesion: 0.12
Nodes (13): app.dart, core/config/app_config.dart, main, build, MaterialApp, _StartupErrorApp, main, ProviderScope (+5 more)

### Community 13 - "Community 13"
Cohesion: 0.12
Nodes (15): _action, build, Center, Exception, initState, ListTile, MemberDashboardScreen, _MemberDashboardScreenState (+7 more)

### Community 14 - "Community 14"
Cohesion: 0.12
Nodes (15): AlertDialog, build, Center, CheckboxListTile, Container, Exception, _InfoCard, initState (+7 more)

### Community 15 - "Community 15"
Cohesion: 0.13
Nodes (14): AdminShell, AdminTransactionsScreen, _AdminTransactionsScreenState, build, Center, Container, dispose, initState (+6 more)

### Community 16 - "Community 16"
Cohesion: 0.13
Nodes (14): AdminReportsScreen, _AdminReportsScreenState, AdminShell, build, Center, Exception, initState, ListView (+6 more)

### Community 17 - "Community 17"
Cohesion: 0.14
Nodes (4): fl_register_plugins(), main(), my_application_activate(), my_application_new()

### Community 18 - "Community 18"
Cohesion: 0.17
Nodes (11): AdminCasesScreen, _AdminCasesScreenState, AdminShell, build, Center, initState, InkWell, ListView (+3 more)

### Community 19 - "Community 19"
Cohesion: 0.22
Nodes (3): FlutterAppDelegate, FlutterImplicitEngineDelegate, AppDelegate

### Community 20 - "Community 20"
Cohesion: 0.47
Nodes (4): wWinMain(), CreateAndAttachConsole(), GetCommandLineArguments(), Utf8FromUtf16()

### Community 21 - "Community 21"
Cohesion: 0.33
Nodes (3): RegisterGeneratedPlugins(), NSWindow, MainFlutterWindow

### Community 22 - "Community 22"
Cohesion: 0.4
Nodes (2): RunnerTests, XCTestCase

### Community 23 - "Community 23"
Cohesion: 0.5
Nodes (2): handle_new_rx_page(), Intercept NOTIFY_DEBUGGER_ABOUT_RX_PAGES and touch the pages.

### Community 24 - "Community 24"
Cohesion: 0.67
Nodes (2): GeneratedPluginRegistrant, -registerWithRegistry

### Community 25 - "Community 25"
Cohesion: 0.67
Nodes (2): FlutterSceneDelegate, SceneDelegate

### Community 26 - "Community 26"
Cohesion: 0.67
Nodes (2): canAccessAdminPath, normalizeAdminRole

### Community 27 - "Community 27"
Cohesion: 0.67
Nodes (2): StorageService, package:flutter_secure_storage/flutter_secure_storage.dart

### Community 28 - "Community 28"
Cohesion: 0.67
Nodes (1): GeneratedPluginRegistrant

### Community 29 - "Community 29"
Cohesion: 1.0
Nodes (1): AppConstants

### Community 30 - "Community 30"
Cohesion: 1.0
Nodes (1): MainActivity

### Community 31 - "Community 31"
Cohesion: 1.0
Nodes (1): package:integration_test/integration_test_driver.dart

## Knowledge Gaps
- **323 isolated node(s):** `-registerWithRegistry`, `Intercept NOTIFY_DEBUGGER_ABOUT_RX_PAGES and touch the pages.`, `main`, `ProviderScope`, `package:malanga_welfare_companion/app.dart` (+318 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 22`** (5 nodes): `RunnerTests.swift`, `RunnerTests.swift`, `RunnerTests`, `.testExample()`, `XCTestCase`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 23`** (4 nodes): `handle_new_rx_page()`, `__lldb_init_module()`, `Intercept NOTIFY_DEBUGGER_ABOUT_RX_PAGES and touch the pages.`, `flutter_lldb_helper.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (3 nodes): `GeneratedPluginRegistrant.m`, `GeneratedPluginRegistrant`, `-registerWithRegistry`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (3 nodes): `FlutterSceneDelegate`, `SceneDelegate.swift`, `SceneDelegate`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (3 nodes): `canAccessAdminPath`, `normalizeAdminRole`, `role_access.dart`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (3 nodes): `StorageService`, `storage_service.dart`, `package:flutter_secure_storage/flutter_secure_storage.dart`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (3 nodes): `GeneratedPluginRegistrant.java`, `GeneratedPluginRegistrant`, `.registerWith()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (2 nodes): `AppConstants`, `app_constants.dart`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (2 nodes): `MainActivity.kt`, `MainActivity`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 31`** (2 nodes): `package:integration_test/integration_test_driver.dart`, `integration_test.dart`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `package:flutter/material.dart` connect `Community 4` to `Community 0`, `Community 1`, `Community 3`, `Community 6`, `Community 7`, `Community 8`, `Community 9`, `Community 10`, `Community 11`, `Community 12`, `Community 13`, `Community 14`, `Community 15`, `Community 16`, `Community 18`?**
  _High betweenness centrality (0.186) - this node is a cross-community bridge._
- **Why does `package:flutter_riverpod/flutter_riverpod.dart` connect `Community 12` to `Community 0`, `Community 1`, `Community 3`, `Community 4`, `Community 5`, `Community 6`, `Community 7`, `Community 8`, `Community 10`, `Community 11`, `Community 13`, `Community 14`, `Community 15`, `Community 16`?**
  _High betweenness centrality (0.173) - this node is a cross-community bridge._
- **Why does `../../core/services/live_data_service.dart` connect `Community 1` to `Community 0`, `Community 3`, `Community 4`, `Community 8`, `Community 9`, `Community 10`, `Community 11`, `Community 13`, `Community 14`, `Community 15`, `Community 16`, `Community 18`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **What connects `-registerWithRegistry`, `Intercept NOTIFY_DEBUGGER_ABOUT_RX_PAGES and touch the pages.`, `main` to the rest of the system?**
  _323 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.11 - nodes in this community are weakly interconnected._