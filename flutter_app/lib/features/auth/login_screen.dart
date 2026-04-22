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
    return Scaffold(
      appBar: AppBar(title: const Text("Malanga Companion Login")),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            SegmentedButton<bool>(
              segments: const [
                ButtonSegment(value: true, label: Text("Admin")),
                ButtonSegment(value: false, label: Text("Member")),
              ],
              selected: {isAdmin},
              onSelectionChanged: (s) => setState(() => isAdmin = s.first),
            ),
            const SizedBox(height: 16),
            if (isAdmin) ...[
              TextField(controller: usernameCtrl, decoration: const InputDecoration(labelText: "Username")),
              TextField(controller: passwordCtrl, decoration: const InputDecoration(labelText: "Password"), obscureText: true),
            ] else ...[
              TextField(controller: memberNoCtrl, decoration: const InputDecoration(labelText: "Member Number")),
              TextField(controller: phoneCtrl, decoration: const InputDecoration(labelText: "Phone Number")),
            ],
            const SizedBox(height: 16),
            FilledButton(
              onPressed: loading ? null : submit,
              child: Text(loading ? "Please wait..." : "Login"),
            ),
          ],
        ),
      ),
    );
  }
}
