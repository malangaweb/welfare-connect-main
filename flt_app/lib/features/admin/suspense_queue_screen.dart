import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/constants/app_constants.dart';
import '../../core/services/live_data_service.dart';
import '../auth/auth_controller.dart';
import 'admin_shell.dart';

class SuspenseQueueScreen extends ConsumerStatefulWidget {
  const SuspenseQueueScreen({super.key});

  @override
  ConsumerState<SuspenseQueueScreen> createState() => _SuspenseQueueScreenState();
}

class _SuspenseQueueScreenState extends ConsumerState<SuspenseQueueScreen> {
  final _service = LiveDataService();
  late Future<List<Map<String, dynamic>>> _future;

  @override
  void initState() {
    super.initState();
    _future = _loadQueue();
  }

  Future<List<Map<String, dynamic>>> _loadQueue() {
    final appToken = ref.read(authControllerProvider).appToken;
    return _service.fetchSuspenseQueue(appToken: appToken);
  }

  Future<void> _refresh() async {
    setState(() => _future = _loadQueue());
    await _future;
  }

  Future<void> _autoMatch() async {
    try {
      await _service.autoMatchSuspense();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Auto-match completed.')),
      );
      await _refresh();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Auto-match failed: $e')));
    }
  }

  Future<void> _setStatus(String id, String status) async {
    try {
      await _service.markSuspenseStatus(suspenseId: id, status: status);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Marked as $status.')),
      );
      await _refresh();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Failed: $e')));
    }
  }

  Future<void> _manualMatch(Map<String, dynamic> item) async {
    final appToken = ref.read(authControllerProvider).appToken;
    if (appToken == null || appToken.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Missing app token. Re-login required.')),
      );
      return;
    }

    final controller = TextEditingController();
    String? selectedMemberId;
    final results = ValueNotifier<List<Map<String, dynamic>>>(const []);

    await showDialog<void>(
      context: context,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setLocal) => AlertDialog(
            title: const Text('Manual Match'),
            content: SizedBox(
              width: 420,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(
                    controller: controller,
                    decoration: const InputDecoration(
                      labelText: 'Search member',
                      hintText: 'name or member number',
                      prefixIcon: Icon(Icons.search),
                    ),
                    onChanged: (q) async {
                      if (q.trim().isEmpty) {
                        results.value = const [];
                        return;
                      }
                      final list = await _service.searchMembers(
                        query: q,
                        excludeMemberId: '00000000-0000-0000-0000-000000000000',
                      );
                      results.value = list;
                    },
                  ),
                  const SizedBox(height: 12),
                  ValueListenableBuilder<List<Map<String, dynamic>>>(
                    valueListenable: results,
                    builder: (_, list, __) {
                      if (list.isEmpty) {
                        return const Padding(
                          padding: EdgeInsets.symmetric(vertical: 18),
                          child: Text('No members found'),
                        );
                      }
                      return SizedBox(
                        height: 220,
                        child: ListView.builder(
                          itemCount: list.length,
                          itemBuilder: (_, i) {
                            final m = list[i];
                            final id = (m['id'] ?? '').toString();
                            final selected = selectedMemberId == id;
                            return ListTile(
                              onTap: () {
                                selectedMemberId = id;
                                setLocal(() {});
                              },
                              leading: Icon(
                                selected
                                    ? Icons.check_circle
                                    : Icons.circle_outlined,
                                color: selected
                                    ? const Color(0xFF1F3556)
                                    : const Color(0xFF64748B),
                              ),
                              title: Text('${m['name'] ?? '-'}'),
                              subtitle: Text('${m['member_number'] ?? '-'}'),
                            );
                          },
                        ),
                      );
                    },
                  ),
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('Cancel'),
              ),
              ElevatedButton(
                onPressed: selectedMemberId == null
                    ? null
                    : () async {
                        final messenger = ScaffoldMessenger.of(context);
                        final navigator = Navigator.of(ctx);
                        try {
                          await _service.matchSuspenseWithMember(
                            appToken: appToken,
                            suspenseId: (item['id'] ?? '').toString(),
                            memberId: selectedMemberId!,
                            caseId: item['intended_case_id']?.toString(),
                          );
                          if (!mounted) return;
                          navigator.pop();
                          messenger.showSnackBar(
                            const SnackBar(content: Text('Transaction matched.')),
                          );
                          await _refresh();
                        } catch (e) {
                          if (!mounted) return;
                          messenger.showSnackBar(
                            SnackBar(content: Text('Match failed: $e')),
                          );
                        }
                      },
                child: const Text('Match'),
              ),
            ],
          ),
        );
      },
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
      title: 'Suspense Queue',
      currentIndex: 4,
      actions: [
        IconButton(onPressed: _refresh, icon: const Icon(Icons.refresh)),
        IconButton(onPressed: _autoMatch, icon: const Icon(Icons.auto_fix_high)),
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

          final items = snapshot.data ?? const [];
          final total = items.fold<double>(0, (s, e) {
            final amount = (e['amount'] as num?)?.toDouble() ??
                double.tryParse('${e['amount']}') ??
                0;
            return s + amount;
          });

          return ListView(
            padding: const EdgeInsets.all(AppConstants.marginEdge),
            children: [
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: const Color(0xFF1F3556),
                  borderRadius: BorderRadius.circular(18),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Pending Suspense',
                      style: TextStyle(
                        color: Colors.white70,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      money.format(total),
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                        fontSize: 24,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      '${items.length} items awaiting review',
                      style: const TextStyle(color: Color(0xFFBFDBFE)),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              if (items.isEmpty)
                const Card(
                  child: Padding(
                    padding: EdgeInsets.all(20),
                    child: Center(child: Text('No pending suspense transactions.')),
                  ),
                )
              else
                ...items.map((row) {
                  final date = DateTime.tryParse('${row['transaction_date']}');
                  final amount = (row['amount'] as num?)?.toDouble() ??
                      double.tryParse('${row['amount']}') ??
                      0;
                  return Card(
                    margin: const EdgeInsets.only(bottom: 10),
                    elevation: 0,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                      side: const BorderSide(color: Color(0xFFE2E8F0)),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(14),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              const Icon(Icons.phone_iphone, size: 18),
                              const SizedBox(width: 6),
                              Expanded(
                                child: Text(
                                  '${row['phone_number'] ?? '-'}',
                                  style: const TextStyle(fontWeight: FontWeight.w700),
                                ),
                              ),
                              Text(
                                money.format(amount),
                                style: const TextStyle(fontWeight: FontWeight.w800),
                              ),
                            ],
                          ),
                          const SizedBox(height: 6),
                          Text(
                            '${row['reference'] ?? row['mpesa_receipt_number'] ?? '-'}',
                            style: const TextStyle(
                              color: Color(0xFF1E293B),
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            date == null
                                ? '-'
                                : DateFormat('MMM d, yyyy • h:mm a')
                                    .format(date.toLocal()),
                            style: const TextStyle(color: Color(0xFF64748B)),
                          ),
                          const SizedBox(height: 10),
                          Wrap(
                            spacing: 8,
                            runSpacing: 6,
                            children: [
                              OutlinedButton.icon(
                                onPressed: () => _setStatus(
                                  (row['id'] ?? '').toString(),
                                  'ignored',
                                ),
                                icon: const Icon(Icons.block, size: 16),
                                label: const Text('Ignore'),
                              ),
                              OutlinedButton.icon(
                                onPressed: () => _setStatus(
                                  (row['id'] ?? '').toString(),
                                  'reversed',
                                ),
                                icon: const Icon(Icons.undo, size: 16),
                                label: const Text('Reverse'),
                              ),
                              FilledButton.icon(
                                onPressed: () => _manualMatch(row),
                                icon: const Icon(Icons.person_search, size: 16),
                                label: const Text('Manual Match'),
                              ),
                            ],
                          )
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
