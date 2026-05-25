import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../features/auth/auth_controller.dart';

class NotificationBell extends ConsumerStatefulWidget {
  const NotificationBell({super.key});

  @override
  ConsumerState<NotificationBell> createState() => _NotificationBellState();
}

class _NotificationBellState extends ConsumerState<NotificationBell> {
  int _unreadCount = 0;
  List<Map<String, dynamic>> _items = const [];
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final auth = ref.read(authControllerProvider);
    final token = auth.appToken;
    if (token == null || token.isEmpty) return;

    setState(() => _loading = true);
    try {
      final response = await Supabase.instance.client.functions.invoke(
        'api-notifications-list',
        body: {'limit': 20},
        headers: {'x-app-token': token},
      );
      final payload = response.data;
      if (payload is Map<String, dynamic>) {
        final rows = (payload['notifications'] as List<dynamic>? ?? [])
            .whereType<Map<String, dynamic>>()
            .toList();
        if (!mounted) return;
        setState(() {
          _items = rows;
          _unreadCount = (payload['unread_count'] as num?)?.toInt() ?? 0;
        });
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _items = const [];
        _unreadCount = 0;
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _openSheet() async {
    await _load();
    if (!mounted) return;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (context) {
        return SafeArea(
          child: SizedBox(
            height: MediaQuery.of(context).size.height * 0.65,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Padding(
                  padding: EdgeInsets.fromLTRB(16, 16, 16, 8),
                  child: Text(
                    'Notifications',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
                  ),
                ),
                const Divider(height: 1),
                Expanded(
                  child: _items.isEmpty
                      ? const Center(
                          child: Text(
                            'No notifications',
                            style: TextStyle(color: Colors.black54),
                          ),
                        )
                      : ListView.separated(
                          itemCount: _items.length,
                          separatorBuilder: (_, __) => const Divider(height: 1),
                          itemBuilder: (context, index) {
                            final item = _items[index];
                            final createdAt = DateTime.tryParse(
                              item['created_at']?.toString() ?? '',
                            );
                            return ListTile(
                              dense: true,
                              title: Text(
                                item['title']?.toString() ?? 'Notification',
                                style: const TextStyle(fontWeight: FontWeight.w600),
                              ),
                              subtitle: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const SizedBox(height: 4),
                                  Text(item['message']?.toString() ?? ''),
                                  const SizedBox(height: 4),
                                  Text(
                                    createdAt?.toLocal().toString() ?? '',
                                    style: const TextStyle(fontSize: 11, color: Colors.black45),
                                  ),
                                ],
                              ),
                              trailing: item['is_read'] == true
                                  ? null
                                  : const Icon(Icons.fiber_manual_record, size: 10, color: Colors.redAccent),
                            );
                          },
                        ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        IconButton(
          onPressed: _loading ? null : _openSheet,
          icon: const Icon(Icons.notifications_outlined, color: Colors.white),
          tooltip: 'Notifications',
        ),
        if (_unreadCount > 0)
          Positioned(
            right: 6,
            top: 6,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
              decoration: BoxDecoration(
                color: Colors.red,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: Colors.white, width: 1),
              ),
              constraints: const BoxConstraints(minWidth: 16, minHeight: 14),
              child: Text(
                _unreadCount > 99 ? '99+' : '$_unreadCount',
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.w700),
              ),
            ),
          ),
      ],
    );
  }
}
