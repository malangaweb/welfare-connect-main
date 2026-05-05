import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/services/live_data_service.dart';
import '../auth/auth_controller.dart';
import 'admin_shell.dart';

class AdminSettingsScreen extends ConsumerStatefulWidget {
  const AdminSettingsScreen({super.key});

  @override
  ConsumerState<AdminSettingsScreen> createState() => _AdminSettingsScreenState();
}

class _AdminSettingsScreenState extends ConsumerState<AdminSettingsScreen> {
  final _service = LiveDataService();
  final _formKey = GlobalKey<FormState>();

  final _orgName = TextEditingController();
  final _orgPhone = TextEditingController();
  final _orgEmail = TextEditingController();
  final _paybill = TextEditingController();
  final _registrationFee = TextEditingController();
  final _renewalFee = TextEditingController();
  final _penaltyAmount = TextEditingController();

  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final token = ref.read(authControllerProvider).appToken;
    if (token == null || token.isEmpty) {
      setState(() => _loading = false);
      return;
    }
    try {
      final s = await _service.fetchSettings(appToken: token);
      if (s != null) {
        _orgName.text = (s['organization_name'] ?? '').toString();
        _orgPhone.text = (s['organization_phone'] ?? '').toString();
        _orgEmail.text = (s['organization_email'] ?? '').toString();
        _paybill.text = (s['paybill_number'] ?? '').toString();
        _registrationFee.text = (s['registration_fee'] ?? '').toString();
        _renewalFee.text = (s['renewal_fee'] ?? '').toString();
        _penaltyAmount.text = (s['penalty_amount'] ?? '').toString();
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    final token = ref.read(authControllerProvider).appToken;
    if (token == null || token.isEmpty) return;

    try {
      await _service.updateSettings(appToken: token, settings: {
        'organization_name': _orgName.text.trim(),
        'organization_phone': _orgPhone.text.trim(),
        'organization_email': _orgEmail.text.trim(),
        'paybill_number': _paybill.text.trim(),
        'registration_fee': double.tryParse(_registrationFee.text.trim()) ?? 0,
        'renewal_fee': double.tryParse(_renewalFee.text.trim()) ?? 0,
        'penalty_amount': double.tryParse(_penaltyAmount.text.trim()) ?? 0,
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Settings updated.')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to update settings: $e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return AdminShell(
      title: 'Settings',
      currentIndex: 0,
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'System Settings',
                      style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                            fontWeight: FontWeight.w800,
                          ),
                    ),
                    const SizedBox(height: 14),
                    Card(
                      elevation: 0,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(18),
                        side: const BorderSide(color: Color(0xFFE2E8F0)),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          children: [
                            TextFormField(controller: _orgName, decoration: const InputDecoration(labelText: 'Organization name')),
                            const SizedBox(height: 12),
                            TextFormField(controller: _orgPhone, decoration: const InputDecoration(labelText: 'Organization phone')),
                            const SizedBox(height: 12),
                            TextFormField(controller: _orgEmail, decoration: const InputDecoration(labelText: 'Organization email')),
                            const SizedBox(height: 12),
                            TextFormField(controller: _paybill, decoration: const InputDecoration(labelText: 'Paybill number')),
                            const SizedBox(height: 12),
                            TextFormField(controller: _registrationFee, decoration: const InputDecoration(labelText: 'Registration fee')),
                            const SizedBox(height: 12),
                            TextFormField(controller: _renewalFee, decoration: const InputDecoration(labelText: 'Renewal fee')),
                            const SizedBox(height: 12),
                            TextFormField(controller: _penaltyAmount, decoration: const InputDecoration(labelText: 'Penalty amount')),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: _save,
                        child: const Text('Save settings'),
                      ),
                    ),
                  ],
                ),
              ),
            ),
    );
  }
}
