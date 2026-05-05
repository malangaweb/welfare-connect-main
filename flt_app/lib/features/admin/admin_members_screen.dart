import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

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
    );
    _hasMore = rows.length == _pageSize;
    return rows;
  }

  Future<void> _refresh() async {
    setState(() => _future = _loadPage());
    await _future;
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
                '${rows.length} members • Page $_page',
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
              const SizedBox(height: 14),
              ...rows.map((r) {
                final active = r['is_active'] == true;
                final balance = (r['wallet_balance'] as num?)?.toDouble() ?? 0;
                return Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                    side: const BorderSide(color: Color(0xFFE2E8F0)),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(12),
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
}
