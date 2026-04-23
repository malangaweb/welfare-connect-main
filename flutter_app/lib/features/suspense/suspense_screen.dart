import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/app_api_client.dart';

class SuspenseScreen extends ConsumerStatefulWidget {
  const SuspenseScreen({super.key});

  @override
  ConsumerState<SuspenseScreen> createState() => _SuspenseScreenState();
}

class _SuspenseScreenState extends ConsumerState<SuspenseScreen> {
  late Future<List<Map<String, dynamic>>> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<List<Map<String, dynamic>>> _load() async {
    final data = await ref.read(appApiClientProvider).get('api-suspense-list');
    return ((data['transactions'] as List?) ?? []).map((e) => (e as Map).cast<String, dynamic>()).toList();
  }

  Future<void> _match(Map<String, dynamic> row) async {
    final memberIdCtrl = TextEditingController();
    final caseIdCtrl = TextEditingController();
    await showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Match suspense'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: memberIdCtrl, decoration: const InputDecoration(labelText: 'Member ID')),
            const SizedBox(height: 8),
            TextField(controller: caseIdCtrl, decoration: const InputDecoration(labelText: 'Case ID (optional)')),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          FilledButton(
            onPressed: () async {
              await ref.read(appApiClientProvider).post('api-suspense-match', {
                'suspense_id': row['id'],
                'member_id': memberIdCtrl.text.trim(),
                'case_id': caseIdCtrl.text.trim().isEmpty ? null : caseIdCtrl.text.trim(),
              });
              if (!mounted) return;
              Navigator.pop(context);
              setState(() => _future = _load());
            },
            child: const Text('Match'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<Map<String, dynamic>>>(
      future: _future,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snap.hasError) return Center(child: Text('Suspense error: ${snap.error}'));
        final rows = snap.data ?? [];

        return ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 20),
          children: [
            Text(
              'Suspense Queue',
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 12),
            ...rows.map(
              (r) => Card(
                margin: const EdgeInsets.only(bottom: 12),
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${r['mpesa_receipt_number']}  •  KES ${r['amount']}',
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 6),
                      Text('${r['phone_number']} • ${r['reference'] ?? ''}'),
                      const SizedBox(height: 10),
                      Align(
                        alignment: Alignment.centerRight,
                        child: FilledButton.tonal(
                          onPressed: () => _match(r),
                          child: const Text('Match'),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            if (rows.isEmpty)
              const Card(
                child: Padding(
                  padding: EdgeInsets.all(16),
                  child: Text('No suspense transactions at the moment.'),
                ),
              ),
          ],
        );
      },
    );
  }
}
