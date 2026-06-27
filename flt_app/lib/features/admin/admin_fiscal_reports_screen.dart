import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/services/live_data_service.dart';
import '../../core/services/export_service.dart';
import '../auth/auth_controller.dart';
import 'admin_shell.dart';

class AdminFiscalReportsScreen extends ConsumerStatefulWidget {
  const AdminFiscalReportsScreen({super.key});

  @override
  ConsumerState<AdminFiscalReportsScreen> createState() =>
      _AdminFiscalReportsScreenState();
}

class _AdminFiscalReportsScreenState
    extends ConsumerState<AdminFiscalReportsScreen> {
  final LiveDataService _service = LiveDataService();
  final NumberFormat _money = NumberFormat.currency(locale: 'en_KE', symbol: 'KES ');

  late Future<Map<String, dynamic>> _statsFuture;
  late Future<List<Map<String, dynamic>>> _contributionsFuture;
  late Future<List<Map<String, dynamic>>> _caseFundingFuture;
  late Future<List<Map<String, dynamic>>> _memberContributionsFuture;

  int _currentTab = 0;
  String _contribSearch = '';
  String _caseSearch = '';
  String _memberSearch = '';
  String _contribTypeFilter = 'all';
  String _caseStatusFilter = 'all';

  @override
  void initState() {
    super.initState();
    _loadAll();
  }

  void _loadAll() {
    final token = ref.read(authControllerProvider).appToken;
    if (token == null || token.isEmpty) return;
    setState(() {
      _statsFuture = _service.fetchFiscalStats(appToken: token);
      _contributionsFuture = _service.fetchFiscalContributions(
        appToken: token,
        filters: {'type': _contribTypeFilter, 'search': _contribSearch},
      );
      _caseFundingFuture = _service.fetchCaseFundingSummary(
        appToken: token,
        filters: {'status': _caseStatusFilter, 'search': _caseSearch},
      );
      _memberContributionsFuture = _service.fetchMemberContributionsReport(
        appToken: token,
        filters: {'search': _memberSearch},
      );
    });
  }

  Future<void> _refresh() async {
    _loadAll();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return AdminShell(
      title: 'Fiscal Reports',
      route: '/admin/fiscal-reports',
      actions: [
        IconButton(onPressed: _refresh, icon: const Icon(Icons.refresh)),
      ],
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Fiscal Reports',
                  style: theme.textTheme.headlineSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                ),
                const SizedBox(height: 6),
                const Text(
                  'Contributions, case funding, and member wallets.',
                  style: TextStyle(
                    color: Color(0xFF64748B),
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(height: 16),
                FutureBuilder<Map<String, dynamic>>(
                  future: _statsFuture,
                  builder: (context, snapshot) {
                    if (snapshot.connectionState == ConnectionState.waiting) {
                      return const SizedBox(
                        height: 100,
                        child: Center(child: CircularProgressIndicator()),
                      );
                    }
                    if (snapshot.hasError) {
                      return const SizedBox(
                        height: 100,
                        child: Center(child: Text('Unable to load stats')),
                      );
                    }
                    final data = snapshot.data ?? const {};
                    return _StatsRow(
                      totalContributions: _money.format(
                        _toDouble(data['total_contributions']),
                      ),
                      activeMembers: '${data['active_members'] ?? 0}',
                      activeCases: '${data['active_cases'] ?? 0}',
                      defaulters: '${data['defaulters'] ?? 0}',
                    );
                  },
                ),
                const SizedBox(height: 16),
                _TabBar(
                  currentIndex: _currentTab,
                  onChanged: (i) => setState(() => _currentTab = i),
                ),
                const SizedBox(height: 16),
                Expanded(
                  child: _TabContent(
                    tabIndex: _currentTab,
                    contributionsFuture: _contributionsFuture,
                    caseFundingFuture: _caseFundingFuture,
                    memberContributionsFuture: _memberContributionsFuture,
                    contribSearch: _contribSearch,
                    caseSearch: _caseSearch,
                    memberSearch: _memberSearch,
                    contribTypeFilter: _contribTypeFilter,
                    caseStatusFilter: _caseStatusFilter,
                    onContribSearchChanged: (v) => setState(() => _contribSearch = v),
                    onCaseSearchChanged: (v) => setState(() => _caseSearch = v),
                    onMemberSearchChanged: (v) => setState(() => _memberSearch = v),
                    onContribTypeChanged: (v) =>
                        setState(() => _contribTypeFilter = v ?? 'all'),
                    onCaseStatusChanged: (v) =>
                        setState(() => _caseStatusFilter = v ?? 'all'),
                    onRefresh: _loadAll,
                    money: _money,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  double _toDouble(dynamic v) {
    if (v == null) return 0;
    if (v is num) return v.toDouble();
    return double.tryParse(v.toString()) ?? 0;
  }
}

class _StatsRow extends StatelessWidget {
  final String totalContributions;
  final String activeMembers;
  final String activeCases;
  final String defaulters;

  const _StatsRow({
    required this.totalContributions,
    required this.activeMembers,
    required this.activeCases,
    required this.defaulters,
  });

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        if (constraints.maxWidth < 600) {
          return Column(
            children: [
              _StatCard(title: 'Total Contributions', value: totalContributions, icon: Icons.payments),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(child: _StatCard(title: 'Active Members', value: activeMembers, icon: Icons.group)),
                  const SizedBox(width: 12),
                  Expanded(child: _StatCard(title: 'Active Cases', value: activeCases, icon: Icons.assignment_turned_in)),
                ],
              ),
              const SizedBox(height: 12),
              _StatCard(title: 'Defaulters', value: defaulters, icon: Icons.warning_amber_rounded, fullWidth: true),
            ],
          );
        }
        return Row(
          children: [
            Expanded(child: _StatCard(title: 'Total Contributions', value: totalContributions, icon: Icons.payments)),
            const SizedBox(width: 12),
            Expanded(child: _StatCard(title: 'Active Members', value: activeMembers, icon: Icons.group)),
            const SizedBox(width: 12),
            Expanded(child: _StatCard(title: 'Active Cases', value: activeCases, icon: Icons.assignment_turned_in)),
            const SizedBox(width: 12),
            Expanded(child: _StatCard(title: 'Defaulters', value: defaulters, icon: Icons.warning_amber_rounded)),
          ],
        );
      },
    );
  }
}

