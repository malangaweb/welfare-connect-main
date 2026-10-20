import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:posthog_flutter/posthog_flutter.dart';

import '../../core/constants/app_constants.dart';
import '../../core/services/live_data_service.dart';
import '../../core/widgets/async_error_view.dart';
import 'admin_shell.dart';

class AdminCasesScreen extends StatefulWidget {
  const AdminCasesScreen({super.key});

  @override
  State<AdminCasesScreen> createState() => _AdminCasesScreenState();
}

class _AdminCasesScreenState extends State<AdminCasesScreen> {
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

  Future<List<Map<String, dynamic>>> _loadCases() =>
      _service.fetchAdminCases().timeout(const Duration(seconds: 20));

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _refresh() async {
    setState(() => _future = _loadCases());
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
      await _refresh();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Action failed: $e')),
      );
    }
  }

  Future<void> _showFilters() async {
    var status = _statusFilter;
    var caseType = _caseTypeFilter;

    await showModalBottomSheet<void>(
      context: context,
      useSafeArea: true,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (sheetContext) => StatefulBuilder(
        builder: (context, setSheetState) => Padding(
          padding: EdgeInsets.fromLTRB(
            20,
            8,
            20,
            20 + MediaQuery.viewInsetsOf(context).bottom,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Filter cases',
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                initialValue: status,
                isExpanded: true,
                decoration: const InputDecoration(
                  labelText: 'Status',
                  border: OutlineInputBorder(),
                ),
                items: const [
                  DropdownMenuItem(value: 'all', child: Text('All')),
                  DropdownMenuItem(value: 'active', child: Text('Active')),
                  DropdownMenuItem(value: 'inactive', child: Text('Inactive')),
                  DropdownMenuItem(
                      value: 'finalized', child: Text('Finalized')),
                ],
                onChanged: (value) =>
                    setSheetState(() => status = value ?? 'all'),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: caseType,
                isExpanded: true,
                decoration: const InputDecoration(
                  labelText: 'Case Type',
                  border: OutlineInputBorder(),
                ),
                items: const [
                  DropdownMenuItem(value: 'all', child: Text('All')),
                  DropdownMenuItem(
                      value: 'education', child: Text('Education')),
                  DropdownMenuItem(
                      value: 'sickness', child: Text('Medical Emergencies')),
                  DropdownMenuItem(
                      value: 'death', child: Text('Funeral Contributions')),
                ],
                onChanged: (value) =>
                    setSheetState(() => caseType = value ?? 'all'),
              ),
              const SizedBox(height: 20),
              Row(
                children: [
                  TextButton(
                    onPressed: () {
                      setState(() {
                        _statusFilter = 'all';
                        _caseTypeFilter = 'all';
                      });
                      Navigator.of(sheetContext).pop();
                    },
                    child: const Text('Reset'),
                  ),
                  const Spacer(),
                  FilledButton(
                    onPressed: () {
                      setState(() {
                        _statusFilter = status;
                        _caseTypeFilter = caseType;
                      });
                      Navigator.of(sheetContext).pop();
                    },
                    child: const Text('Apply filters'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
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
              Text(
                'Case Management',
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
              ),
              const SizedBox(height: 4),
              Text(
                'Total ${rows.length} • Active $activeCount • Inactive $inactiveCount • Finalized $finalizedCount',
                style: const TextStyle(color: Color(0xFF64748B)),
              ),
              const SizedBox(height: 10),
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
                    child: IconButton.filledTonal(
                      onPressed: _showFilters,
                      tooltip: 'Filters',
                      icon: const Icon(Icons.tune),
                    ),
                  ),
                ],
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
                      contentPadding: EdgeInsets.zero,
                      onTap: () => context.go('/admin/cases/${r['id']}'),
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
                        ],
                      ),
                      subtitle: Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Wrap(
                          spacing: 8,
                          runSpacing: 4,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          children: [
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
          'death' => 'FUNERAL CONTRIBUTIONS',
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
