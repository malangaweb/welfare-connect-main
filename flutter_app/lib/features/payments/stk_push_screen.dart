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
      "phone": phoneCtrl.text.trim(),
      "amount": num.tryParse(amountCtrl.text.trim()) ?? 0,
      "accountReference": accountRefCtrl.text.trim(),
      "memberId": memberId,
      "transactionDesc": "Flutter STK Push",
    };

    try {
      await ref.read(appApiClientProvider).post("api-stk-push", payload);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("STK Push initiated")));
    } catch (_) {
      await ref.read(cacheRepositoryProvider).enqueueOutbox("api-stk-push", payload);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Offline/failed. Request queued for retry.")),
      );
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          TextField(controller: phoneCtrl, decoration: const InputDecoration(labelText: "Phone")),
          TextField(controller: amountCtrl, decoration: const InputDecoration(labelText: "Amount")),
          TextField(controller: accountRefCtrl, decoration: const InputDecoration(labelText: "Account Reference")),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: loading ? null : submit,
            child: Text(loading ? "Submitting..." : "Initiate STK Push"),
          )
        ],
      ),
    );
  }
}