class _StatCard extends StatelessWidget {
  final String title;
  final String value;
  final IconData icon;
  final bool fullWidth;

  const _StatCard({
    required this.title,
    required this.value,
    required this.icon,
    this.fullWidth = false,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: fullWidth ? double.infinity : null,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: const Color(0xFFEFF6FF),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, size: 18, color: const Color(0xFF1F3556)),
          ),
          const SizedBox(height: 10),
          Text(value, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
          const SizedBox(height: 4),
          Text(
            title,
            style: const TextStyle(color: Color(0xFF64748B), fontWeight: FontWeight.w600),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}

class _TabBar extends StatelessWidget {
  final int currentIndex;
  final ValueChanged<int> onChanged;

  const _TabBar({required this.currentIndex, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final tabs = const [
      Text('Contributions Analysis'),
      Text('Case Funding'),
      Text('Member Contributions'),
    ];
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: List.generate(tabs.length, (i) {
          final selected = i == currentIndex;
          return Padding(
            padding: const EdgeInsets.only(right: 8),
            child: ChoiceChip(
              selected: selected,
              onSelected: (_) => onChanged(i),
              label: tabs[i],
              selectedColor: const Color(0xFF1F3556),
              labelStyle: TextStyle(
                color: selected ? Colors.white : const Color(0xFF1F3556),
                fontWeight: FontWeight.w600,
              ),
            ),
          );
        }),
      ),
    );
  }
}

class _TabContent extends StatelessWidget {
  final int tabIndex;
  final Future<List<Map<String, dynamic>>> contributionsFuture;
  final Future<List<Map<String, dynamic>>> caseFundingFuture;
  final Future<List<Map<String, dynamic>>> memberContributionsFuture;
  final String contribSearch;
  final String caseSearch;
  final String memberSearch;
  final String contribTypeFilter;
  final String caseStatusFilter;
  final ValueChanged<String> onContribSearchChanged;
  final ValueChanged<String> onCaseSearchChanged;
  final ValueChanged<String> onMemberSearchChanged;
  final ValueChanged<String?> onContribTypeChanged;
  final ValueChanged<String?> onCaseStatusChanged;
  final VoidCallback onRefresh;
  final NumberFormat money;

