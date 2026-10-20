import 'dart:io';

import 'package:excel/excel.dart' hide Border;
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import 'package:posthog_flutter/posthog_flutter.dart';
import 'package:share_plus/share_plus.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

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
  String _search = '';
  String _statusFilter = 'all';
  String _activeFilter = 'all';
  late Future<List<Map<String, dynamic>>> _future;

  final Map<String, int> _unpaidCounts = {};
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

  Future<List<Map<String, dynamic>>> _loadPage() async {
    final rows = await _service
        .fetchAdminMembers(
          page: _page,
          pageSize: _pageSize,
          search: _search,
          status: _statusFilter,
          active: _activeFilter,
        )
        .timeout(const Duration(seconds: 20));
    _hasMore = rows.length == _pageSize;
    if (rows.isNotEmpty) {
      _loadUnpaidCounts(rows);
    }
    return rows;
  }

  Future<void> _loadUnpaidCounts(List<Map<String, dynamic>> rows) async {
    try {
      final results = await Future.wait(
        rows.map((r) async {
          final id = (r['id'] ?? '').toString();
          try {
            final data = await Supabase.instance.client.rpc(
              'get_member_unpaid_case_obligations',
              params: {'p_member_id': id},
            );
            final obligations = (data as List?)?.cast<Map<String, dynamic>>() ??
                const <Map<String, dynamic>>[];
            return MapEntry(id, obligations.length);
          } catch (_) {
            return MapEntry(id, 0);
          }
        }),
      );
      if (mounted) {
        setState(() {
          _unpaidCounts.addEntries(results.where((e) => e.value > 0));
        });
      }
    } catch (_) {}
  }

  Future<void> _refresh() async {
    setState(() {
      _selectedMemberIds.clear();
      _future = _loadPage();
    });
    await _future;
  }

  Future<void> _showFilters() async {
    var active = _activeFilter;
    var status = _statusFilter;

    await showModalBottomSheet<void>(
      context: context,
      useSafeArea: true,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (sheetContext) => StatefulBuilder(
        builder: (context, setSheetState) => Padding(
          padding: EdgeInsets.fromLTRB(
            20,
            8,
            20,
            20 + MediaQuery.viewInsetsOf(context).bottom,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Filter members',
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                initialValue: active,
                isExpanded: true,
                decoration: const InputDecoration(
                  labelText: 'Account activity',
                  border: OutlineInputBorder(),
                ),
                items: const [
                  DropdownMenuItem(value: 'all', child: Text('All')),
                  DropdownMenuItem(value: 'active', child: Text('Active')),
                  DropdownMenuItem(value: 'inactive', child: Text('Inactive')),
                ],
                onChanged: (value) =>
                    setSheetState(() => active = value ?? 'all'),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: status,
                isExpanded: true,
                decoration: const InputDecoration(
                  labelText: 'Member status',
                  border: OutlineInputBorder(),
                ),
                items: const [
                  DropdownMenuItem(value: 'all', child: Text('All statuses')),
                  DropdownMenuItem(value: 'active', child: Text('ACTIVE')),
                  DropdownMenuItem(value: 'inactive', child: Text('INACTIVE')),
                  DropdownMenuItem(
                      value: 'probation', child: Text('PROBATION')),
                  DropdownMenuItem(value: 'deceased', child: Text('DECEASED')),
                ],
                onChanged: (value) =>
                    setSheetState(() => status = value ?? 'all'),
              ),
              const SizedBox(height: 20),
              Row(
                children: [
                  TextButton(
                    onPressed: () {
                      setState(() {
                        _activeFilter = 'all';
                        _statusFilter = 'all';
                        _page = 1;
                        _future = _loadPage();
                        _selectedMemberIds.clear();
                      });
                      Navigator.of(sheetContext).pop();
                    },
                    child: const Text('Reset'),
                  ),
                  const Spacer(),
                  FilledButton(
                    onPressed: () {
                      setState(() {
                        _activeFilter = active;
                        _statusFilter = status;
                        _page = 1;
                        _future = _loadPage();
                        _selectedMemberIds.clear();
                      });
                      Navigator.of(sheetContext).pop();
                    },
                    child: const Text('Apply filters'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _messageSelectedMembers(
      List<Map<String, dynamic>> members) async {
    final recipients = members
        .where((member) =>
            _selectedMemberIds.contains((member['id'] ?? '').toString()))
        .toList();
    if (recipients.isEmpty) return;
    await _composeMessage(recipients);
  }

  Future<void> _messageMember(Map<String, dynamic> member) =>
      _composeMessage([member]);

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

    final messageController = TextEditingController();
    final shouldShare = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text('Message ${recipients.length} selected members'),
        content: TextField(
          controller: messageController,
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
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Continue'),
          ),
        ],
      ),
    );

    final message = messageController.text.trim();
    messageController.dispose();
    if (shouldShare != true || message.isEmpty || !mounted) return;

    await Share.share(
      'To: ${phoneNumbers.join(', ')}\n\n$message',
      subject: 'Message to selected members',
    );
  }

  Future<void> _exportFilteredMembers() async {
    try {
      final allRows = await _service.fetchAdminMembers(
        page: 1,
        pageSize: 5000,
        search: _search,
        status: _statusFilter,
        active: _activeFilter,
      );
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

  Future<void> _showUnpaidObligations(
      String memberId, String memberName) async {
    try {
      final data = await Supabase.instance.client.rpc(
        'get_member_unpaid_case_obligations',
        params: {'p_member_id': memberId},
      );
      final obligations = (data as List?)?.cast<Map<String, dynamic>>() ??
          const <Map<String, dynamic>>[];
      if (!mounted) return;
      await showDialog(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text('Unpaid obligations — $memberName'),
          content: obligations.isEmpty
              ? const Text('No unpaid obligations.')
              : SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: DataTable(
                    columns: const [
                      DataColumn(label: Text('Case')),
                      DataColumn(label: Text('Type')),
                      DataColumn(label: Text('Required'), numeric: true),
                    ],
                    rows: obligations.map((o) {
                      return DataRow(cells: [
                        DataCell(Text('${o['case_number'] ?? '-'}')),
                        DataCell(Text('${o['case_type'] ?? '-'}')),
                        DataCell(
                          Text(
                            _toDouble(o['contribution_per_member'])
                                .toStringAsFixed(2),
                            textAlign: TextAlign.right,
                          ),
                        ),
                      ]);
                    }).toList(),
                  ),
                ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: const Text('Close'),
            ),
          ],
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to load obligations: $e')),
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
          tooltip: 'Export filtered members (CSV)',
        ),
        IconButton(
          onPressed: _importMembersFromExcel,
          icon: const Icon(Icons.upload_file),
          tooltip: 'Import members from Excel',
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
                Text(
                  'Member Directory',
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                ),
                const SizedBox(height: 6),
                const Text(
                  'Admin / Members',
                  style: TextStyle(
                    color: Color(0xFF64748B),
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 6),
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
                  ],
                ),
                const SizedBox(height: 10),
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
                      child: IconButton.filledTonal(
                        onPressed: _showFilters,
                        tooltip: 'Filters',
                        icon: const Icon(Icons.tune),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                if (_selectedMemberIds.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            '${_selectedMemberIds.length} selected',
                            style: const TextStyle(
                              color: Color(0xFF475569),
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                        TextButton.icon(
                          onPressed: () =>
                              setState(() => _selectedMemberIds.clear()),
                          icon: const Icon(Icons.close, size: 18),
                          label: const Text('Clear'),
                        ),
                        const SizedBox(width: 4),
                        FilledButton.icon(
                          onPressed: () => _messageSelectedMembers(sortedRows),
                          icon: const Icon(Icons.message_outlined, size: 18),
                          label: const Text('Message'),
                        ),
                      ],
                    ),
                  ),
                ListView.separated(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: sortedRows.length,
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemBuilder: (context, index) {
                    final member = sortedRows[index];
                    final id = (member['id'] ?? '').toString();
                    final active = member['is_active'] == true;
                    final unpaid = _unpaidCounts[id] ?? 0;
                    return ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: Checkbox(
                        value: _selectedMemberIds.contains(id),
                        visualDensity: VisualDensity.compact,
                        materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        onChanged: (selected) => setState(() {
                          if (selected == true) {
                            _selectedMemberIds.add(id);
                          } else {
                            _selectedMemberIds.remove(id);
                          }
                        }),
                      ),
                      onTap: () => context.go('/admin/members/$id'),
                      title: Text(
                        '${member['name'] ?? '-'}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                      subtitle: Text(
                        '#${member['member_number'] ?? '-'} • ${money.format(_toDouble(member['wallet_balance']))} • ${member['status'] ?? (active ? 'ACTIVE' : 'INACTIVE')}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (unpaid > 0)
                            IconButton(
                              tooltip: '$unpaid unpaid obligations',
                              visualDensity: VisualDensity.compact,
                              onPressed: () => _showUnpaidObligations(
                                  id, '${member['name'] ?? '-'}'),
                              icon: Badge(
                                label: Text('$unpaid'),
                                child: const Icon(Icons.warning_amber_outlined),
                              ),
                            ),
                          IconButton(
                            tooltip: 'Message member',
                            visualDensity: VisualDensity.compact,
                            onPressed: () => _messageMember(member),
                            icon: const Icon(Icons.message_outlined),
                          ),
                        ],
                      ),
                    );
                  },
                ),
                const SizedBox(height: 8),
                Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
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

  String _csv(String input) {
    final escaped = input.replaceAll('"', '""');
    return '"$escaped"';
  }

  int _memberNumberOrder(String memberNumber) {
    final match = RegExp(r'\d+').firstMatch(memberNumber);
    if (match == null) return 1 << 30;
    return int.tryParse(match.group(0)!) ?? (1 << 30);
  }

  Future<void> _importMembersFromExcel() async {
    try {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['xlsx'],
        withData: true,
      );

      if (result == null || result.files.isEmpty) return;

      final file = result.files.first;
      final bytes = file.bytes;
      if (bytes == null) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not read file')),
        );
        return;
      }

      final excel = Excel.decodeBytes(bytes);
      final sheetNames = excel.sheets.keys.toList();
      final sheet =
          sheetNames.isNotEmpty ? excel.sheets[sheetNames.first] : null;
      if (sheet == null) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No data found in Excel file')),
        );
        return;
      }

      final rows = <Map<String, dynamic>>[];
      final headers = <String>[];

      int rowIndex = 0;
      for (final row in sheet.rows) {
        if (rowIndex == 0) {
          headers.addAll(row.map((c) => c?.value?.toString() ?? '').toList());
          rowIndex++;
          continue;
        }
        final rowData = <String, dynamic>{};
        for (var i = 0; i < headers.length && i < row.length; i++) {
          rowData[headers[i].toLowerCase().replaceAll(' ', '_')] =
              row[i]?.value;
        }
        rows.add(rowData);
        rowIndex++;
      }

      if (rows.isEmpty) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No member rows found')),
        );
        return;
      }

      final token = ref.read(authControllerProvider).appToken ?? '';
      final importResult =
          await _service.importMembers(appToken: token, members: rows);

      if (!mounted) return;
      final createdCount = (importResult['created'] as num?)?.toInt() ?? 0;
      Posthog().capture(
        eventName: 'members_import_completed',
        properties: {'created_count': createdCount},
      );
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Imported $createdCount members')),
      );

      setState(() {
        _page = 1;
        _future = _loadPage();
      });
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Import failed: $e')),
      );
    }
  }
}
