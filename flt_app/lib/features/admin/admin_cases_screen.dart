import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:posthog_flutter/posthog_flutter.dart';

import '../../core/constants/app_constants.dart';
import '../../core/services/live_data_service.dart';
import '../../core/widgets/async_error_view.dart';
import 'admin_shell.dart';
import '../auth/auth_controller.dart';

class AdminCasesScreen extends ConsumerStatefulWidget {
  const AdminCasesScreen({super.key});

  @override
  ConsumerState<AdminCasesScreen> createState() => _AdminCasesScreenState();
}

class _AdminCasesScreenState extends ConsumerState<AdminCasesScreen> {
  final _service = LiveDataService();
  final _searchCtrl = TextEditingController();
  late Future<List<Map<String, dynamic>>> _future;
  String _statusFilter = 'all';
  String _caseTypeFilter = 'all';

  @override
  void initState() {
    super.initState();
    _future = _loadCases();
  }

  Future<List<Map<String, dynamic>>> _loadCases({bool forceRefresh = false}) {
    final token = ref.read(authControllerProvider).appToken ?? '';
    return _service
        .fetchAdminCases(appToken: token, forceRefresh: forceRefresh)
        .timeout(const Duration(seconds: 20));
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _refresh() async {
    setState(() => _future = _loadCases(forceRefresh: true));
    await _future;
  }

  Future<void> _toggleCase(Map<String, dynamic> row) async {
    final caseId = (row['id'] ?? '').toString();
    if (caseId.isEmpty) return;

    try {
      if (row['is_finalized'] == true) {
        await _service.reopenCase(caseId: caseId);
        Posthog().capture(
          eventName: 'case_reopened',
          properties: {
            'case_type':
                (row['case_type'] ?? 'unknown').toString().toLowerCase(),
          },
        );
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Case reopened successfully.')),
        );
      } else {
        final amount = _toDouble(row['actual_amount']);
        await _service.finalizeCase(caseId: caseId, actualAmount: amount);
        Posthog().capture(
          eventName: 'case_finalized',
          properties: {
            'case_type':
                (row['case_type'] ?? 'unknown').toString().toLowerCase(),
            'actual_amount': amount,
          },
        );
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Case finalized successfully.')),
        );
      }
      await _service
          .clearAdminCache(ref.read(authControllerProvider).appToken ?? '');
      await _refresh();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Action failed: $e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final money = NumberFormat.currency(
      locale: 'en_KE',
      symbol: 'KES ',
      decimalDigits: 2,
    );

    return AdminShell(
      title: 'Cases',
      route: '/admin/cases',
      actions: [
        IconButton(onPressed: _refresh, icon: const Icon(Icons.refresh)),
      ],
      body: FutureBuilder<List<Map<String, dynamic>>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return AsyncErrorView(
              error: snapshot.error,
              onRetry: _refresh,
            );
          }

          final rows = snapshot.data ?? const [];
          final query = _searchCtrl.text.trim().toLowerCase();

          final filtered = rows.where((r) {
            final isFinalized = r['is_finalized'] == true;
            final isActive = r['is_active'] == true;

            if (_statusFilter == 'active' && !(isActive && !isFinalized)) {
              return false;
            }
            if (_statusFilter == 'inactive' && (isActive || isFinalized)) {
              return false;
            }
            if (_statusFilter == 'finalized' && !isFinalized) return false;

            if (_caseTypeFilter != 'all') {
              final caseType = (r['case_type'] ?? '').toString().toLowerCase();
              if (caseType != _caseTypeFilter) return false;
            }

            if (query.isEmpty) return true;
            final caseNumber =
                (r['case_number'] ?? '').toString().toLowerCase();
            final caseType = (r['case_type'] ?? '').toString().toLowerCase();
            return caseNumber.contains(query) || caseType.contains(query);
          }).toList();

          final finalizedCount =
              rows.where((r) => r['is_finalized'] == true).length;
          final activeCount = rows
              .where((r) => r['is_active'] == true && r['is_finalized'] != true)
              .length;
          final inactiveCount = rows
              .where((r) => r['is_active'] != true && r['is_finalized'] != true)
              .length;

          return ListView(
            padding: const EdgeInsets.all(AppConstants.marginEdge),
            children: [
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _searchCtrl,
                      onChanged: (_) => setState(() {}),
                      decoration: InputDecoration(
                        hintText: 'Search by case number or type',
                        prefixIcon: const Icon(Icons.search),
                        suffixIcon: _searchCtrl.text.isEmpty
                            ? null
                            : IconButton(
                                icon: const Icon(Icons.clear),
                                onPressed: () {
                                  _searchCtrl.clear();
                                  setState(() {});
                                },
                              ),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Badge(
                    isLabelVisible:
                        _statusFilter != 'all' || _caseTypeFilter != 'all',
                    child: PopupMenuButton<String>(
                      tooltip: 'Filters',
                      icon: const Icon(Icons.tune),
                      onSelected: (value) {
                        final parts = value.split(':');
                        if (parts.length != 2) return;
                        setState(() {
                          if (parts.first == 'status') {
                            _statusFilter = parts.last;
                          } else if (parts.first == 'type') {
                            _caseTypeFilter = parts.last;
                          } else {
                            _statusFilter = 'all';
                            _caseTypeFilter = 'all';
                          }
                        });
                      },
                      itemBuilder: (context) => [
                        const PopupMenuItem<String>(
                          enabled: false,
                          child: Text('Status'),
                        ),
                        ...[
                          ('all', 'All'),
                          ('active', 'Active'),
                          ('inactive', 'Inactive'),
                          ('finalized', 'Finalized'),
                        ].map((option) => CheckedPopupMenuItem<String>(
                              value: 'status:${option.$1}',
                              checked: _statusFilter == option.$1,
                              child: Text(option.$2),
                            )),
                        const PopupMenuDivider(),
                        const PopupMenuItem<String>(
                          enabled: false,
                          child: Text('Case type'),
                        ),
                        ...[
                          ('all', 'All types'),
                          ('education', 'Education'),
                          ('sickness', 'Medical Emergencies'),
                          ('death', 'Funeral Contributions'),
                        ].map((option) => CheckedPopupMenuItem<String>(
                              value: 'type:${option.$1}',
                              checked: _caseTypeFilter == option.$1,
                              child: Text(option.$2),
                            )),
                        const PopupMenuDivider(),
                        const PopupMenuItem<String>(
                          value: 'reset:all',
                          child: Text('Reset filters'),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                'Total ${rows.length} • Active $activeCount • Inactive $inactiveCount • Finalized $finalizedCount',
                style: const TextStyle(color: Color(0xFF64748B)),
              ),
              const SizedBox(height: 14),
              if (filtered.isEmpty)
                const Padding(
                  padding: EdgeInsets.all(20),
                  child: Center(child: Text('No cases match current filters.')),
                )
              else
                ListView.separated(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: filtered.length,
                  separatorBuilder: (context, index) =>
                      const Divider(height: 1),
                  itemBuilder: (context, index) {
                    final r = filtered[index];
                    final isFinalized = r['is_finalized'] == true;
                    final isActive = r['is_active'] == true;
                    final contribution =
                        _toDouble(r['contribution_per_member']);
                    final caseType =
                        (r['case_type'] ?? 'unknown').toString().toLowerCase();

                    return ListTile(
                      dense: true,
                      visualDensity: const VisualDensity(vertical: -3),
                      minVerticalPadding: 0,
                      contentPadding: EdgeInsets.zero,
                      onTap: () => context.push('/admin/cases/${r['id']}'),
                      title: Row(
                        children: [
                          Text(
                            '#${r['case_number'] ?? '-'}',
                            style: const TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 14,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Flexible(child: _caseTypeBadge(caseType)),
                          if (isFinalized) ...[
                            const SizedBox(width: 6),
                            _statusBadge(isFinalized, isActive),
                          ],
                        ],
                      ),
                      subtitle: Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Wrap(
                          spacing: 8,
                          runSpacing: 4,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          children: [
                            if (!isFinalized)
                              _statusBadge(isFinalized, isActive),
                            if (contribution > 0)
                              Text(
                                '${money.format(contribution)} per member',
                                style: const TextStyle(
                                  color: Color(0xFF64748B),
                                  fontSize: 12,
                                ),
                              ),
                          ],
                        ),
                      ),
                      trailing: FilledButton.tonal(
                        onPressed: () => _toggleCase(r),
                        style: FilledButton.styleFrom(
                          minimumSize: const Size(72, 34),
                          visualDensity: VisualDensity.compact,
                          padding: const EdgeInsets.symmetric(horizontal: 10),
                        ),
                        child: Text(isFinalized ? 'Reopen' : 'Close'),
                      ),
                    );
                  },
                ),
            ],
          );
        },
      ),
    );
  }

  Widget _caseTypeBadge(String caseType) {
    Color fg;
    Color bg;
    switch (caseType) {
      case 'education':
        fg = const Color(0xFF1E40AF);
        bg = const Color(0xFFDBEAFE);
        break;
      case 'sickness':
        fg = const Color(0xFFB91C1C);
        bg = const Color(0xFFFEE2E2);
        break;
      case 'death':
        fg = const Color(0xFF7C3AED);
        bg = const Color(0xFFEDE9FE);
        break;
      default:
        fg = const Color(0xFF334155);
        bg = const Color(0xFFF1F5F9);
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        switch (caseType) {
          'education' => 'EDUCATION',
          'sickness' => 'MEDICAL EMERGENCIES',
          'death' => 'DEATH',
          _ => caseType.replaceAll('_', ' ').toUpperCase(),
        },
        style: TextStyle(
          color: fg,
          fontSize: 11,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }

  Widget _statusBadge(bool isFinalized, bool isActive) {
    String label;
    Color fg;
    Color bg;
    if (isFinalized) {
      label = 'FINALIZED';
      fg = const Color(0xFF166534);
      bg = const Color(0xFFDCFCE7);
    } else if (isActive) {
      label = 'ACTIVE';
      fg = const Color(0xFF1E40AF);
      bg = const Color(0xFFDBEAFE);
    } else {
      label = 'INACTIVE';
      fg = const Color(0xFF9A3412);
      bg = const Color(0xFFFFEDD5);
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: fg,
          fontSize: 11,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }

  double _toDouble(dynamic value) {
    if (value == null) return 0;
    if (value is num) return value.toDouble();
    return double.tryParse(value.toString()) ?? 0;
  }
}
