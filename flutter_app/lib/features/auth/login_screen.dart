import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'auth_controller.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  bool isAdmin = true;
  bool loading = false;
  final usernameCtrl = TextEditingController();
  final passwordCtrl = TextEditingController();
  final memberNoCtrl = TextEditingController();
  final phoneCtrl = TextEditingController();

  @override
  void dispose() {
    usernameCtrl.dispose();
    passwordCtrl.dispose();
    memberNoCtrl.dispose();
    phoneCtrl.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    setState(() => loading = true);
    try {
      final auth = ref.read(authControllerProvider);
      if (isAdmin) {
        await auth.loginAdmin(
          username: usernameCtrl.text.trim(),
          password: passwordCtrl.text,
        );
      } else {
        await auth.loginMember(
          memberNumber: memberNoCtrl.text.trim(),
          phoneNumber: phoneCtrl.text.trim(),
        );
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString())),
      );
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;

    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFFEAD9C7), Color(0xFFEFEDE8), Color(0xFFDDE8D0)],
          ),
        ),
        child: SafeArea(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
            children: [
              Container(
                height: 230,
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(32),
                  gradient: const LinearGradient(
                    colors: [Color(0xFF476B3A), Color(0xFF72995A), Color(0xFFC89245)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  boxShadow: const [
                    BoxShadow(color: Color(0x2D000000), blurRadius: 32, offset: Offset(0, 14)),
                  ],
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Spacer(),
                    Text(
                      'Malanga Welfare',
                      style: textTheme.headlineMedium?.copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Effortless member and admin finance workflows.',
                      style: textTheme.bodyLarge?.copyWith(color: Colors.white.withValues(alpha: 0.92)),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),
              Container(
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.9),
                  borderRadius: BorderRadius.circular(28),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Sign in',
                      style: textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 14),
                    SegmentedButton<bool>(
                      segments: const [
                        ButtonSegment(value: true, label: Text('Admin')),
                        ButtonSegment(value: false, label: Text('Member')),
                      ],
                      selected: {isAdmin},
                      onSelectionChanged: (s) => setState(() => isAdmin = s.first),
                      showSelectedIcon: false,
                    ),
                    const SizedBox(height: 16),
                    if (isAdmin) ...[
                      TextField(controller: usernameCtrl, decoration: const InputDecoration(labelText: 'Username')),
                      const SizedBox(height: 10),
                      TextField(
                        controller: passwordCtrl,
                        decoration: const InputDecoration(labelText: 'Password'),
                        obscureText: true,
                      ),
                    ] else ...[
                      TextField(controller: memberNoCtrl, decoration: const InputDecoration(labelText: 'Member Number')),
                      const SizedBox(height: 10),
                      TextField(controller: phoneCtrl, decoration: const InputDecoration(labelText: 'Phone Number')),
                    ],
                    const SizedBox(height: 16),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: loading ? null : submit,
                        style: FilledButton.styleFrom(
                          backgroundColor: const Color(0xFF151311),
                          foregroundColor: Colors.white,
                          minimumSize: const Size.fromHeight(54),
                        ),
                        child: Text(loading ? 'Please wait...' : 'Get started'),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
