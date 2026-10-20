import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/services/live_data_service.dart';
import '../auth/auth_controller.dart';
import 'admin_shell.dart';

class AdminDashboardScreen extends ConsumerStatefulWidget {
  const AdminDashboardScreen({super.key});

  @override
  ConsumerState<AdminDashboardScreen> createState() =>
      _AdminDashboardScreenState();
}

class _AdminDashboardScreenState extends ConsumerState<AdminDashboardScreen> {
  final _service = LiveDataService();
  late Future<AdminDashboardSnapshot> _future;
  ProviderSubscription<AuthState>? _authSub;
  String? _lastToken;

  @override
  void initState() {
    super.initState();
    _lastToken = ref.read(authControllerProvider).appToken;
    _future = _loadDashboard();
    _authSub = ref.listenManual<AuthState>(authControllerProvider, (_, next) {
      final token = next.appToken;
      if (token == null || token.isEmpty || token == _lastToken) return;
      _lastToken = token;
      if (!mounted) return;
      setState(() => _future = _loadDashboard());
    });
  }

  @override
  void dispose() {
    _authSub?.close();
    super.dispose();
  }

  Future<void> _refresh() async {
    setState(() => _future = _loadDashboard(forceRefresh: true));
    await _future;
  }

  Future<AdminDashboardSnapshot> _loadDashboard({bool forceRefresh = false}) {
    final token = ref.read(authControllerProvider).appToken;
    return _service.fetchAdminDashboard(
      appToken: token,
      forceRefresh: forceRefresh,
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
      title: 'Admin Dashboard',
      route: '/admin/dashboard',
      actions: [
        IconButton(
          onPressed: () => context.go('/admin/settings'),
          icon: const Icon(Icons.settings),
        ),
        IconButton(onPressed: _refresh, icon: const Icon(Icons.refresh)),
      ],
      body: FutureBuilder<AdminDashboardSnapshot>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(child: Text(snapshot.error.toString()));
          }

          final data = snapshot.data!;
          final recentActivity = data.recentActivity.take(5).toList();
          return ListView(
            padding: const EdgeInsets.all(20),
            children: [
              Container(
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [Color(0xFF0F172A), Color(0xFF1F3556)],
                  ),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Expanded(
                          child: _overviewMetric(
                            label: 'Members',
                            value: '${data.totalMembers}',
                            valueSize: 30,
                          ),
                        ),
                        Expanded(
                          child: _overviewMetric(
                            label: 'Active cases',
                            value: '${data.activeCases}',
                            valueSize: 24,
                          ),
                        ),
                      ],
                    ),
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 12),
                      child: Divider(height: 1, color: Colors.white24),
                    ),
                    Row(
                      children: [
                        Expanded(
                          child: _overviewMetric(
                            label: 'Contributions',
                            value: money.format(data.totalContributions),
                            valueSize: 15,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: _overviewMetric(
                            label: 'Suspense total',
                            value: money.format(data.pendingSuspenseTotal),
                            valueSize: 15,
                            valueColor: const Color(0xFFBFDBFE),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              GridView.count(
                crossAxisCount: 3,
                shrinkWrap: true,
                crossAxisSpacing: 8,
                mainAxisSpacing: 4,
                physics: const NeverScrollableScrollPhysics(),
                childAspectRatio: 2.3,
                children: [
                  _StatTile(
                    title: 'Active',
                    value: '${data.activeMembers}',
                  ),
                  _StatTile(
                    title: 'Inactive',
                    value: '${data.inactiveMembers}',
                  ),
                  _StatTile(
                    title: 'Probation',
                    value: '${data.probationMembers}',
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Recent Activity',
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w800,
                        ),
                  ),
                  TextButton(
                    onPressed: () => context.go('/admin/transactions'),
                    child: const Text('View ledger'),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              if (recentActivity.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 16),
                  child: Text('No recent activity.'),
                )
              else
                ...recentActivity.asMap().entries.map(
                  (entry) {
                    final a = entry.value;
                    final createdAt = DateTime.tryParse('${a['created_at']}');
                    final amount = (a['amount'] as num?)?.toDouble() ?? 0;
                    return Column(
                      children: [
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          dense: true,
                          title: Text(
                            '${a['description'] ?? a['transaction_type'] ?? 'Activity'}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          subtitle: Text([
                            '${a['status'] ?? '-'}'.toUpperCase(),
                            createdAt == null
                                ? '-'
                                : DateFormat('MMM d, yyyy • h:mm a')
                                    .format(createdAt.toLocal()),
                          ].join(' • ')),
                          trailing: Text(
                            money.format(amount.abs()),
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                        ),
                        if (entry.key < recentActivity.length - 1)
                          const Divider(height: 1),
                      ],
                    );
                  },
                ),
            ],
          );
        },
      ),
    );
  }

  Widget _overviewMetric({
    required String label,
    required String value,
    required double valueSize,
    Color valueColor = Colors.white,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(
            color: Colors.white70,
            fontSize: 12,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 3),
        Text(
          value,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            color: valueColor,
            fontSize: valueSize,
            fontWeight: FontWeight.w800,
          ),
        ),
      ],
    );
  }
}

class _StatTile extends StatelessWidget {
  final String title;
  final String value;

  const _StatTile({
    required this.title,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.center,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            value,
            style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 2),
          Text(
            title,
            style: const TextStyle(
              color: Color(0xFF64748B),
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}
