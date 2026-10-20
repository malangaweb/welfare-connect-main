import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/constants/app_constants.dart';
import '../../core/services/live_data_service.dart';
import '../../core/widgets/async_error_view.dart';
import '../auth/auth_controller.dart';
import 'admin_shell.dart';

class AdminMembersScreen extends ConsumerStatefulWidget {
  const AdminMembersScreen({super.key});

  @override
  ConsumerState<AdminMembersScreen> createState() => _AdminMembersScreenState();
}

class _AdminMembersScreenState extends ConsumerState<AdminMembersScreen> {
  final _service = LiveDataService();
  final _searchCtrl = TextEditingController();
  static const _pageSize = 50;
  int _page = 1;
  bool _hasMore = false;
  bool _selectingAll = false;
  String _search = '';
  String _statusFilter = 'all';
  String _activeFilter = 'all';
  late Future<List<Map<String, dynamic>>> _future;

  final Set<String> _selectedMemberIds = {};

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    _future = _loadPage();
  }

  Future<List<Map<String, dynamic>>> _loadPage(
      {bool forceRefresh = false}) async {
    final token = ref.read(authControllerProvider).appToken ?? '';
    final rows = await _service
        .fetchAdminMembers(
          page: _page,
          pageSize: _pageSize,
          search: _search,
          status: _statusFilter,
          active: _activeFilter,
          appToken: token,
          forceRefresh: forceRefresh,
        )
        .timeout(const Duration(seconds: 20));
    _hasMore = rows.length == _pageSize;
    return rows;
  }

  Future<void> _refresh() async {
    setState(() {
      _selectedMemberIds.clear();
      _future = _loadPage(forceRefresh: true);
    });
    await _future;
  }

  void _setMemberFilters({String? activity, String? status}) {
    setState(() {
      if (activity != null) _activeFilter = activity;
      if (status != null) _statusFilter = status;
      _page = 1;
      _selectedMemberIds.clear();
      _future = _loadPage();
    });
  }

  Future<void> _messageSelectedMembers() async {
    final selectedIds = Set<String>.from(_selectedMemberIds);
    try {
      final recipients = await _service.fetchAllAdminMembers(
        search: _search,
        status: _statusFilter,
        active: _activeFilter,
      );
      final selectedRecipients = recipients
          .where(
              (member) => selectedIds.contains((member['id'] ?? '').toString()))
          .toList();
      if (selectedRecipients.isEmpty) return;
      await _composeMessage(selectedRecipients);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not load selected members: $e')),
        );
      }
    }
  }

  Future<void> _messageMember(Map<String, dynamic> member) =>
      _composeMessage([member]);

  Future<void> _toggleSelectAll(List<Map<String, dynamic>> members) async {
    if (_selectingAll) return;
    final visibleIds = members
        .map((member) => (member['id'] ?? '').toString())
        .where((id) => id.isNotEmpty)
        .toSet();
    final shouldDeselect =
        visibleIds.isNotEmpty && visibleIds.every(_selectedMemberIds.contains);

    setState(() => _selectingAll = true);
    try {
      final filteredMembers = await _service.fetchAllAdminMembers(
        search: _search,
        status: _statusFilter,
        active: _activeFilter,
      );
      final allIds = filteredMembers
          .map((member) => (member['id'] ?? '').toString())
          .where((id) => id.isNotEmpty)
          .toSet();
      if (!mounted) return;
      setState(() {
        if (shouldDeselect && visibleIds.containsAll(allIds)) {
          _selectedMemberIds.removeAll(allIds);
        } else if (shouldDeselect) {
          _selectedMemberIds.removeAll(visibleIds);
        } else {
          _selectedMemberIds.addAll(allIds);
        }
      });
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not select all members: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _selectingAll = false);
    }
  }

  Future<void> _composeMessage(List<Map<String, dynamic>> recipients) async {
    final phoneNumbers = recipients
        .map((member) => (member['phone_number'] ?? '').toString().trim())
        .where((phone) => phone.isNotEmpty)
        .toList();
    if (phoneNumbers.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
            content: Text('Selected members have no phone numbers.')),
      );
      return;
    }

    final message = await showDialog<String>(
      context: context,
      builder: (_) => _MemberMessageDialog(
        recipientCount: recipients.length,
      ),
    );

    if (message == null || message.trim().isEmpty || !mounted) return;

    await Share.share(
      'To: ${phoneNumbers.join(', ')}\n\n${message.trim()}',
      subject: 'Message to selected members',
    );
  }

  Future<void> _exportFilteredMembers() async {
    try {
      final filteredRows = await _service.fetchAllAdminMembers(
        search: _search,
        status: _statusFilter,
        active: _activeFilter,
      );
      final selectedIds = Set<String>.from(_selectedMemberIds);
      final allRows = selectedIds.isEmpty
          ? filteredRows
          : filteredRows
              .where((row) => selectedIds.contains('${row['id']}'))
              .toList();
      if (allRows.isEmpty) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No members match this export.')),
        );
        return;
      }
      final now = DateTime.now();
      final filename =
          'members_export_${now.year}${now.month.toString().padLeft(2, '0')}${now.day.toString().padLeft(2, '0')}_${now.hour.toString().padLeft(2, '0')}${now.minute.toString().padLeft(2, '0')}.csv';
      allRows.sort((a, b) {
        final aNum = _memberNumberOrder((a['member_number'] ?? '').toString());
        final bNum = _memberNumberOrder((b['member_number'] ?? '').toString());
        final numCmp = aNum.compareTo(bNum);
        if (numCmp != 0) return numCmp;
        return (a['member_number'] ?? '')
            .toString()
            .compareTo((b['member_number'] ?? '').toString());
      });
      final lines = <String>[
        'member_number,name,phone_number,status,is_active,wallet_balance'
      ];
      for (final r in allRows) {
        final memberNumber = _csv('${r['member_number'] ?? ''}');
        final name = _csv('${r['name'] ?? ''}');
        final phone = _csv('${r['phone_number'] ?? ''}');
        final status = _csv('${r['status'] ?? ''}');
        final isActive = r['is_active'] == true ? 'TRUE' : 'FALSE';
        final wallet = _toDouble(r['wallet_balance']).toStringAsFixed(2);
        lines.add('$memberNumber,$name,$phone,$status,$isActive,$wallet');
      }
      final csv = lines.join('\n');
      final dir = await getApplicationDocumentsDirectory();
      final file = File('${dir.path}/$filename');
      await file.writeAsString(csv);
      await Clipboard.setData(ClipboardData(text: csv));
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Exported ${allRows.length} rows. Saved: ${file.path} (also copied to clipboard).',
          ),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Export failed: $e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final money = NumberFormat.currency(
      locale: 'en_KE',
      symbol: 'KES ',
      decimalDigits: 2,
    );

    return AdminShell(
      title: 'Members',
      route: '/admin/members',
      actions: [
        IconButton(onPressed: _refresh, icon: const Icon(Icons.refresh)),
        IconButton(
          onPressed: _exportFilteredMembers,
          icon: const Icon(Icons.download),
          tooltip: _selectedMemberIds.isEmpty
              ? 'Export filtered members (CSV)'
              : 'Export selected members (CSV)',
        ),
        IconButton(
          onPressed: () async {
            final created = await context.push<bool>('/admin/members/new');
            if (created == true && mounted) await _refresh();
          },
          icon: const Icon(Icons.person_add_alt_1),
          tooltip: 'Add new member',
        ),
      ],
      body: FutureBuilder<List<Map<String, dynamic>>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return AsyncErrorView(
              error: snapshot.error,
              onRetry: _refresh,
            );
          }

          final rows = snapshot.data ?? const [];
          final sortedRows = [...rows]..sort((a, b) {
              final aNum =
                  _memberNumberOrder((a['member_number'] ?? '').toString());
              final bNum =
                  _memberNumberOrder((b['member_number'] ?? '').toString());
              final numCmp = aNum.compareTo(bNum);
              if (numCmp != 0) return numCmp;
              return (a['member_number'] ?? '')
                  .toString()
                  .compareTo((b['member_number'] ?? '').toString());
            });

          return SingleChildScrollView(
            padding: const EdgeInsets.all(AppConstants.marginEdge),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _searchCtrl,
                        decoration: InputDecoration(
                          hintText: 'Search member number, name, phone',
                          prefixIcon: const Icon(Icons.search),
                          suffixIcon: _search.isEmpty
                              ? null
                              : IconButton(
                                  icon: const Icon(Icons.clear),
                                  onPressed: () {
                                    _searchCtrl.clear();
                                    setState(() {
                                      _search = '';
                                      _page = 1;
                                      _selectedMemberIds.clear();
                                      _future = _loadPage();
                                    });
                                  },
                                ),
                        ),
                        onSubmitted: (value) {
                          setState(() {
                            _search = value.trim();
                            _page = 1;
                            _selectedMemberIds.clear();
                            _future = _loadPage();
                          });
                        },
                      ),
                    ),
                    const SizedBox(width: 8),
                    Badge(
                      isLabelVisible:
                          _activeFilter != 'all' || _statusFilter != 'all',
                      child: PopupMenuButton<String>(
                        tooltip: 'Filters',
                        icon: const Icon(Icons.tune),
                        onSelected: (value) {
                          final parts = value.split(':');
                          if (parts.length != 2) return;
                          if (parts.first == 'reset') {
                            _setMemberFilters(activity: 'all', status: 'all');
                          } else if (parts.first == 'activity') {
                            _setMemberFilters(activity: parts.last);
                          } else {
                            _setMemberFilters(status: parts.last);
                          }
                        },
                        itemBuilder: (context) => [
                          const PopupMenuItem<String>(
                            enabled: false,
                            child: Text('Account activity'),
                          ),
                          CheckedPopupMenuItem(
                            value: 'activity:all',
                            checked: _activeFilter == 'all',
                            child: const Text('All'),
                          ),
                          CheckedPopupMenuItem(
                            value: 'activity:active',
                            checked: _activeFilter == 'active',
                            child: const Text('Active'),
                          ),
                          CheckedPopupMenuItem(
                            value: 'activity:inactive',
                            checked: _activeFilter == 'inactive',
                            child: const Text('Inactive'),
                          ),
                          const PopupMenuDivider(),
                          const PopupMenuItem<String>(
                            enabled: false,
                            child: Text('Member status'),
                          ),
                          ...[
                            ('all', 'All statuses'),
                            ('active', 'ACTIVE'),
                            ('inactive', 'INACTIVE'),
                            ('probation', 'PROBATION'),
                            ('deceased', 'DECEASED'),
                          ].map((option) => CheckedPopupMenuItem<String>(
                                value: 'status:${option.$1}',
                                checked: _statusFilter == option.$1,
                                child: Text(option.$2),
                              )),
                          const PopupMenuDivider(),
                          const PopupMenuItem<String>(
                            value: 'reset:all',
                            child: Text('Reset filters'),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                InkWell(
                  onTap: sortedRows.isEmpty || _selectingAll
                      ? null
                      : () => _toggleSelectAll(sortedRows),
                  child: Text(
                    _selectingAll
                        ? 'Selecting members…'
                        : sortedRows.isNotEmpty &&
                                sortedRows.every((member) => _selectedMemberIds
                                    .contains((member['id'] ?? '').toString()))
                            ? 'Deselect all'
                            : 'Select all',
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.primary,
                      decoration: TextDecoration.underline,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                if (_selectedMemberIds.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Row(
                      children: [
                        Text('${_selectedMemberIds.length} selected'),
                        const SizedBox(width: 12),
                        InkWell(
                          onTap: () =>
                              setState(() => _selectedMemberIds.clear()),
                          child: Text(
                            'Clear',
                            style: TextStyle(
                              color: Theme.of(context).colorScheme.primary,
                              decoration: TextDecoration.underline,
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        InkWell(
                          onTap: _messageSelectedMembers,
                          child: Text(
                            'Message',
                            style: TextStyle(
                              color: Theme.of(context).colorScheme.primary,
                              decoration: TextDecoration.underline,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                LayoutBuilder(
                  builder: (context, constraints) {
                    final narrow = constraints.maxWidth < 380;
                    final numberWidth = narrow ? 46.0 : 58.0;
                    final walletWidth = narrow ? 86.0 : 108.0;
                    const statusWidth = 28.0;
                    final actionWidth = narrow ? 34.0 : 40.0;
                    final headerStyle = Theme.of(context)
                        .textTheme
                        .labelSmall
                        ?.copyWith(fontWeight: FontWeight.w700);

                    return Column(
                      children: [
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 4),
                          child: Row(
                            children: [
                              SizedBox(
                                width: numberWidth,
                                child: Text('MNo.', style: headerStyle),
                              ),
                              const SizedBox(width: 4),
                              Expanded(
                                  child: Text('Member', style: headerStyle)),
                              SizedBox(
                                width: walletWidth,
                                child: Text(
                                  'Wallet',
                                  textAlign: TextAlign.right,
                                  style: headerStyle,
                                ),
                              ),
                              const SizedBox(width: 4),
                              SizedBox(
                                width: statusWidth,
                                child: Tooltip(
                                  message: 'Member status',
                                  child: Icon(Icons.verified_outlined,
                                      size: 18, color: headerStyle?.color),
                                ),
                              ),
                              SizedBox(
                                width: actionWidth,
                                child: Tooltip(
                                  message: 'Message',
                                  child: Icon(Icons.chat_bubble_outline,
                                      size: 17, color: headerStyle?.color),
                                ),
                              ),
                            ],
                          ),
                        ),
                        const Divider(height: 1),
                        ...sortedRows.map((member) {
                          final id = (member['id'] ?? '').toString();
                          final active = member['is_active'] == true;
                          final status = (member['status'] ??
                                  (active ? 'ACTIVE' : 'INACTIVE'))
                              .toString();
                          final selected = _selectedMemberIds.contains(id);
                          return Column(
                            children: [
                              InkWell(
                                onTap: () => context.push('/admin/members/$id'),
                                child: Container(
                                  color: selected
                                      ? Theme.of(context)
                                          .colorScheme
                                          .primaryContainer
                                          .withValues(alpha: 0.35)
                                      : null,
                                  padding: EdgeInsets.zero,
                                  child: Row(
                                    children: [
                                      SizedBox(
                                        width: numberWidth,
                                        child: Text(
                                          '${member['member_number'] ?? '-'}',
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: const TextStyle(fontSize: 11),
                                        ),
                                      ),
                                      const SizedBox(width: 4),
                                      Expanded(
                                        child: Text(
                                          '${member['name'] ?? '-'}',
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: const TextStyle(
                                            fontSize: 12,
                                            fontWeight: FontWeight.w600,
                                          ),
                                        ),
                                      ),
                                      SizedBox(
                                        width: walletWidth,
                                        child: FittedBox(
                                          fit: BoxFit.scaleDown,
                                          alignment: Alignment.centerRight,
                                          child: Text(
                                            money.format(_toDouble(
                                                member['wallet_balance'])),
                                            style:
                                                const TextStyle(fontSize: 11),
                                          ),
                                        ),
                                      ),
                                      const SizedBox(width: 4),
                                      SizedBox(
                                        width: statusWidth,
                                        child: Tooltip(
                                          message: status,
                                          child: Icon(
                                            _statusIcon(status),
                                            size: 19,
                                            color: _statusIconColor(status),
                                          ),
                                        ),
                                      ),
                                      SizedBox(
                                        width: actionWidth,
                                        child: IconButton(
                                          tooltip: 'Message member',
                                          padding: EdgeInsets.zero,
                                          constraints:
                                              const BoxConstraints.tightFor(
                                            width: 24,
                                            height: 24,
                                          ),
                                          visualDensity: VisualDensity.compact,
                                          onPressed: () =>
                                              _messageMember(member),
                                          icon: const Icon(
                                            Icons.message_outlined,
                                            size: 16,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                              const Divider(height: 1),
                            ],
                          );
                        }),
                      ],
                    );
                  },
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        '${sortedRows.length} shown • Page $_page',
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                              color: const Color(0xFF64748B),
                            ),
                      ),
                    ),
                    OutlinedButton(
                      onPressed: _page > 1
                          ? () {
                              setState(() {
                                _page -= 1;
                                _selectedMemberIds.clear();
                                _future = _loadPage();
                              });
                            }
                          : null,
                      child: const Text('Prev'),
                    ),
                    const SizedBox(width: 8),
                    OutlinedButton(
                      onPressed: _hasMore
                          ? () {
                              setState(() {
                                _page += 1;
                                _selectedMemberIds.clear();
                                _future = _loadPage();
                              });
                            }
                          : null,
                      child: const Text('Next'),
                    ),
                  ],
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  double _toDouble(dynamic value) {
    if (value == null) return 0;
    if (value is num) return value.toDouble();
    return double.tryParse(value.toString()) ?? 0;
  }

  IconData _statusIcon(String status) {
    switch (status.toLowerCase()) {
      case 'active':
        return Icons.check_circle;
      case 'inactive':
        return Icons.cancel;
      case 'probation':
        return Icons.pending_actions;
      case 'deceased':
        return Icons.event_busy;
      default:
        return Icons.help_outline;
    }
  }

  Color _statusIconColor(String status) {
    switch (status.toLowerCase()) {
      case 'active':
        return const Color(0xFF16803C);
      case 'inactive':
        return const Color(0xFFB42318);
      case 'probation':
        return const Color(0xFFB54708);
      case 'deceased':
        return const Color(0xFF64748B);
      default:
        return const Color(0xFF64748B);
    }
  }

  String _csv(String input) {
    final escaped = input.replaceAll('"', '""');
    return '"$escaped"';
  }

  int _memberNumberOrder(String memberNumber) {
    final match = RegExp(r'\d+').firstMatch(memberNumber);
    if (match == null) return 1 << 30;
    return int.tryParse(match.group(0)!) ?? (1 << 30);
  }
}

class _MemberMessageDialog extends StatefulWidget {
  const _MemberMessageDialog({required this.recipientCount});

  final int recipientCount;

  @override
  State<_MemberMessageDialog> createState() => _MemberMessageDialogState();
}

class _MemberMessageDialogState extends State<_MemberMessageDialog> {
  final _messageController = TextEditingController();

  @override
  void dispose() {
    _messageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text('Message ${widget.recipientCount} selected members'),
      content: TextField(
        controller: _messageController,
        minLines: 3,
        maxLines: 6,
        autofocus: true,
        decoration: const InputDecoration(
          hintText: 'Write your message',
          border: OutlineInputBorder(),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: () =>
              Navigator.of(context).pop(_messageController.text.trim()),
          child: const Text('Continue'),
        ),
      ],
    );
  }
}
