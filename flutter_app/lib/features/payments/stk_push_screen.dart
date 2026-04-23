import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/session_controller.dart';
import '../../core/network/app_api_client.dart';
import '../../core/providers.dart';

class StkPushScreen extends ConsumerStatefulWidget {
  const StkPushScreen({super.key});

  @override
  ConsumerState<StkPushScreen> createState() => _StkPushScreenState();
}

class _StkPushScreenState extends ConsumerState<StkPushScreen> {
  final phoneCtrl = TextEditingController();
  final amountCtrl = TextEditingController();
  final accountRefCtrl = TextEditingController();
  bool loading = false;

  @override
  void dispose() {
    phoneCtrl.dispose();
    amountCtrl.dispose();
    accountRefCtrl.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    setState(() => loading = true);
    final memberId = ref.read(sessionControllerProvider).memberId;
    final payload = {
      'phone': phoneCtrl.text.trim(),
      'amount': num.tryParse(amountCtrl.text.trim()) ?? 0,
      'accountReference': accountRefCtrl.text.trim(),
      'memberId': memberId,
      'transactionDesc': 'Flutter STK Push',
    };

    try {
      await ref.read(appApiClientProvider).post('api-stk-push', payload);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('STK Push initiated')));
    } catch (_) {
      await ref.read(cacheRepositoryProvider).enqueueOutbox('api-stk-push', payload);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Offline/failed. Request queued for retry.')),
      );
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 20),
      children: [
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(28),
            gradient: const LinearGradient(
              colors: [Color(0xFFC38741), Color(0xFFDCB17C), Color(0xFFF0E3D2)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
          ),
          child: const Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Quick Payment', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700)),
              SizedBox(height: 6),
              Text('Initiate STK push and fallback to outbox when offline.'),
            ],
          ),
        ),
        const SizedBox(height: 14),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                TextField(controller: phoneCtrl, decoration: const InputDecoration(labelText: 'Phone')),
                const SizedBox(height: 10),
                TextField(controller: amountCtrl, decoration: const InputDecoration(labelText: 'Amount')),
                const SizedBox(height: 10),
                TextField(controller: accountRefCtrl, decoration: const InputDecoration(labelText: 'Account Reference')),
                const SizedBox(height: 18),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: loading ? null : submit,
                    style: FilledButton.styleFrom(
                      backgroundColor: const Color(0xFF151311),
                      foregroundColor: Colors.white,
                      minimumSize: const Size.fromHeight(52),
                    ),
                    child: Text(loading ? 'Submitting...' : 'Initiate STK Push'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
