import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/services/live_data_service.dart';
import '../auth/auth_controller.dart';
import 'admin_shell.dart';

class AdminMemberDetailsScreen extends ConsumerStatefulWidget {
  final String memberId;
  const AdminMemberDetailsScreen({super.key, required this.memberId});

  @override
  ConsumerState<AdminMemberDetailsScreen> createState() =>
      _AdminMemberDetailsScreenState();
}

class _AdminMemberDetailsScreenState
    extends ConsumerState<AdminMemberDetailsScreen> {
  final _service = LiveDataService();
  late Future<Map<String, dynamic>> _future;
  bool _busy = false;
  bool _redirectingForSession = false;
  int _selectedSection = 0;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  @override
  void didUpdateWidget(covariant AdminMemberDetailsScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.memberId != widget.memberId) {
      _future = _load();
    }
  }

  Future<void> _changeStatus(String currentStatus) async {
    final token = ref.read(authControllerProvider).appToken ?? '';
    if (token.isEmpty || _busy) return;
    final selected =
        currentStatus.toLowerCase() == 'active' ? 'inactive' : 'active';
    setState(() => _busy = true);
    try {
      await _service.updateMemberStatus(
        appToken: token,
        memberId: widget.memberId,
        status: selected,
      );
      await _clearAdminCache();
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Status updated.')));
      setState(() => _future = _load());
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Status update failed: $e')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _transferFromMember() async {
    if (_busy) return;
    final toCtrl = TextEditingController();
    final amountCtrl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Transfer From Member'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
                controller: toCtrl,
                decoration: const InputDecoration(labelText: 'To Member ID')),
            TextField(
                controller: amountCtrl,
                decoration: const InputDecoration(labelText: 'Amount')),
          ],
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel')),
          ElevatedButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Transfer')),
        ],
      ),
    );
    if (ok != true) return;
    final amount = double.tryParse(amountCtrl.text.trim()) ?? 0;
    if (toCtrl.text.trim().isEmpty || amount <= 0) return;
    setState(() => _busy = true);
    try {
      await _service.transferFunds(
        fromMemberId: widget.memberId,
        toMemberId: toCtrl.text.trim(),
        amount: amount,
        toMemberNumber: toCtrl.text.trim(),
      );
      await _clearAdminCache();
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Transfer completed.')));
      setState(() => _future = _load());
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Transfer failed: $e')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _fundWallet() async {
    final token = ref.read(authControllerProvider).appToken ?? '';
    if (token.isEmpty || _busy) return;

    final amountCtrl = TextEditingController();
    final descCtrl = TextEditingController();

    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Fund Wallet'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: amountCtrl,
              decoration: const InputDecoration(labelText: 'Amount'),
              keyboardType: TextInputType.number,
            ),
            TextField(
              controller: descCtrl,
              decoration:
                  const InputDecoration(labelText: 'Description (optional)'),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Fund'),
          ),
        ],
      ),
    );

    if (ok != true) return;
    final amount = double.tryParse(amountCtrl.text.trim()) ?? 0;
    if (amount <= 0) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Amount must be greater than zero')),
      );
      return;
    }

    setState(() => _busy = true);
    try {
      await _service.adminRecordWalletFunding(
        appToken: token,
        memberId: widget.memberId,
        amount: amount,
        description: descCtrl.text.trim().isEmpty ? null : descCtrl.text.trim(),
      );
      await _clearAdminCache();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Wallet funded.')),
      );
      setState(() => _future = _load());
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Funding failed: $e')),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _editMember(Map<String, dynamic> member) async {
    final name = TextEditingController(text: '${member['name'] ?? ''}');
    final nationalId =
        TextEditingController(text: '${member['national_id_number'] ?? ''}');
    final phone =
        TextEditingController(text: '${member['phone_number'] ?? ''}');
    final email =
        TextEditingController(text: '${member['email_address'] ?? ''}');
    final residence =
        TextEditingController(text: '${member['residence'] ?? ''}');
    final kin = _asMap(member['next_of_kin']);
    final kinName = TextEditingController(text: '${kin['name'] ?? ''}');
    final kinRelationship =
        TextEditingController(text: '${kin['relationship'] ?? ''}');
    final kinPhone = TextEditingController(
        text: '${kin['phoneNumber'] ?? kin['phone_number'] ?? ''}');
    var gender = '${member['gender'] ?? 'male'}'.toLowerCase();
    var dateOfBirth = DateTime.tryParse('${member['date_of_birth'] ?? ''}');
    final residences =
        await _service.fetchResidences().catchError((_) => <String>[]);
    if (!mounted) return;
    if (residence.text.trim().isNotEmpty &&
        !residences.contains(residence.text.trim())) {
      residences.add(residence.text.trim());
    }

    final updates = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, setLocalState) => AlertDialog(
          title: const Text('Edit Member Information'),
          content: SizedBox(
            width: 520,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(
                      controller: name,
                      decoration:
                          const InputDecoration(labelText: 'Full name')),
                  DropdownButtonFormField<String>(
                    initialValue: gender == 'female' ? 'female' : 'male',
                    decoration: const InputDecoration(labelText: 'Gender'),
                    items: const [
                      DropdownMenuItem(value: 'male', child: Text('Male')),
                      DropdownMenuItem(value: 'female', child: Text('Female')),
                    ],
                    onChanged: (value) =>
                        setLocalState(() => gender = value ?? 'male'),
                  ),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Date of birth'),
                    subtitle: Text(dateOfBirth == null
                        ? 'Select date'
                        : DateFormat('dd MMM yyyy').format(dateOfBirth!)),
                    onTap: () async {
                      final selected = await showDatePicker(
                        context: dialogContext,
                        initialDate: dateOfBirth ?? DateTime(1990),
                        firstDate: DateTime(1900),
                        lastDate: DateTime.now(),
                      );
                      if (selected != null) {
                        setLocalState(() => dateOfBirth = selected);
                      }
                    },
                  ),
                  TextField(
                      controller: nationalId,
                      decoration:
                          const InputDecoration(labelText: 'National ID')),
                  TextField(
                      controller: phone,
                      decoration:
                          const InputDecoration(labelText: 'Phone number'),
                      keyboardType: TextInputType.phone),
                  TextField(
                      controller: email,
                      decoration:
                          const InputDecoration(labelText: 'Email address'),
                      keyboardType: TextInputType.emailAddress),
                  DropdownButtonFormField<String>(
                    initialValue: residences.contains(residence.text.trim())
                        ? residence.text.trim()
                        : null,
                    decoration: const InputDecoration(labelText: 'Residence'),
                    items: residences
                        .map((value) =>
                            DropdownMenuItem(value: value, child: Text(value)))
                        .toList(),
                    onChanged: (value) => residence.text = value ?? '',
                  ),
                  const SizedBox(height: 12),
                  TextField(
                      controller: kinName,
                      decoration:
                          const InputDecoration(labelText: 'Next of kin name')),
                  TextField(
                      controller: kinRelationship,
                      decoration: const InputDecoration(
                          labelText: 'Next of kin relationship')),
                  TextField(
                      controller: kinPhone,
                      decoration: const InputDecoration(
                          labelText: 'Next of kin phone')),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(dialogContext),
                child: const Text('Cancel')),
            FilledButton(
              onPressed: () {
                if (name.text.trim().length < 2 || dateOfBirth == null) return;
                Navigator.pop(dialogContext, {
                  'name': name.text.trim(),
                  'gender': gender,
                  'date_of_birth':
                      DateFormat('yyyy-MM-dd').format(dateOfBirth!),
                  'national_id_number': nationalId.text.trim(),
                  'phone_number':
                      phone.text.trim().isEmpty ? null : phone.text.trim(),
                  'email_address':
                      email.text.trim().isEmpty ? null : email.text.trim(),
                  'residence': residence.text.trim(),
                  'next_of_kin': {
                    'name': kinName.text.trim(),
                    'relationship': kinRelationship.text.trim(),
                    'phoneNumber': kinPhone.text.trim(),
                  },
                });
              },
              child: const Text('Save'),
            ),
          ],
        ),
      ),
    );
    for (final controller in [
      name,
      nationalId,
      phone,
      email,
      residence,
      kinName,
      kinRelationship,
      kinPhone
    ]) {
      controller.dispose();
    }
    if (updates == null) return;
    setState(() => _busy = true);
    try {
      await _service.updateAdminMemberProfile(
        memberId: widget.memberId,
        updates: updates,
      );
      await _clearAdminCache();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Member information updated.')),
      );
      setState(() => _future = _load());
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not update member: $e')),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _addDependant() async {
    final name = TextEditingController();
    final relationship = TextEditingController();
    var gender = 'male';
    DateTime? dateOfBirth;
    var isDisabled = false;
    var isEligible = true;
    final dependant = await showDialog<MemberDependant>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, setLocalState) => AlertDialog(
          title: const Text('Add Dependant'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                    controller: name,
                    decoration: const InputDecoration(labelText: 'Name')),
                DropdownButtonFormField<String>(
                  initialValue: gender,
                  decoration: const InputDecoration(labelText: 'Gender'),
                  items: const [
                    DropdownMenuItem(value: 'male', child: Text('Male')),
                    DropdownMenuItem(value: 'female', child: Text('Female')),
                  ],
                  onChanged: (value) =>
                      setLocalState(() => gender = value ?? 'male'),
                ),
                TextField(
                    controller: relationship,
                    decoration:
                        const InputDecoration(labelText: 'Relationship')),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Date of birth'),
                  subtitle: Text(dateOfBirth == null
                      ? 'Select date'
                      : DateFormat('dd MMM yyyy').format(dateOfBirth!)),
                  onTap: () async {
                    final selected = await showDatePicker(
                      context: dialogContext,
                      initialDate: DateTime(2010),
                      firstDate: DateTime(1900),
                      lastDate: DateTime.now(),
                    );
                    if (selected != null) {
                      setLocalState(() => dateOfBirth = selected);
                    }
                  },
                ),
                CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Has disability'),
                  value: isDisabled,
                  onChanged: (value) =>
                      setLocalState(() => isDisabled = value ?? false),
                ),
                CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Eligible'),
                  value: isEligible,
                  onChanged: (value) =>
                      setLocalState(() => isEligible = value ?? false),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(dialogContext),
                child: const Text('Cancel')),
            FilledButton(
              onPressed: () {
                if (name.text.trim().isEmpty ||
                    relationship.text.trim().isEmpty ||
                    dateOfBirth == null) {
                  return;
                }
                Navigator.pop(
                  dialogContext,
                  MemberDependant(
                    id: '',
                    name: name.text.trim(),
                    gender: gender,
                    relationship: relationship.text.trim(),
                    dateOfBirth: DateFormat('yyyy-MM-dd').format(dateOfBirth!),
                    isDisabled: isDisabled,
                    isEligible: isEligible,
                  ),
                );
              },
              child: const Text('Save'),
            ),
          ],
        ),
      ),
    );
    name.dispose();
    relationship.dispose();
    if (dependant == null) return;
    setState(() => _busy = true);
    try {
      await _service.addDependant(
        memberId: widget.memberId,
        dependant: dependant,
      );
      await _clearAdminCache();
      if (!mounted) return;
      setState(() => _future = _load());
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Dependant added.')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Could not add dependant: $e')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _showTransactions(
      List<Map<String, dynamic>> transactions) async {
    final money = NumberFormat.currency(locale: 'en_KE', symbol: 'KES ');
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (context) => SafeArea(
        child: SizedBox(
          height: MediaQuery.sizeOf(context).height * 0.78,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              const Text('Transaction History',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              ...transactions.map((transaction) => ListTile(
                    dense: true,
                    title: Text(
                        '${transaction['description'] ?? transaction['transaction_type'] ?? '-'}'),
                    subtitle: Text(
                        '${transaction['status'] ?? '-'} • ${transaction['created_at'] ?? ''}'),
                    trailing: Text(
                        money.format(_toDouble(transaction['amount']).abs())),
                  )),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _deleteMember() async {
    final token = ref.read(authControllerProvider).appToken ?? '';
    if (token.isEmpty || _busy) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Delete Member'),
        content: const Text(
            'Are you sure you want to delete this member? This action cannot be undone.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    setState(() => _busy = true);
    try {
      await _service.deleteMember(memberId: widget.memberId);
      await _clearAdminCache();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Member deleted successfully.')),
      );
      context.go('/admin/members');
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Delete failed: $e')),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<Map<String, dynamic>> _load({bool forceRefresh = false}) async {
    final token = ref.read(authControllerProvider).appToken ?? '';
    if (token.isEmpty) throw Exception('Missing session token');
    return _service.fetchAdminMemberDetails(
      appToken: token,
      memberId: widget.memberId,
      forceRefresh: forceRefresh,
    );
  }

  Future<void> _clearAdminCache() async {
    await _service.clearAdminCache(
      ref.read(authControllerProvider).appToken ?? '',
    );
  }

  @override
  Widget build(BuildContext context) {
    final money = NumberFormat.currency(locale: 'en_KE', symbol: 'KES ');
    return AdminShell(
      title: 'Member Details',
      route: '/admin/members',
      actions: [
        IconButton(
          onPressed: _busy
              ? null
              : () => setState(() => _future = _load(forceRefresh: true)),
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
            final message = snapshot.error.toString();
            if (_isUnauthorizedError(message)) {
              _handleSessionExpired();
              return const Center(
                child: Padding(
                  padding: EdgeInsets.all(16),
                  child: Text('Session expired. Redirecting to login...'),
                ),
              );
            }
            return Center(child: Text(message));
          }
          final payload = snapshot.data ?? const {};
          final member = _asMap(payload['member']);
          final dependants = _asMapList(payload['dependants']);
          final cases = _asMapList(payload['cases']);
          final tx = _asMapList(payload['transactions']);
          final status = '${member['status'] ?? 'unknown'}';
          final name = '${member['name'] ?? 'Member'}';
          final sections = const ['Personal Details', 'Dependants', 'Cases'];
          final initials = name
              .trim()
              .split(RegExp(r'\s+'))
              .take(2)
              .map((part) => part.isEmpty ? '' : part[0].toUpperCase())
              .join();
          final dateFormatter = DateFormat('dd MMM yyyy');

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Member Profile',
                            style: Theme.of(context)
                                .textTheme
                                .titleLarge
                                ?.copyWith(fontWeight: FontWeight.w700)),
                        const SizedBox(height: 3),
                        Text('View and manage this member’s information',
                            style: Theme.of(context).textTheme.bodySmall),
                      ],
                    ),
                  ),
                  OutlinedButton.icon(
                    onPressed: _busy ? null : () => _editMember(member),
                    icon: const Icon(Icons.edit_outlined, size: 18),
                    label: const Text('Edit'),
                  ),
                  const SizedBox(width: 8),
                  IconButton(
                    tooltip: 'Delete member',
                    onPressed: _busy ? null : _deleteMember,
                    icon: const Icon(Icons.delete_outline),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    children: [
                      CircleAvatar(
                        radius: 30,
                        child: Text(initials.isEmpty ? 'M' : initials,
                            style:
                                const TextStyle(fontWeight: FontWeight.w700)),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(name,
                                style: Theme.of(context)
                                    .textTheme
                                    .titleMedium
                                    ?.copyWith(fontWeight: FontWeight.w700)),
                            const SizedBox(height: 4),
                            Text(
                                'Member No. ${member['member_number'] ?? '-'}'),
                            const SizedBox(height: 7),
                            _statusBadge(status),
                          ],
                        ),
                      ),
                      TextButton(
                        onPressed: _busy ? null : () => _changeStatus(status),
                        child: Text(status.toLowerCase() == 'active'
                            ? 'Deactivate'
                            : 'Activate'),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Wallet',
                          style: TextStyle(fontWeight: FontWeight.w700)),
                      const SizedBox(height: 5),
                      Text(money.format(_toDouble(member['wallet_balance'])),
                          style: Theme.of(context)
                              .textTheme
                              .headlineSmall
                              ?.copyWith(fontWeight: FontWeight.w700)),
                      const SizedBox(height: 12),
                      Wrap(spacing: 8, runSpacing: 4, children: [
                        OutlinedButton.icon(
                            onPressed: _busy ? null : _fundWallet,
                            icon: const Icon(Icons.add, size: 18),
                            label: const Text('Fund wallet')),
                        OutlinedButton.icon(
                            onPressed: _busy ? null : _transferFromMember,
                            icon: const Icon(Icons.swap_horiz, size: 18),
                            label: const Text('Transfer funds')),
                        TextButton.icon(
                            onPressed: () => _showTransactions(tx),
                            icon: const Icon(Icons.receipt_long, size: 18),
                            label: const Text('Transaction history')),
                      ]),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 14),
              SegmentedButton<int>(
                segments: [
                  for (var i = 0; i < sections.length; i++)
                    ButtonSegment(value: i, label: Text(sections[i]))
                ],
                selected: {_selectedSection},
                showSelectedIcon: false,
                onSelectionChanged: (value) =>
                    setState(() => _selectedSection = value.first),
              ),
              const SizedBox(height: 12),
              if (_selectedSection == 0) ...[
                _sectionCard('Personal Information', [
                  _detailRow('Full name', name),
                  _detailRow('Gender', _pretty(member['gender'])),
                  _detailRow('Date of birth',
                      _formatDate(member['date_of_birth'], dateFormatter)),
                  _detailRow(
                      'National ID', '${member['national_id_number'] ?? '-'}'),
                  _detailRow(
                      'Phone number', '${member['phone_number'] ?? '-'}'),
                  _detailRow(
                      'Email address', '${member['email_address'] ?? '-'}'),
                  _detailRow('Residence', '${member['residence'] ?? '-'}'),
                  _detailRow(
                      'Member since',
                      _formatDate(
                          member['registration_date'] ?? member['created_at'],
                          dateFormatter)),
                ]),
                const SizedBox(height: 12),
                _sectionCard('Next of Kin', [
                  _detailRow('Name',
                      '${_asMap(member['next_of_kin'])['name'] ?? '-'}'),
                  _detailRow('Relationship',
                      '${_asMap(member['next_of_kin'])['relationship'] ?? '-'}'),
                  _detailRow('Phone number',
                      '${_asMap(member['next_of_kin'])['phoneNumber'] ?? _asMap(member['next_of_kin'])['phone_number'] ?? '-'}'),
                ]),
              ] else if (_selectedSection == 1) ...[
                _sectionCard('Dependants (${dependants.length})', [
                  Align(
                      alignment: Alignment.centerRight,
                      child: TextButton.icon(
                          onPressed: _busy ? null : _addDependant,
                          icon: const Icon(Icons.person_add_alt_1),
                          label: const Text('Add dependant'))),
                  if (dependants.isEmpty)
                    const Padding(
                        padding: EdgeInsets.symmetric(vertical: 16),
                        child: Center(child: Text('No dependants recorded'))),
                  ...dependants.map((dependant) => ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text('${dependant['name'] ?? '-'}'),
                        subtitle: Text(
                            '${_pretty(dependant['relationship'])} • ${_pretty(dependant['gender'])} • ${_formatDate(dependant['date_of_birth'], dateFormatter)}'),
                        trailing: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Text(
                                  dependant['is_eligible'] == true
                                      ? 'Eligible'
                                      : 'Not eligible',
                                  style:
                                      Theme.of(context).textTheme.labelSmall),
                              if (dependant['is_disabled'] == true)
                                Text('Disability',
                                    style:
                                        Theme.of(context).textTheme.labelSmall),
                            ]),
                      )),
                ]),
              ] else ...[
                _sectionCard('Associated Cases (${cases.length})', [
                  if (cases.isEmpty)
                    const Padding(
                        padding: EdgeInsets.symmetric(vertical: 16),
                        child: Center(child: Text('No associated cases'))),
                  ...cases.map((item) => ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(
                            '#${item['case_number'] ?? '-'} • ${_pretty(item['case_type'])}'),
                        subtitle: Text(
                            'Contribution: ${money.format(_toDouble(item['contribution_per_member']))}'),
                        trailing: _statusBadge(
                            '${item['status'] ?? (item['is_active'] == true ? 'active' : 'closed')}'),
                        onTap: item['id'] == null
                            ? null
                            : () => context.push('/admin/cases/${item['id']}'),
                      )),
                ]),
              ],
            ],
          );
        },
      ),
    );
  }

  Widget _sectionCard(String title, List<Widget> children) => Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            ...children,
          ]),
        ),
      );

  Widget _detailRow(String label, String value) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SizedBox(
              width: 130,
              child: Text(label,
                  style: const TextStyle(color: Color(0xFF64748B)))),
          Expanded(child: Text(value.isEmpty ? '-' : value)),
        ]),
      );

  Widget _statusBadge(String status) {
    final normalized = status.toLowerCase();
    final color = normalized == 'active' || normalized == 'paid'
        ? const Color(0xFF15803D)
        : normalized == 'probation'
            ? const Color(0xFFB45309)
            : const Color(0xFF64748B);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
          color: color.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(20)),
      child: Text(_pretty(status),
          style: TextStyle(
              color: color, fontSize: 12, fontWeight: FontWeight.w600)),
    );
  }

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

  String _formatDate(dynamic value, DateFormat formatter) {
    final date = DateTime.tryParse('${value ?? ''}');
    return date == null ? '-' : formatter.format(date.toLocal());
  }

  Map<String, dynamic> _asMap(dynamic value) {
    if (value is Map) return value.cast<String, dynamic>();
    return const {};
  }

  List<Map<String, dynamic>> _asMapList(dynamic value) {
    if (value is! List) return const <Map<String, dynamic>>[];
    return value
        .whereType<Map>()
        .map((e) => e.cast<String, dynamic>())
        .toList();
  }

  double _toDouble(dynamic value) {
    if (value == null) return 0;
    if (value is num) return value.toDouble();
    return double.tryParse(value.toString()) ?? 0;
  }

  bool _isUnauthorizedError(String message) {
    final m = message.toLowerCase();
    return m.contains('401') ||
        m.contains('unauthorized') ||
        m.contains('exp claim') ||
        m.contains('timestamp check failing');
  }

  void _handleSessionExpired() {
    if (_redirectingForSession) return;
    _redirectingForSession = true;
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted) return;
      await ref.read(authControllerProvider.notifier).logout();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Session expired. Please log in again.'),
        ),
      );
      context.go('/login');
    });
  }
}
