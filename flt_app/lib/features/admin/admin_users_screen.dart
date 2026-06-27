import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/services/live_data_service.dart';
import '../auth/auth_controller.dart';
import 'admin_shell.dart';

class AdminUsersScreen extends ConsumerStatefulWidget {
  const AdminUsersScreen({super.key});

  @override
  ConsumerState<AdminUsersScreen> createState() => _AdminUsersScreenState();
}

class _AdminUsersScreenState extends ConsumerState<AdminUsersScreen> {
  final LiveDataService _service = LiveDataService();
  static const _roles = <String>[
    'super_admin',
    'chairperson',
    'treasurer',
    'secretary',
    'member',
  ];
  bool _busy = false;
  bool _createBusy = false;
  late Future<List<Map<String, dynamic>>> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<List<Map<String, dynamic>>> _load() async {
    final token = ref.read(authControllerProvider).appToken;
    if (token == null || token.isEmpty) throw Exception('Missing session token');
    return _service.fetchAdminUsers(appToken: token);
  }

  Future<void> _toggleActive(Map<String, dynamic> row) async {
    if (_busy) return;
    final token = ref.read(authControllerProvider).appToken;
    if (token == null || token.isEmpty) return;
    final userId = '${row['id'] ?? ''}';
    if (userId.isEmpty) return;
    final current = row['is_active'] == true;
    setState(() => _busy = true);
    try {
      await _service.updateAdminUserStatus(
        appToken: token,
        userId: userId,
        isActive: !current,
      );
      setState(() => _future = _load());
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Status update failed: $e')),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _changeRole(Map<String, dynamic> row) async {
    final token = ref.read(authControllerProvider).appToken;
    if (_busy || token == null || token.isEmpty) return;
    final userId = '${row['id'] ?? ''}';
    if (userId.isEmpty) return;
    final currentRole = '${row['role'] ?? ''}'.toLowerCase();
    var selected = _roles.contains(currentRole) ? currentRole : _roles.first;

    final next = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Update User Role'),
        content: StatefulBuilder(
          builder: (ctx, setLocal) => DropdownButtonFormField<String>(
            initialValue: selected,
            items: _roles
                .map((r) => DropdownMenuItem(
                      value: r,
                      child: Text(r.toUpperCase()),
                    ))
                .toList(),
            onChanged: (v) {
              if (v == null) return;
              setLocal(() => selected = v);
            },
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, selected),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    if (next == null || next == currentRole) return;

    setState(() => _busy = true);
    try {
      await _service.updateAdminUserRole(
        appToken: token,
        userId: userId,
        role: next,
      );
      setState(() => _future = _load());
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('User role updated.')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Role update failed: $e')),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _resetPassword(Map<String, dynamic> row) async {
    final token = ref.read(authControllerProvider).appToken;
    if (_busy || token == null || token.isEmpty) return;
    final userId = '${row['id'] ?? ''}';
    if (userId.isEmpty) return;

    setState(() => _busy = true);
    try {
      final temporaryPassword = await _service.resetAdminUserPassword(
        appToken: token,
        userId: userId,
      );
      if (!mounted) return;
      showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Password Reset'),
          content: Text(
            temporaryPassword == null || temporaryPassword.isEmpty
                ? 'Password reset completed.'
                : 'Temporary password:\n$temporaryPassword',
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('OK')),
          ],
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Password reset failed: $e')),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _openCreateUserDialog() async {
    final token = ref.read(authControllerProvider).appToken;
    if (token == null || token.isEmpty || _createBusy) return;

    final usernameCtrl = TextEditingController();
    final nameCtrl = TextEditingController();
    final emailCtrl = TextEditingController();
    final memberIdCtrl = TextEditingController();
    final passwordCtrl = TextEditingController();
    var isActive = true;
    var role = _roles.first;

    final shouldCreate = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) => AlertDialog(
          title: const Text('Create Admin User'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: usernameCtrl,
                  decoration: const InputDecoration(labelText: 'Username*'),
                ),
                TextField(
                  controller: nameCtrl,
                  decoration: const InputDecoration(labelText: 'Name*'),
                ),
                TextField(
                  controller: passwordCtrl,
                  decoration: const InputDecoration(labelText: 'Password*'),
                  obscureText: true,
                ),
                TextField(
                  controller: emailCtrl,
                  decoration: const InputDecoration(labelText: 'Email'),
                ),
                TextField(
                  controller: memberIdCtrl,
                  decoration: const InputDecoration(labelText: 'Linked Member ID'),
                ),
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(
                  initialValue: role,
                  items: _roles
                      .map((r) => DropdownMenuItem(
                            value: r,
                            child: Text(r.toUpperCase()),
                          ))
                      .toList(),
                  onChanged: (v) {
                    if (v == null) return;
                    setLocal(() => role = v);
                  },
                  decoration: const InputDecoration(labelText: 'Role'),
                ),
                SwitchListTile(
                  value: isActive,
                  onChanged: (v) => setLocal(() => isActive = v),
                  title: const Text('Active'),
                  contentPadding: EdgeInsets.zero,
                ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Create')),
          ],
        ),
      ),
    );

    if (shouldCreate != true) return;
    final username = usernameCtrl.text.trim();
    final name = nameCtrl.text.trim();
    final password = passwordCtrl.text;
    final email = emailCtrl.text.trim();
    final memberId = memberIdCtrl.text.trim();

    if (username.isEmpty || name.isEmpty || password.length < 6) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Username, Name and Password(>=6) are required.')),
      );
      return;
    }

    setState(() => _createBusy = true);
    try {
      await _service.createAdminUser(
        appToken: token,
        username: username,
        name: name,
        password: password,
        role: role,
        email: email.isEmpty ? null : email,
        memberId: memberId.isEmpty ? null : memberId,
        isActive: isActive,
      );
      setState(() => _future = _load());
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('User created successfully.')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Create user failed: $e')),
      );
    } finally {
      if (mounted) setState(() => _createBusy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AdminShell(
      title: 'Users',
      route: '/admin/users',
      actions: [
        IconButton(
          tooltip: 'Create User',
          onPressed: _createBusy ? null : _openCreateUserDialog,
          icon: const Icon(Icons.person_add),
        ),
      ],
      body: FutureBuilder<List<Map<String, dynamic>>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(child: Text('Failed to load users: ${snapshot.error}'));
          }
          final rows = snapshot.data ?? const <Map<String, dynamic>>[];
          if (rows.isEmpty) {
            return const Center(child: Text('No admin users found.'));
          }
          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: rows.length,
            itemBuilder: (_, i) {
              final r = rows[i];
              final name = '${r['name'] ?? r['username'] ?? '-'}';
              final role = '${r['role'] ?? '-'}';
              final active = r['is_active'] == true;
              return Card(
                child: ListTile(
                  title: Text(name),
                  subtitle: Text('${r['username'] ?? '-'} • ${role.toUpperCase()}'),
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      PopupMenuButton<String>(
                        enabled: !_busy,
                        onSelected: (v) {
                          if (v == 'role') _changeRole(r);
                          if (v == 'reset') _resetPassword(r);
                        },
                        itemBuilder: (_) => const [
                          PopupMenuItem(
                            value: 'role',
                            child: Text('Change Role'),
                          ),
                          PopupMenuItem(
                            value: 'reset',
                            child: Text('Reset Password'),
                          ),
                        ],
                      ),
                      Switch(
                        value: active,
                        onChanged: _busy ? null : (_) => _toggleActive(r),
                      ),
                    ],
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }
}
