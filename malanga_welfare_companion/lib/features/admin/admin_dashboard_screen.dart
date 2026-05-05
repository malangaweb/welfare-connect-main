import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/services/live_data_service.dart';
import '../../core/theme/app_colors.dart';

class AdminDashboardScreen extends StatefulWidget {
  const AdminDashboardScreen({super.key});

  @override
  State<AdminDashboardScreen> createState() => _AdminDashboardScreenState();
}

class _AdminDashboardScreenState extends State<AdminDashboardScreen> {
  final _service = LiveDataService();
  late Future<AdminDashboardSnapshot> _future;

  @override
  void initState() {
    super.initState();
    _future = _service.fetchAdminDashboard();
  }

  @override
  Widget build(BuildContext context) {
    final money = NumberFormat.currency(
        locale: 'en_KE', symbol: 'KES ', decimalDigits: 2);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Admin Dashboard'),
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            onPressed: () =>
                setState(() => _future = _service.fetchAdminDashboard()),
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
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
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _StatCard(title: 'Total Members', value: '${data.totalMembers}'),
              _StatCard(title: 'Active Cases', value: '${data.activeCases}'),
              _StatCard(
                  title: 'Pending Suspense',
                  value: money.format(data.pendingSuspenseTotal)),
              _StatCard(
                  title: 'Suspense Items',
                  value: '${data.pendingSuspenseCount}'),
              const SizedBox(height: 16),
              const Text('Recent Activity',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              ...data.recentActivity.map((a) {
                final createdAt = DateTime.tryParse('${a['created_at']}');
                return Card(
                  child: ListTile(
                    title: Text(
                        '${a['description'] ?? a['transaction_type'] ?? 'Activity'}'),
                    subtitle: Text(createdAt == null
                        ? '-'
                        : DateFormat('MMM d, yyyy • h:mm a')
                            .format(createdAt.toLocal())),
                    trailing: Text(
                        money.format((a['amount'] as num?)?.toDouble() ?? 0)),
                  ),
                );
              }),
            ],
          );
        },
      ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: 0,
        onTap: (index) {
          if (index == 0) context.go('/admin/dashboard');
          if (index == 1) context.go('/admin/suspense-queue');
        },
        items: const [
          BottomNavigationBarItem(
              icon: Icon(Icons.dashboard), label: 'Dashboard'),
          BottomNavigationBarItem(
              icon: Icon(Icons.pending_actions), label: 'Suspense'),
        ],
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final String title;
  final String value;

  const _StatCard({required this.title, required this.value});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        title: Text(title),
        trailing:
            Text(value, style: const TextStyle(fontWeight: FontWeight.w700)),
      ),
    );
  }
}
