import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/constants/app_constants.dart';
import '../../core/services/live_data_service.dart';
import 'admin_shell.dart';

class AdminCasesScreen extends StatefulWidget {
  const AdminCasesScreen({super.key});

  @override
  State<AdminCasesScreen> createState() => _AdminCasesScreenState();
}

class _AdminCasesScreenState extends State<AdminCasesScreen> {
  final _service = LiveDataService();
  late Future<List<Map<String, dynamic>>> _future;
  String _statusFilter = 'all';

  @override
  void initState() {
    super.initState();
    _future = _service.fetchAdminCases();
  }

  Future<void> _refresh() async {
    setState(() => _future = _service.fetchAdminCases());
    await _future;
  }

  Future<void> _toggleCase(Map<String, dynamic> row) async {
    final caseId = (row['id'] ?? '').toString();
    if (caseId.isEmpty) return;

    try {
      if (row['is_finalized'] == true) {
        await _service.reopenCase(caseId: caseId);
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Case reopened successfully.')),
        );
      } else {
        final amount = (row['actual_amount'] as num?)?.toDouble() ??
            (row['expected_amount'] as num?)?.toDouble() ??
            0;
        await _service.finalizeCase(caseId: caseId, actualAmount: amount);
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

  @override
  Widget build(BuildContext context) {
    final money = NumberFormat.currency(
      locale: 'en_KE',
      symbol: 'KES ',
      decimalDigits: 2,
    );
    return AdminShell(
      title: 'Cases',
      currentIndex: 2,
      actions: [
        IconButton(onPressed: _refresh, icon: const Icon(Icons.refresh))
      ],
      body: FutureBuilder<List<Map<String, dynamic>>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(child: Text(snapshot.error.toString()));
          }
          final rows = snapshot.data ?? const [];
          final filtered = rows.where((r) {
            final isFinalized = r['is_finalized'] == true;
            final isActive = r['is_active'] == true;
            if (_statusFilter == 'all') return true;
            if (_statusFilter == 'finalized') return isFinalized;
            if (_statusFilter == 'active') return isActive && !isFinalized;
            if (_statusFilter == 'draft') return !isActive && !isFinalized;
            return true;
          }).toList();
          final finalizedCount = rows.where((r) => r['is_finalized'] == true).length;
          final activeCount = rows.where((r) => r['is_active'] == true && r['is_finalized'] != true).length;
          final draftCount = rows.where((r) => r['is_active'] != true && r['is_finalized'] != true).length;
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
                'Total ${rows.length} • Active $activeCount • Draft $draftCount • Finalized $finalizedCount',
                style: const TextStyle(color: Color(0xFF64748B)),
              ),
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                initialValue: _statusFilter,
                decoration: const InputDecoration(
                  labelText: 'Filter',
                  border: OutlineInputBorder(),
                ),
                items: const [
                  DropdownMenuItem(value: 'all', child: Text('All')),
                  DropdownMenuItem(value: 'active', child: Text('Active')),
                  DropdownMenuItem(value: 'draft', child: Text('Draft')),
                  DropdownMenuItem(value: 'finalized', child: Text('Finalized')),
                ],
                onChanged: (v) => setState(() => _statusFilter = v ?? 'all'),
              ),
              const SizedBox(height: 14),
              ...filtered.map((r) {
                final isFinalized = r['is_finalized'] == true;
                final isActive = r['is_active'] == true;
                return InkWell(
                  onTap: () => context.go('/admin/cases/${r['id']}'),
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    decoration: const BoxDecoration(
                      border: Border(
                        bottom: BorderSide(color: Color(0xFFE2E8F0)),
                      ),
                    ),
                    child: Row(
                        children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '#${r['case_number'] ?? '-'} • ${(r['case_type'] ?? '-').toString().toUpperCase()}',
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 15,
                                ),
                              ),
                              const SizedBox(height: 5),
                              Text(
                                'Contribution: ${money.format((r['contribution_per_member'] as num?)?.toDouble() ?? 0)}',
                                style: const TextStyle(
                                  color: Color(0xFF475569),
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                isFinalized
                                    ? 'Status: Finalized'
                                    : (isActive ? 'Status: Active' : 'Status: Draft'),
                                style: const TextStyle(
                                  fontWeight: FontWeight.w600,
                                  color: Color(0xFF334155),
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        FilledButton.tonal(
                          onPressed: () => _toggleCase(r),
                          child: Text(isFinalized ? 'Reopen' : 'Finalize'),
                        ),
                        ],
                    ),
                  ),
                );
              }),
            ],
          );
        },
      ),
    );
  }
}
