import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';

import '../../core/constants/app_constants.dart';
import '../../core/services/live_data_service.dart';
import 'admin_shell.dart';

class AdminMembersScreen extends StatefulWidget {
  const AdminMembersScreen({super.key});

  @override
  State<AdminMembersScreen> createState() => _AdminMembersScreenState();
}

class _AdminMembersScreenState extends State<AdminMembersScreen> {
  final _service = LiveDataService();
  final _searchCtrl = TextEditingController();
  static const _pageSize = 50;
  int _page = 1;
  bool _hasMore = false;
  String _search = '';
  String _statusFilter = 'all';
  String _activeFilter = 'all';
  late Future<List<Map<String, dynamic>>> _future;

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    _future = _loadPage();
  }

  Future<List<Map<String, dynamic>>> _loadPage() async {
    final rows = await _service.fetchAdminMembers(
      page: _page,
      pageSize: _pageSize,
      search: _search,
      status: _statusFilter,
      active: _activeFilter,
    );
    _hasMore = rows.length == _pageSize;
    return rows;
  }

  Future<void> _refresh() async {
    setState(() => _future = _loadPage());
    await _future;
  }

  Future<void> _exportFilteredMembers() async {
    try {
      final allRows = await _service.fetchAdminMembers(
        page: 1,
        pageSize: 5000,
        search: _search,
        status: _statusFilter,
        active: _activeFilter,
      );
      final now = DateTime.now();
      final filename =
          'members_export_${now.year}${now.month.toString().padLeft(2, '0')}${now.day.toString().padLeft(2, '0')}_${now.hour.toString().padLeft(2, '0')}${now.minute.toString().padLeft(2, '0')}.csv';
      allRows.sort((a, b) {
        final aNum = _memberNumberOrder((a['member_number'] ?? '').toString());
        final bNum = _memberNumberOrder((b['member_number'] ?? '').toString());
        final numCmp = aNum.compareTo(bNum);
        if (numCmp != 0) return numCmp;
        return (a['member_number'] ?? '')
            .toString()
            .compareTo((b['member_number'] ?? '').toString());
      });
      final lines = <String>[
        'member_number,name,phone_number,status,is_active,wallet_balance'
      ];
      for (final r in allRows) {
        final memberNumber = _csv('${r['member_number'] ?? ''}');
        final name = _csv('${r['name'] ?? ''}');
        final phone = _csv('${r['phone_number'] ?? ''}');
        final status = _csv('${r['status'] ?? ''}');
        final isActive = r['is_active'] == true ? 'TRUE' : 'FALSE';
        final wallet = _toDouble(r['wallet_balance']).toStringAsFixed(2);
        lines.add('$memberNumber,$name,$phone,$status,$isActive,$wallet');
      }
      final csv = lines.join('\n');
      final dir = await getApplicationDocumentsDirectory();
      final file = File('${dir.path}/$filename');
      await file.writeAsString(csv);
      await Clipboard.setData(ClipboardData(text: csv));
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Exported ${allRows.length} rows. Saved: ${file.path} (also copied to clipboard).',
          ),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Export failed: $e')),
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
      title: 'Members',
      currentIndex: 1,
      actions: [
        IconButton(onPressed: _refresh, icon: const Icon(Icons.refresh)),
        IconButton(
          onPressed: _exportFilteredMembers,
          icon: const Icon(Icons.download),
          tooltip: 'Export filtered members (CSV)',
        ),
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
          final sortedRows = [...rows];
          sortedRows.sort((a, b) {
            final aNum = _memberNumberOrder((a['member_number'] ?? '').toString());
            final bNum = _memberNumberOrder((b['member_number'] ?? '').toString());
            final numCmp = aNum.compareTo(bNum);
            if (numCmp != 0) return numCmp;
            return (a['member_number'] ?? '')
                .toString()
                .compareTo((b['member_number'] ?? '').toString());
          });
          return ListView(
            padding: const EdgeInsets.all(AppConstants.marginEdge),
            children: [
              Text(
                'Member Directory',
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
              ),
              const SizedBox(height: 6),
              const Text(
                'Admin / Members',
                style: TextStyle(
                  color: Color(0xFF64748B),
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                '${sortedRows.length} shown • Page $_page',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: const Color(0xFF64748B),
                    ),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _searchCtrl,
                decoration: InputDecoration(
                  hintText: 'Search member number, name, phone',
                  prefixIcon: const Icon(Icons.search),
                  suffixIcon: _search.isEmpty
                      ? null
                      : IconButton(
                          icon: const Icon(Icons.clear),
                          onPressed: () {
                            _searchCtrl.clear();
                            setState(() {
                              _search = '';
                              _page = 1;
                              _future = _loadPage();
                            });
                          },
                        ),
                ),
                onSubmitted: (value) {
                  setState(() {
                    _search = value.trim();
                    _page = 1;
                    _future = _loadPage();
                  });
                },
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: DropdownButtonFormField<String>(
                      initialValue: _activeFilter,
                      decoration: const InputDecoration(
                        labelText: 'Active Filter',
                        border: OutlineInputBorder(),
                      ),
                      items: const [
                        DropdownMenuItem(value: 'all', child: Text('All')),
                        DropdownMenuItem(value: 'active', child: Text('Active')),
                        DropdownMenuItem(value: 'inactive', child: Text('Inactive')),
                      ],
                      onChanged: (v) =>
                          setState(() {
                            _activeFilter = v ?? 'all';
                            _page = 1;
                            _future = _loadPage();
                          }),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: DropdownButtonFormField<String>(
                      initialValue: _statusFilter,
                      decoration: const InputDecoration(
                        labelText: 'Status Filter',
                        border: OutlineInputBorder(),
                      ),
                      items: const [
                        DropdownMenuItem(value: 'all', child: Text('All statuses')),
                        DropdownMenuItem(value: 'active', child: Text('ACTIVE')),
                        DropdownMenuItem(value: 'inactive', child: Text('INACTIVE')),
                        DropdownMenuItem(value: 'probation', child: Text('PROBATION')),
                        DropdownMenuItem(value: 'deceased', child: Text('DECEASED')),
                      ],
                      onChanged: (v) =>
                          setState(() {
                            _statusFilter = v ?? 'all';
                            _page = 1;
                            _future = _loadPage();
                          }),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              ...sortedRows.map((r) {
                final active = r['is_active'] == true;
                final balance = _toDouble(r['wallet_balance']);
                return InkWell(
                  onTap: () => context.go('/admin/members/${r['id']}'),
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    decoration: const BoxDecoration(
                      border: Border(
                        bottom: BorderSide(color: Color(0xFFE2E8F0)),
                      ),
                    ),
                    child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                        CircleAvatar(
                          radius: 20,
                          backgroundColor: const Color(0xFFE2E8F0),
                          foregroundColor: const Color(0xFF1F3556),
                          child: Text(
                            (r['name'] ?? '?').toString().trim().isEmpty
                                ? '?'
                                : (r['name']).toString().trim()[0].toUpperCase(),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '${r['name'] ?? '-'}',
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 15,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                '${r['member_number'] ?? '-'} • ${r['phone_number'] ?? '-'}',
                                style: const TextStyle(color: Color(0xFF64748B)),
                              ),
                              const SizedBox(height: 8),
                              Wrap(
                                spacing: 8,
                                children: [
                                  _chip(
                                    label: active ? 'Active' : 'Inactive',
                                    fg: active
                                        ? const Color(0xFF166534)
                                        : const Color(0xFF9A3412),
                                    bg: active
                                        ? const Color(0xFFDCFCE7)
                                        : const Color(0xFFFFEDD5),
                                  ),
                                  _chip(
                                    label: '${r['status'] ?? 'unknown'}',
                                    fg: const Color(0xFF334155),
                                    bg: const Color(0xFFF1F5F9),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                        Text(
                          money.format(balance),
                          style: const TextStyle(
                            fontWeight: FontWeight.w700,
                            color: Color(0xFF0F172A),
                          ),
                        ),
                        ],
                    ),
                  ),
                );
              }),
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  OutlinedButton(
                    onPressed: _page > 1
                        ? () {
                            setState(() {
                              _page -= 1;
                              _future = _loadPage();
                            });
                          }
                        : null,
                    child: const Text('Prev'),
                  ),
                  const SizedBox(width: 8),
                  OutlinedButton(
                    onPressed: _hasMore
                        ? () {
                            setState(() {
                              _page += 1;
                              _future = _loadPage();
                            });
                          }
                        : null,
                    child: const Text('Next'),
                  ),
                ],
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _chip({
    required String label,
    required Color fg,
    required Color bg,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
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

  String _csv(String input) {
    final escaped = input.replaceAll('"', '""');
    return '"$escaped"';
  }

  int _memberNumberOrder(String memberNumber) {
    final match = RegExp(r'\d+').firstMatch(memberNumber);
    if (match == null) return 1 << 30;
    return int.tryParse(match.group(0)!) ?? (1 << 30);
  }
}