  const _TabContent({
    required this.tabIndex,
    required this.contributionsFuture,
    required this.caseFundingFuture,
    required this.memberContributionsFuture,
    required this.contribSearch,
    required this.caseSearch,
    required this.memberSearch,
    required this.contribTypeFilter,
    required this.caseStatusFilter,
    required this.onContribSearchChanged,
    required this.onCaseSearchChanged,
    required this.onMemberSearchChanged,
    required this.onContribTypeChanged,
    required this.onCaseStatusChanged,
    required this.onRefresh,
    required this.money,
  });

  @override
  Widget build(BuildContext context) {
    switch (tabIndex) {
      case 0:
        return _ContributionsAnalysisTab(
          future: contributionsFuture,
          search: contribSearch,
          typeFilter: contribTypeFilter,
          onSearchChanged: onContribSearchChanged,
          onTypeChanged: onContribTypeChanged,
          onRefresh: onRefresh,
          money: money,
        );
      case 1:
        return _CaseFundingTab(
          future: caseFundingFuture,
          search: caseSearch,
          statusFilter: caseStatusFilter,
          onSearchChanged: onCaseSearchChanged,
          onStatusChanged: onCaseStatusChanged,
          onRefresh: onRefresh,
          money: money,
        );
      case 2:
        return _MemberContributionsTab(
          future: memberContributionsFuture,
          search: memberSearch,
          onSearchChanged: onMemberSearchChanged,
          onRefresh: onRefresh,
          money: money,
        );
      default:
        return const SizedBox.shrink();
    }
  }
}

class _ContributionsAnalysisTab extends StatefulWidget {
  final Future<List<Map<String, dynamic>>> future;
  final String search;
  final String typeFilter;
  final ValueChanged<String> onSearchChanged;
  final ValueChanged<String?> onTypeChanged;
  final VoidCallback onRefresh;
  final NumberFormat money;

  const _ContributionsAnalysisTab({
    required this.future,
    required this.search,
    required this.typeFilter,
    required this.onSearchChanged,
    required this.onTypeChanged,
    required this.onRefresh,
    required this.money,
  });

