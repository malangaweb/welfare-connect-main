import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/services/live_data_service.dart';
import '../auth/auth_controller.dart';
import 'admin_shell.dart';

class AdminCaseDetailsScreen extends ConsumerStatefulWidget {
  final String caseId;
  const AdminCaseDetailsScreen({super.key, required this.caseId});

  @override
  ConsumerState<AdminCaseDetailsScreen> createState() =>
      _AdminCaseDetailsScreenState();
}

class _AdminCaseDetailsScreenState
    extends ConsumerState<AdminCaseDetailsScreen> {
  final _service = LiveDataService();
  late Future<Map<String, dynamic>> _future;
  String _paymentFilter = 'unpaid';
  static const int _memberPageSize = 50;
  int _memberPage = 1;
  final Set<String> _selectedMemberIds = {};
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<Map<String, dynamic>> _load() async {
    final token = ref.read(authControllerProvider).appToken ?? '';
    if (token.isEmpty) throw Exception('Missing session token');
    return _service.fetchAdminCaseDetails(
        appToken: token, caseId: widget.caseId);
  }

  Future<void> _exportPaymentRows(
    List<Map<String, dynamic>> members,
    String caseNumber,
  ) async {
    if (members.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No payment rows to export.')),
      );
      return;
    }
    try {
      final lines = <String>['member_number,name,payment_status'];
      for (final member in members) {
        final isPaid = member['payment_compliance'] == 'paid';
        lines.add([
          _csv('${member['member_number'] ?? ''}'),
          _csv('${member['member_name'] ?? ''}'),
          isPaid ? 'Paid' : 'Unpaid',
        ].join(','));
      }
      final csv = lines.join('\n');
      final now = DateTime.now();
      final fileName =
          'case_${caseNumber}_payments_${_paymentFilter}_${now.year}${now.month.toString().padLeft(2, '0')}${now.day.toString().padLeft(2, '0')}.csv';
      final directory = await getApplicationDocumentsDirectory();
      final file = File('${directory.path}/$fileName');
      await file.writeAsString(csv);
      await Clipboard.setData(ClipboardData(text: csv));
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
              'Exported ${members.length} $_paymentFilter members to ${file.path} and copied to clipboard.'),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Export failed: $e')),
      );
    }
  }

  String _csv(String value) => '"${value.replaceAll('"', '""')}"';

  void _toggleSelectAll(List<Map<String, dynamic>> members) {
    final ids = members
        .map((row) => row['member_id']?.toString() ?? '')
        .where((id) => id.isNotEmpty)
        .toSet();
    final alreadySelected =
        ids.isNotEmpty && ids.every(_selectedMemberIds.contains);
    setState(() {
      if (alreadySelected) {
        _selectedMemberIds.removeAll(ids);
      } else {
        _selectedMemberIds.addAll(ids);
      }
    });
  }

  Future<void> _sendPaymentReminder(
    List<Map<String, dynamic>> members,
    String caseNumber,
  ) async {
    final selected = members
        .where((row) =>
            _selectedMemberIds.contains(row['member_id']?.toString() ?? ''))
        .toList();
    final phoneNumbers = selected
        .map((row) => '${row['phone_number'] ?? ''}'.trim())
        .where((phone) => phone.isNotEmpty)
        .toSet()
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
      builder: (_) => _CaseReminderDialog(
        recipientCount: selected.length,
        caseNumber: caseNumber,
      ),
    );
    if (message == null || message.trim().isEmpty || !mounted) return;
    await Share.share(
      'To: ${phoneNumbers.join(', ')}\n\n${message.trim()}',
      subject: 'Case #$caseNumber contribution reminder',
    );
  }

  Future<void> _exportCurrentPaymentFilter() async {
    try {
      final payload = await _future;
      final caseData = (payload['case'] as Map?)?.cast<String, dynamic>() ?? {};
      final paymentRows = (payload['payment_status'] as List?)
              ?.whereType<Map>()
              .map((row) => row.cast<String, dynamic>())
              .toList() ??
          <Map<String, dynamic>>[];
      final rows = paymentRows
          .where((row) => _paymentFilter == 'paid'
              ? row['payment_compliance'] == 'paid'
              : row['payment_compliance'] != 'paid')
          .toList();
      await _exportPaymentRows(
        rows,
        '${caseData['case_number'] ?? widget.caseId}',
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Export failed: $e')),
      );
    }
  }

  Future<void> _setCaseState({required bool finalize}) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final payload = await _future;
      final caseData = (payload['case'] as Map?)?.cast<String, dynamic>() ?? {};
      if (finalize) {
        await _service.finalizeCase(
          caseId: widget.caseId,
          actualAmount: _toDouble(caseData['actual_amount']),
        );
      } else {
        await _service.reopenCase(caseId: widget.caseId);
      }
      if (!mounted) return;
      setState(() => _future = _load());
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(finalize ? 'Case finalized.' : 'Case activated.'),
      ));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Could not update case: $e')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _deleteCase() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete case?'),
        content: const Text('This will permanently remove this case.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Delete')),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _busy = true);
    try {
      await _service.deleteAdminCase(caseId: widget.caseId);
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Case deleted.')));
      context.go('/admin/cases');
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Could not delete case: $e')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final money = NumberFormat.currency(locale: 'en_KE', symbol: 'KES ');
    final dateFmt = DateFormat('dd MMM yyyy');
    return AdminShell(
      title: 'Case Details',
      route: '/admin/cases',
      actions: [
        IconButton(
          tooltip: 'Refresh',
          onPressed: _busy ? null : () => setState(() => _future = _load()),
          icon: const Icon(Icons.refresh),
        ),
      ],
      body: FutureBuilder<Map<String, dynamic>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(child: Text(snapshot.error.toString()));
          }
          final payload = snapshot.data ?? const {};
          final c =
              (payload['case'] as Map?)?.cast<String, dynamic>() ?? const {};
          final paymentRows = (payload['payment_status'] as List?)
                  ?.whereType<Map>()
                  .map((row) => row.cast<String, dynamic>())
                  .toList() ??
              <Map<String, dynamic>>[];
          final paid = paymentRows
              .where((row) => row['payment_compliance'] == 'paid')
              .toList();
          final unpaid = paymentRows
              .where((row) => row['payment_compliance'] != 'paid')
              .toList();
          final visibleMembers = _paymentFilter == 'paid' ? paid : unpaid;
          final memberPages = visibleMembers.isEmpty
              ? 1
              : (visibleMembers.length + _memberPageSize - 1) ~/
                  _memberPageSize;
          final currentMemberPage = _memberPage.clamp(1, memberPages);
          final memberStart = (currentMemberPage - 1) * _memberPageSize;
          final memberEnd =
              (memberStart + _memberPageSize).clamp(0, visibleMembers.length);
          final pageMembers = visibleMembers.sublist(memberStart, memberEnd);
          final expected = _toDouble(c['expected_amount']);
          final collected = _toDouble(c['actual_amount']);
          final contribution = _toDouble(
              c['contribution_per_member'] ?? c['contribution_amount']);
          final progress =
              expected > 0 ? (collected / expected).clamp(0.0, 1.0) : 0.0;
          final active = c['is_active'] == true;
          final finalized = c['is_finalized'] == true;
          final status = finalized
              ? 'Finalized'
              : active
                  ? 'Active'
                  : 'Draft';
          final beneficiary =
              (c['affected_member'] as Map?)?.cast<String, dynamic>() ??
                  const {};
          final dependant =
              (c['affected_dependant'] as Map?)?.cast<String, dynamic>() ??
                  const {};
          final caseNumber = '${c['case_number'] ?? '-'}';
          final caseType = '${c['case_type'] ?? 'Case'}';
          final createdAt = DateTime.tryParse('${c['created_at'] ?? ''}');
          final startAt = DateTime.tryParse('${c['start_date'] ?? ''}');
          final endAt = DateTime.tryParse('${c['end_date'] ?? ''}');

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Row(children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Case #$caseNumber',
                          style: Theme.of(context)
                              .textTheme
                              .titleLarge
                              ?.copyWith(fontWeight: FontWeight.w700)),
                      const SizedBox(height: 5),
                      Wrap(spacing: 7, children: [
                        _StatusBadge(status: caseType),
                        _StatusBadge(status: status),
                      ]),
                    ],
                  ),
                ),
                if (!finalized && active)
                  PopupMenuButton<String>(
                    enabled: !_busy,
                    onSelected: (value) {
                      if (value == 'finalize') _setCaseState(finalize: true);
                      if (value == 'delete') _deleteCase();
                    },
                    itemBuilder: (_) => const [
                      PopupMenuItem(
                          value: 'finalize', child: Text('Finalize case')),
                      PopupMenuItem(
                          value: 'delete', child: Text('Delete case')),
                    ],
                  ),
                if (!active && !finalized)
                  TextButton(
                    onPressed:
                        _busy ? null : () => _setCaseState(finalize: false),
                    child: const Text('Activate case'),
                  ),
              ]),
              const SizedBox(height: 12),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text('Collection',
                              style: TextStyle(fontWeight: FontWeight.w700)),
                          Text('${(progress * 100).round()}%',
                              style: Theme.of(context)
                                  .textTheme
                                  .titleMedium
                                  ?.copyWith(fontWeight: FontWeight.w700)),
                        ],
                      ),
                      const SizedBox(height: 10),
                      LinearProgressIndicator(value: progress),
                      const SizedBox(height: 12),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          _metric('Collected', money.format(collected)),
                          _metric('Target', money.format(expected)),
                        ],
                      ),
                      const Divider(height: 28, thickness: 0.7),
                      const Text('Case overview',
                          style: TextStyle(fontWeight: FontWeight.w700)),
                      const SizedBox(height: 8),
                      _InfoRow(label: 'Case type', value: _pretty(caseType)),
                      _InfoRow(
                          label: 'Created',
                          value: createdAt == null
                              ? '-'
                              : dateFmt.format(createdAt.toLocal())),
                      _InfoRow(
                          label: 'Duration',
                          value:
                              '${startAt == null ? '-' : dateFmt.format(startAt.toLocal())} – ${endAt == null ? 'Ongoing' : dateFmt.format(endAt.toLocal())}'),
                      _InfoRow(
                          label: 'Contribution per member',
                          value: money.format(contribution)),
                      const Divider(height: 22, thickness: 0.7),
                      Row(
                        children: [
                          CircleAvatar(
                              child: Text(
                                  _initials('${beneficiary['name'] ?? ''}'))),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text('Affected member',
                                    style: TextStyle(
                                        fontSize: 12,
                                        color: Color(0xFF64748B))),
                                Text(
                                    '${beneficiary['name'] ?? 'Member details unavailable'}',
                                    style: const TextStyle(
                                        fontWeight: FontWeight.w600)),
                                Text(
                                    'Member #${beneficiary['member_number'] ?? '-'} • ${_pretty(beneficiary['gender'])}',
                                    style:
                                        Theme.of(context).textTheme.bodySmall),
                                if ((beneficiary['phone_number'] ?? '')
                                    .toString()
                                    .trim()
                                    .isNotEmpty)
                                  Text(
                                    'Phone ${beneficiary['phone_number']}',
                                    style:
                                        Theme.of(context).textTheme.bodySmall,
                                  ),
                                if (dependant.isNotEmpty)
                                  Text(
                                    'For ${dependant['name'] ?? 'Dependant'} • ${_pretty(dependant['relationship'])}',
                                    style:
                                        Theme.of(context).textTheme.bodySmall,
                                  ),
                              ],
                            ),
                          ),
                          if (beneficiary['id'] != null)
                            IconButton(
                              tooltip: 'View member profile',
                              onPressed: () => context
                                  .push('/admin/members/${beneficiary['id']}'),
                              icon: const Icon(Icons.arrow_forward),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Card(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text('Member Payment Status',
                                style: Theme.of(context)
                                    .textTheme
                                    .titleSmall
                                    ?.copyWith(fontWeight: FontWeight.w700)),
                          ),
                          TextButton.icon(
                            onPressed: _exportCurrentPaymentFilter,
                            icon: const Icon(Icons.download, size: 17),
                            label: const Text('Export'),
                          ),
                        ],
                      ),
                      const SizedBox(height: 5),
                      Text(
                          '${paymentRows.length} members • ${paid.length} paid • ${unpaid.length} unpaid',
                          style: Theme.of(context).textTheme.bodySmall),
                      const SizedBox(height: 5),
                      InkWell(
                        onTap: visibleMembers.isEmpty
                            ? null
                            : () => _toggleSelectAll(visibleMembers),
                        child: Text(
                          visibleMembers.isNotEmpty &&
                                  visibleMembers.every(
                                    (row) => _selectedMemberIds.contains(
                                        row['member_id']?.toString() ?? ''),
                                  )
                              ? 'Deselect all'
                              : 'Select all $_paymentFilter members',
                          style: TextStyle(
                            color: Theme.of(context).colorScheme.primary,
                            decoration: TextDecoration.underline,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      if (_selectedMemberIds.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 6),
                          child: Row(
                            children: [
                              Text('${_selectedMemberIds.length} selected'),
                              const SizedBox(width: 12),
                              InkWell(
                                onTap: () => setState(_selectedMemberIds.clear),
                                child: Text(
                                  'Clear',
                                  style: TextStyle(
                                    color:
                                        Theme.of(context).colorScheme.primary,
                                    decoration: TextDecoration.underline,
                                  ),
                                ),
                              ),
                              const SizedBox(width: 12),
                              InkWell(
                                onTap: () => _sendPaymentReminder(
                                    visibleMembers, caseNumber),
                                child: Text(
                                  'Send reminder',
                                  style: TextStyle(
                                    color:
                                        Theme.of(context).colorScheme.primary,
                                    decoration: TextDecoration.underline,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      const SizedBox(height: 8),
                      Wrap(spacing: 6, children: [
                        _filterChoice('Unpaid', 'unpaid', unpaid.length),
                        _filterChoice('Paid', 'paid', paid.length),
                      ]),
                      const SizedBox(height: 4),
                      if (visibleMembers.isEmpty)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          child: Center(
                              child: Text(_paymentFilter == 'paid'
                                  ? 'No paid members.'
                                  : 'No unpaid members.')),
                        )
                      else
                        ...pageMembers.indexed.expand((entry) {
                          final (index, row) = entry;
                          final isPaid = row['payment_compliance'] == 'paid';
                          return [
                            Container(
                              color: _selectedMemberIds.contains(
                                      row['member_id']?.toString() ?? '')
                                  ? Theme.of(context)
                                      .colorScheme
                                      .primaryContainer
                                      .withValues(alpha: 0.35)
                                  : null,
                              padding: const EdgeInsets.symmetric(vertical: 3),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      '#${row['member_number'] ?? '-'}  ${row['member_name'] ?? 'Unknown member'}',
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(
                                          fontSize: 13,
                                          fontWeight: FontWeight.w600),
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  _PaymentBadge(isPaid: isPaid),
                                ],
                              ),
                            ),
                            if (index < pageMembers.length - 1)
                              const Divider(height: 1),
                          ];
                        }),
                      if (visibleMembers.isNotEmpty) ...[
                        const Divider(height: 16),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            Text(
                              'Showing ${memberStart + 1}–$memberEnd of ${visibleMembers.length}',
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                            const SizedBox(width: 8),
                            IconButton(
                              tooltip: 'Previous page',
                              onPressed: currentMemberPage > 1
                                  ? () => setState(
                                      () => _memberPage = currentMemberPage - 1)
                                  : null,
                              icon: const Icon(Icons.chevron_left),
                              visualDensity: VisualDensity.compact,
                            ),
                            IconButton(
                              tooltip: 'Next page',
                              onPressed: currentMemberPage < memberPages
                                  ? () => setState(
                                      () => _memberPage = currentMemberPage + 1)
                                  : null,
                              icon: const Icon(Icons.chevron_right),
                              visualDensity: VisualDensity.compact,
                            ),
                          ],
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _metric(String label, String value) =>
      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label,
            style: const TextStyle(fontSize: 12, color: Color(0xFF64748B))),
        const SizedBox(height: 2),
        Text(value, style: const TextStyle(fontWeight: FontWeight.w600)),
      ]);

  Widget _filterChoice(String label, String value, int count) => ChoiceChip(
        label: Text('$label ($count)'),
        selected: _paymentFilter == value,
        onSelected: (_) => setState(() {
          _paymentFilter = value;
          _memberPage = 1;
          _selectedMemberIds.clear();
        }),
      );

  String _pretty(dynamic value) {
    final text = '${value ?? ''}'.trim();
    if (text.isEmpty) return '-';
    return text
        .replaceAll('_', ' ')
        .split(' ')
        .map((part) => part.isEmpty
            ? part
            : '${part[0].toUpperCase()}${part.substring(1).toLowerCase()}')
        .join(' ');
  }

  String _initials(String name) {
    final parts = name
        .trim()
        .split(RegExp(r'\s+'))
        .where((part) => part.isNotEmpty)
        .take(2);
    final value = parts.map((part) => part[0].toUpperCase()).join();
    return value.isEmpty ? 'M' : value;
  }

  double _toDouble(dynamic value) {
    if (value == null) return 0;
    if (value is num) return value.toDouble();
    return double.tryParse(value.toString()) ?? 0;
  }
}

class _StatusBadge extends StatelessWidget {
  final String status;
  const _StatusBadge({required this.status});

  @override
  Widget build(BuildContext context) {
    Color bgColor;
    switch (status.toUpperCase()) {
      case 'ACTIVE':
      case 'FINALIZED':
      case 'PAID':
        bgColor = Colors.green;
        break;
      case 'EDUCATION':
        bgColor = Colors.blue;
        break;
      case 'SICKNESS':
        bgColor = Colors.orange;
        break;
      case 'DEATH':
        bgColor = Colors.deepPurple;
        break;
      case 'DRAFT':
      case 'UNPAID':
        bgColor = Colors.red;
        break;
      case 'PENDING':
        bgColor = Colors.orange;
        break;
      case 'COMPLETED':
        bgColor = Colors.blue;
        break;
      case 'CANCELLED':
        bgColor = Colors.red;
        break;
      default:
        bgColor = Theme.of(context).disabledColor;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      decoration: BoxDecoration(
        color: bgColor.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: bgColor),
      ),
      child: Text(
        status.toUpperCase(),
        style: TextStyle(
          color: bgColor,
          fontWeight: FontWeight.w600,
          fontSize: 12,
        ),
      ),
    );
  }
}

class _PaymentBadge extends StatelessWidget {
  final bool isPaid;
  const _PaymentBadge({required this.isPaid});

  @override
  Widget build(BuildContext context) {
    final color = isPaid ? Colors.green : Colors.red;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(
        isPaid ? 'PAID' : 'UNPAID',
        style:
            TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w700),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;
  const _InfoRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 140,
            child: Text(
              '$label:',
              style: const TextStyle(fontWeight: FontWeight.w500),
            ),
          ),
          Expanded(child: Text(value)),
        ],
      ),
    );
  }
}

class _CaseReminderDialog extends StatefulWidget {
  const _CaseReminderDialog({
    required this.recipientCount,
    required this.caseNumber,
  });

  final int recipientCount;
  final String caseNumber;

  @override
  State<_CaseReminderDialog> createState() => _CaseReminderDialogState();
}

class _CaseReminderDialogState extends State<_CaseReminderDialog> {
  late final TextEditingController _messageController = TextEditingController(
    text:
        'Reminder: Please complete your contribution for Case #${widget.caseNumber}.',
  );

  @override
  void dispose() {
    _messageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text('Send reminder to ${widget.recipientCount} members'),
      content: TextField(
        controller: _messageController,
        minLines: 3,
        maxLines: 6,
        autofocus: true,
        decoration: const InputDecoration(
          hintText: 'Write a reminder',
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