  @override
  State<_ContributionsAnalysisTab> createState() => _ContributionsAnalysisTabState();
}

class _ContributionsAnalysisTabState extends State<_ContributionsAnalysisTab> {
  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: TextField(
                onChanged: widget.onSearchChanged,
                decoration: const InputDecoration(
                  isDense: true,
                  hintText: 'Search transactions...',
                  prefixIcon: Icon(Icons.search),
                ),
              ),
            ),
            const SizedBox(width: 8),
            DropdownButton<String>(
              value: widget.typeFilter,
              isDense: true,
              items: const [
                DropdownMenuItem(value: 'all', child: Text('All Types')),
                DropdownMenuItem(value: 'contribution', child: Text('Contribution')),
                DropdownMenuItem(value: 'arrears', child: Text('Arrears')),
                DropdownMenuItem(value: 'penalty', child: Text('Penalty')),
                DropdownMenuItem(value: 'disbursement', child: Text('Disbursement')),
              ],
              onChanged: widget.onTypeChanged,
            ),
            const SizedBox(width: 8),
            _ExportButton(
              label: 'CSV',
              onPressed: () async {
                final messenger = ScaffoldMessenger.of(context);
                final csv = _buildCsv(await widget.future);
                await Clipboard.setData(ClipboardData(text: csv));
                if (!mounted) return;
                messenger.showSnackBar(
                  const SnackBar(content: Text('CSV copied to clipboard')),
                );
              },
            ),
            const SizedBox(width: 8),
            _ExportButton(
              label: 'Excel',
              onPressed: () async {
                final rows = await widget.future;
                final headers = ['created_at', 'member_name', 'transaction_type', 'case_number', 'amount'];
                final excelBytes = await generateExcelFile(
                  title: 'Contributions',
                  headers: headers,
                  rows: rows.map((r) => headers.map((h) => r[h]).toList()).toList(),
                );
                await shareFile(title: 'contributions', bytes: excelBytes, ext: 'xlsx');
              },
            ),
            const SizedBox(width: 8),
            _ExportButton(
              label: 'PDF',
              onPressed: () async {
                final rows = await widget.future;
                final headers = ['Date', 'Member', 'Type', 'Case', 'Amount'];
                final pdfBytes = await generatePdfFile(
                  title: 'Contributions Report',
                  headers: headers,
                  rows: rows.map((r) => [
                    (r['created_at'] ?? '-').toString().substring(0, 10),
                    r['member_name'] ?? '-',
                    r['transaction_type'] ?? '-',
                    r['case_number'] ?? '-',
                    widget.money.format(_toDouble(r['amount']).abs()),
                  ]).toList(),
                  money: widget.money,
                );
                await shareFile(title: 'contributions', bytes: pdfBytes, ext: 'pdf');
              },
            ),
          ],
        ),
        const SizedBox(height: 12),
        Expanded(
          child: FutureBuilder<List<Map<String, dynamic>>>(
            future: widget.future,
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const Center(child: CircularProgressIndicator());
              }
              if (snapshot.hasError) {
                return Center(child: Text('Failed: ${snapshot.error}'));
              }
              final rows = snapshot.data ?? const <Map<String, dynamic>>[];
              final filtered = rows.where((r) {
                final hay = '${r['member_name'] ?? ''} ${r['transaction_type'] ?? ''} ${r['case_number'] ?? ''} ${r['created_at'] ?? ''}';
                if (widget.search.isNotEmpty && !hay.toLowerCase().contains(widget.search.toLowerCase())) {
                  return false;
                }
                final type = '${r['transaction_type'] ?? ''}';
                if (widget.typeFilter != 'all' && type != widget.typeFilter) return false;
                return true;
              }).toList();

              return SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: DataTable(
                  columns: const [
                    DataColumn(label: Text('Date')),
                    DataColumn(label: Text('Member')),
                    DataColumn(label: Text('Type')),
                    DataColumn(label: Text('Case')),
                    DataColumn(label: Text('Amount'), numeric: true),
                  ],
                  rows: filtered.map((r) {
                    final amount = _toDouble(r['amount']);
                    return DataRow(cells: [
                      DataCell(Text('${r['created_at'] ?? '-'}'.substring(0, 10))),
                      DataCell(Text('${r['member_name'] ?? '-'}')),
                      DataCell(Text('${r['transaction_type'] ?? '-'}')),
                      DataCell(Text('${r['case_number'] ?? '-'}')),
                      DataCell(Text(widget.money.format(amount.abs()))),
                    ]);
                  }).toList(),
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  String _buildCsv(List<Map<String, dynamic>> rows) {
    final headers = ['created_at', 'member_name', 'transaction_type', 'case_number', 'amount'];
    final lines = <String>[headers.join(',')];
    for (final r in rows) {
      final values = headers.map((h) {
        final raw = '${r[h] ?? ''}'.replaceAll('"', '""');
        return '"$raw"';
      }).join(',');
      lines.add(values);
    }
    return lines.join('\n');
  }

  double _toDouble(dynamic v) {
    if (v == null) return 0;
    if (v is num) return v.toDouble();
    return double.tryParse(v.toString()) ?? 0;
  }
}

class _CaseFundingTab extends StatefulWidget {
  final Future<List<Map<String, dynamic>>> future;
  final String search;
  final String statusFilter;
  final ValueChanged<String> onSearchChanged;
  final ValueChanged<String?> onStatusChanged;
  final VoidCallback onRefresh;
  final NumberFormat money;

  const _CaseFundingTab({
    required this.future,
    required this.search,
    required this.statusFilter,
    required this.onSearchChanged,
    required this.onStatusChanged,
    required this.onRefresh,
    required this.money,
  });

  @override
  State<_CaseFundingTab> createState() => _CaseFundingTabState();
}

class _CaseFundingTabState extends State<_CaseFundingTab> {
  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: TextField(
                onChanged: widget.onSearchChanged,
                decoration: const InputDecoration(
                  isDense: true,
                  hintText: 'Search cases...',
                  prefixIcon: Icon(Icons.search),
                ),
              ),
            ),
            const SizedBox(width: 8),
            DropdownButton<String>(
              value: widget.statusFilter,
              isDense: true,
              items: const [
                DropdownMenuItem(value: 'all', child: Text('All Status')),
                DropdownMenuItem(value: 'active', child: Text('Active')),
                DropdownMenuItem(value: 'finalized', child: Text('Finalized')),
                DropdownMenuItem(value: 'underfunded', child: Text('Underfunded')),
              ],
              onChanged: widget.onStatusChanged,
            ),
            const SizedBox(width: 8),
            _ExportButton(
              label: 'CSV',
              onPressed: () async {
                final messenger = ScaffoldMessenger.of(context);
                final csv = _buildCsv(await widget.future);
                await Clipboard.setData(ClipboardData(text: csv));
                if (!mounted) return;
                messenger.showSnackBar(
                  const SnackBar(content: Text('CSV copied to clipboard')),
                );
              },
            ),
          ],
        ),
        const SizedBox(height: 12),
        Expanded(
          child: FutureBuilder<List<Map<String, dynamic>>>(
            future: widget.future,
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const Center(child: CircularProgressIndicator());
              }
              if (snapshot.hasError) {
                return Center(child: Text('Failed: ${snapshot.error}'));
              }
              final rows = snapshot.data ?? const [];
              final filtered = rows.where((r) {
                final hay = '${r['case_number'] ?? ''} ${r['case_type'] ?? ''} ${r['status'] ?? ''}';
                if (widget.search.isNotEmpty && !hay.toLowerCase().contains(widget.search.toLowerCase())) {
                  return false;
                }
                if (widget.statusFilter != 'all' && '${r['status'] ?? ''}' != widget.statusFilter) {
                  return false;
                }
                return true;
              }).toList();

              if (filtered.isEmpty) {
                return const Center(child: Text('No cases found.'));
              }

              return SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: DataTable(
                  columns: const [
                    DataColumn(label: Text('Case')),
                    DataColumn(label: Text('Type')),
                    DataColumn(label: Text('Expected')),
                    DataColumn(label: Text('Raised')),
                    DataColumn(label: Text('Variance')),
                    DataColumn(label: Text('Status')),
                  ],
                  rows: filtered.map((r) {
                    final expected = _toDouble(r['expected_amount']);
                    final raised = _toDouble(r['actual_amount']);
                    final variance = raised - expected;
                    final status = '${r['status'] ?? ''}';
                    Color statusColor = Colors.grey;
                    if (status == 'active') statusColor = Colors.green;
                    if (status == 'finalized') statusColor = Colors.blue;
                    if (status == 'underfunded') statusColor = Colors.orange;

                    return DataRow(cells: [
                      DataCell(Text('${r['case_number'] ?? '-'}')),
                      DataCell(Text('${r['case_type'] ?? '-'}')),
                      DataCell(Text(widget.money.format(expected))),
                      DataCell(Text(widget.money.format(raised))),
                      DataCell(Text(widget.money.format(variance))),
                      DataCell(Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: statusColor.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          status.toUpperCase(),
                          style: TextStyle(color: statusColor, fontWeight: FontWeight.w700, fontSize: 11),
                        ),
                      )),
                    ]);
                  }).toList(),
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  String _buildCsv(List<Map<String, dynamic>> rows) {
    final headers = ['case_number', 'case_type', 'expected_amount', 'actual_amount', 'status'];
    final lines = <String>[headers.join(',')];
    for (final r in rows) {
      final values = headers.map((h) {
        final raw = '${r[h] ?? ''}'.replaceAll('"', '""');
        return '"$raw"';
      }).join(',');
      lines.add(values);
    }
    return lines.join('\n');
  }

  double _toDouble(dynamic v) {
    if (v == null) return 0;
    if (v is num) return v.toDouble();
    return double.tryParse(v.toString()) ?? 0;
  }
}

class _MemberContributionsTab extends StatefulWidget {
  final Future<List<Map<String, dynamic>>> future;
  final String search;
  final ValueChanged<String> onSearchChanged;
  final VoidCallback onRefresh;
  final NumberFormat money;

  const _MemberContributionsTab({
    required this.future,
    required this.search,
    required this.onSearchChanged,
    required this.onRefresh,
    required this.money,
  });

  @override
  State<_MemberContributionsTab> createState() => _MemberContributionsTabState();
}

class _MemberContributionsTabState extends State<_MemberContributionsTab> {
  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: TextField(
                onChanged: widget.onSearchChanged,
                decoration: const InputDecoration(
                  isDense: true,
                  hintText: 'Search members...',
                  prefixIcon: Icon(Icons.search),
                ),
              ),
            ),
            const SizedBox(width: 8),
            _ExportButton(
              label: 'CSV',
              onPressed: () async {
                final messenger = ScaffoldMessenger.of(context);
                final csv = _buildCsv(await widget.future);
                await Clipboard.setData(ClipboardData(text: csv));
                if (!mounted) return;
                messenger.showSnackBar(
                  const SnackBar(content: Text('CSV copied to clipboard')),
                );
              },
            ),
          ],
        ),
        const SizedBox(height: 12),
        Expanded(
          child: FutureBuilder<List<Map<String, dynamic>>>(
            future: widget.future,
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const Center(child: CircularProgressIndicator());
              }
              if (snapshot.hasError) {
                return Center(child: Text('Failed: ${snapshot.error}'));
              }
              final rows = snapshot.data ?? const [];
              final filtered = rows.where((r) {
                final hay = '${r['member_name'] ?? ''} ${r['member_number'] ?? ''}';
                if (widget.search.isNotEmpty && !hay.toLowerCase().contains(widget.search.toLowerCase())) {
                  return false;
                }
                return true;
              }).toList();

              if (filtered.isEmpty) {
                return const Center(child: Text('No member contributions found.'));
              }

              return SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: DataTable(
                  columns: const [
                    DataColumn(label: Text('Member')),
                    DataColumn(label: Text('Number')),
                    DataColumn(label: Text('Contributions')),
                    DataColumn(label: Text('Total')),
                    DataColumn(label: Text('Disbursements')),
                    DataColumn(label: Text('Wallet')),
                  ],
                  rows: filtered.map((r) {
                    return DataRow(cells: [
                      DataCell(Text('${r['member_name'] ?? '-'}')),
                      DataCell(Text('${r['member_number'] ?? '-'}')),
                      DataCell(Text('${r['contributions_count'] ?? 0}')),
                      DataCell(Text(widget.money.format(_toDouble(r['contributions_total'])))),
                      DataCell(Text('${r['disbursements_count'] ?? 0}')),
                      DataCell(Text(widget.money.format(_toDouble(r['wallet_balance'])))),
                    ]);
                  }).toList(),
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  String _buildCsv(List<Map<String, dynamic>> rows) {
    final headers = ['member_name', 'member_number', 'contributions_count', 'contributions_total', 'disbursements_count', 'wallet_balance'];
    final lines = <String>[headers.join(',')];
    for (final r in rows) {
      final values = headers.map((h) {
        final raw = '${r[h] ?? ''}'.replaceAll('"', '""');
        return '"$raw"';
      }).join(',');
      lines.add(values);
    }
    return lines.join('\n');
  }

  double _toDouble(dynamic v) {
    if (v == null) return 0;
    if (v is num) return v.toDouble();
    return double.tryParse(v.toString()) ?? 0;
  }
}

class _ExportButton extends StatelessWidget {
  final String label;
  final VoidCallback onPressed;

  const _ExportButton({required this.label, required this.onPressed});

  @override
  Widget build(BuildContext context) {
    return OutlinedButton.icon(
      onPressed: onPressed,
      icon: const Icon(Icons.file_download, size: 18),
      label: Text(label),
    );
  }
}
