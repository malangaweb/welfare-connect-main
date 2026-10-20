import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/services/live_data_service.dart';
import '../auth/auth_controller.dart';
import 'admin_shell.dart';

class AdminAddMemberScreen extends ConsumerStatefulWidget {
  const AdminAddMemberScreen({super.key});

  @override
  ConsumerState<AdminAddMemberScreen> createState() =>
      _AdminAddMemberScreenState();
}

class _AdminAddMemberScreenState extends ConsumerState<AdminAddMemberScreen> {
  final _service = LiveDataService();
  final _formKey = GlobalKey<FormState>();
  final _memberNumber = TextEditingController();
  final _name = TextEditingController();
  final _nationalId = TextEditingController();
  final _phone = TextEditingController();
  final _email = TextEditingController();
  final _nextOfKinName = TextEditingController();
  final _nextOfKinRelationship = TextEditingController();
  final _nextOfKinPhone = TextEditingController();
  final _pin = TextEditingController();
  final _registrationFee = TextEditingController(text: '0');
  final _username = TextEditingController();
  final _password = TextEditingController();

  List<String> _residences = const [];
  String? _residence;
  String? _gender;
  DateTime? _dateOfBirth;
  bool _feePaid = false;
  bool _loading = true;
  bool _saving = false;
  final List<_DependantFields> _dependants = [];

  @override
  void initState() {
    super.initState();
    _loadFormData();
  }

  @override
  void dispose() {
    for (final controller in [
      _memberNumber,
      _name,
      _nationalId,
      _phone,
      _email,
      _nextOfKinName,
      _nextOfKinRelationship,
      _nextOfKinPhone,
      _pin,
      _registrationFee,
      _username,
      _password,
    ]) {
      controller.dispose();
    }
    for (final dependant in _dependants) {
      dependant.dispose();
    }
    super.dispose();
  }

  Future<void> _loadFormData() async {
    try {
      final results = await Future.wait([
        _service.fetchNextMemberNumber(),
        _service.fetchResidences(),
      ]);
      _memberNumber.text = results[0] as String;
      _residences = results[1] as List<String>;
      final token = ref.read(authControllerProvider).appToken ?? '';
      Map<String, dynamic>? settings;
      if (token.isNotEmpty) {
        try {
          settings = await _service.fetchSettings(appToken: token);
        } catch (_) {
          settings = null;
        }
      }
      if (!mounted) return;
      _registrationFee.text = '${settings?['registration_fee'] ?? 500}';
      setState(() => _loading = false);
    } catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not load registration details: $e')),
      );
    }
  }

  Future<void> _pickDate({required bool dependant, int index = -1}) async {
    final current = dependant ? _dependants[index].dateOfBirth : _dateOfBirth;
    final date = await showDatePicker(
      context: context,
      initialDate: current ?? DateTime(1990),
      firstDate: DateTime(1900),
      lastDate: DateTime.now(),
    );
    if (date == null || !mounted) return;
    setState(() {
      if (dependant) {
        _dependants[index].dateOfBirth = date;
      } else {
        _dateOfBirth = date;
      }
    });
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_dateOfBirth == null || _gender == null || _residence == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Complete the member details first.')),
      );
      return;
    }
    if (_pin.text.isNotEmpty && _pin.text.length != 6) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('PIN must contain exactly 6 digits.')),
      );
      return;
    }
    if (_username.text.trim().isNotEmpty != _password.text.isNotEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content:
              Text('Enter both username and password, or leave both blank.'),
        ),
      );
      return;
    }
    for (final dependant in _dependants) {
      if (dependant.name.text.trim().isEmpty ||
          dependant.relationship.text.trim().isEmpty ||
          dependant.dateOfBirth == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Complete or remove each dependant.')),
        );
        return;
      }
    }

    final fee = double.tryParse(_registrationFee.text.trim());
    if (fee == null || fee < 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter a valid registration fee.')),
      );
      return;
    }

    setState(() => _saving = true);
    var followupWarning = '';
    try {
      final result = await _service.createAdminMember(
        memberNumber: _memberNumber.text.trim(),
        name: _name.text.trim(),
        gender: _gender!,
        dateOfBirth: DateFormat('yyyy-MM-dd').format(_dateOfBirth!),
        nationalIdNumber: _nationalId.text.trim(),
        phoneNumber:
            _phone.text.trim().isEmpty ? null : _normalizePhone(_phone.text),
        emailAddress: _email.text.trim().isEmpty ? null : _email.text.trim(),
        residence: _residence!,
        nextOfKin: {
          'name': _nextOfKinName.text.trim(),
          'relationship': _nextOfKinRelationship.text.trim(),
          'phoneNumber': _nextOfKinPhone.text.trim(),
        },
        dependants: _dependants
            .map((dependant) => {
                  'id': dependant.id,
                  'name': dependant.name.text.trim(),
                  'gender': dependant.gender,
                  'relationship': dependant.relationship.text.trim(),
                  'date_of_birth':
                      DateFormat('yyyy-MM-dd').format(dependant.dateOfBirth!),
                  'is_disabled': dependant.isDisabled,
                  'is_eligible': true,
                })
            .toList(),
        registrationFee: fee,
        feePaid: _feePaid,
        pin: _pin.text.isEmpty ? null : _pin.text,
      );

      final token = ref.read(authControllerProvider).appToken ?? '';
      final normalizedPhone = _normalizePhone(_phone.text);
      if (normalizedPhone.isNotEmpty && token.isNotEmpty) {
        try {
          await _service.sendMemberWelcomeSms(
            appToken: token,
            memberId: '${result['id']}',
            memberNumber: _memberNumber.text.trim(),
            name: _name.text.trim(),
            phoneNumber: normalizedPhone,
          );
        } catch (e) {
          followupWarning = ' Welcome SMS failed: $e';
        }
      }
      if (_username.text.trim().isNotEmpty && token.isNotEmpty) {
        try {
          await _service.createManagedMemberUser(
            appToken: token,
            username: _username.text.trim(),
            password: _password.text,
            name: _name.text.trim(),
            memberId: '${result['id']}',
          );
        } catch (e) {
          followupWarning = '$followupWarning Login setup failed: $e';
        }
      }

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
              'Member ${_memberNumber.text.trim()} added successfully.$followupWarning'),
        ),
      );
      context.pop(true);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not add member: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AdminShell(
      title: 'Add member',
      route: '/admin/members',
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : Form(
              key: _formKey,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  Text('Register new member',
                      style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 16),
                  _field(_memberNumber, 'Member number', required: true),
                  _field(_name, 'Full name', required: true),
                  DropdownButtonFormField<String>(
                    initialValue: _gender,
                    decoration: const InputDecoration(labelText: 'Gender'),
                    items: const [
                      DropdownMenuItem(value: 'male', child: Text('Male')),
                      DropdownMenuItem(value: 'female', child: Text('Female')),
                    ],
                    onChanged: (value) => setState(() => _gender = value),
                    validator: (value) => value == null ? 'Required' : null,
                  ),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Date of birth'),
                    subtitle: Text(_dateOfBirth == null
                        ? 'Select date'
                        : DateFormat('dd MMM yyyy').format(_dateOfBirth!)),
                    trailing: const Icon(Icons.calendar_month_outlined),
                    onTap: () => _pickDate(dependant: false),
                  ),
                  _field(_nationalId, 'National ID number', required: true),
                  _field(_phone, 'Phone number', inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly
                  ]),
                  _field(_email, 'Email address', email: true),
                  DropdownButtonFormField<String>(
                    initialValue: _residence,
                    decoration: const InputDecoration(labelText: 'Residence'),
                    items: _residences
                        .map((name) =>
                            DropdownMenuItem(value: name, child: Text(name)))
                        .toList(),
                    onChanged: (value) => setState(() => _residence = value),
                    validator: (value) => value == null ? 'Required' : null,
                  ),
                  const SizedBox(height: 20),
                  _sectionTitle('Next of kin'),
                  _field(_nextOfKinName, 'Name', required: true),
                  _field(_nextOfKinRelationship, 'Relationship',
                      required: true),
                  _field(_nextOfKinPhone, 'Phone number', required: true),
                  const SizedBox(height: 20),
                  Row(
                    children: [
                      Expanded(child: _sectionTitle('Dependants')),
                      TextButton.icon(
                        onPressed: () => setState(
                          () => _dependants.add(_DependantFields()),
                        ),
                        icon: const Icon(Icons.add, size: 18),
                        label: const Text('Add'),
                      ),
                    ],
                  ),
                  ..._dependants.indexed.map((entry) {
                    final (index, dependant) = entry;
                    return Card(
                      margin: const EdgeInsets.only(bottom: 8),
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Column(
                          children: [
                            Row(
                              children: [
                                Expanded(child: Text('Dependant ${index + 1}')),
                                IconButton(
                                  onPressed: () => setState(() {
                                    _dependants.removeAt(index).dispose();
                                  }),
                                  icon: const Icon(Icons.delete_outline),
                                ),
                              ],
                            ),
                            _field(dependant.name, 'Name', required: true),
                            _field(dependant.relationship, 'Relationship',
                                required: true),
                            DropdownButtonFormField<String>(
                              initialValue: dependant.gender,
                              decoration:
                                  const InputDecoration(labelText: 'Gender'),
                              items: const [
                                DropdownMenuItem(
                                    value: 'male', child: Text('Male')),
                                DropdownMenuItem(
                                    value: 'female', child: Text('Female')),
                              ],
                              onChanged: (value) => setState(
                                  () => dependant.gender = value ?? 'male'),
                            ),
                            ListTile(
                              contentPadding: EdgeInsets.zero,
                              title: const Text('Date of birth'),
                              subtitle: Text(dependant.dateOfBirth == null
                                  ? 'Select date'
                                  : DateFormat('dd MMM yyyy')
                                      .format(dependant.dateOfBirth!)),
                              onTap: () =>
                                  _pickDate(dependant: true, index: index),
                            ),
                            CheckboxListTile(
                              contentPadding: EdgeInsets.zero,
                              title: const Text('Has a disability'),
                              value: dependant.isDisabled,
                              onChanged: (value) => setState(
                                  () => dependant.isDisabled = value ?? false),
                            ),
                          ],
                        ),
                      ),
                    );
                  }),
                  const SizedBox(height: 20),
                  _sectionTitle('Registration fee'),
                  _field(_registrationFee, 'Fee amount',
                      required: true, numeric: true),
                  CheckboxListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Registration fee has been paid'),
                    value: _feePaid,
                    onChanged: (value) =>
                        setState(() => _feePaid = value ?? false),
                  ),
                  const SizedBox(height: 16),
                  _sectionTitle('Login credentials (optional)'),
                  _field(_username, 'Username'),
                  _field(_password, 'Password', obscure: true),
                  _field(_pin, 'Member PIN (6 digits)',
                      numeric: true, obscure: true),
                  const SizedBox(height: 20),
                  FilledButton.icon(
                    onPressed: _saving ? null : _submit,
                    icon: _saving
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.person_add_alt_1),
                    label: Text(_saving ? 'Adding member…' : 'Add member'),
                  ),
                ],
              ),
            ),
    );
  }

  Widget _field(
    TextEditingController controller,
    String label, {
    bool required = false,
    bool email = false,
    bool numeric = false,
    bool obscure = false,
    List<TextInputFormatter>? inputFormatters,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: TextFormField(
        controller: controller,
        inputFormatters: inputFormatters,
        obscureText: obscure,
        keyboardType: numeric
            ? TextInputType.number
            : email
                ? TextInputType.emailAddress
                : TextInputType.text,
        decoration: InputDecoration(labelText: label),
        validator: (value) {
          final text = value?.trim() ?? '';
          if (required && text.isEmpty) return 'Required';
          if (label == 'Full name' && text.length < 2) {
            return 'Enter at least 2 characters';
          }
          if (email && text.isNotEmpty && !text.contains('@')) {
            return 'Enter a valid email';
          }
          if (label == 'Member PIN (6 digits)' &&
              text.isNotEmpty &&
              (text.length != 6 || int.tryParse(text) == null)) {
            return 'Enter 6 digits';
          }
          return null;
        },
      ),
    );
  }

  String _normalizePhone(String phone) {
    final digits = phone.replaceAll(RegExp(r'\D'), '');
    if (digits.startsWith('254')) return digits;
    if (digits.length == 9 && digits.startsWith('7')) return '254$digits';
    if (digits.startsWith('0')) return '254${digits.substring(1)}';
    return digits;
  }

  Widget _sectionTitle(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Align(
          alignment: Alignment.centerLeft,
          child: Text(text,
              style:
                  const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
        ),
      );
}

class _DependantFields {
  final id = _createUuid();
  final name = TextEditingController();
  final relationship = TextEditingController();
  String gender = 'male';
  DateTime? dateOfBirth;
  bool isDisabled = false;

  void dispose() {
    name.dispose();
    relationship.dispose();
  }
}

String _createUuid() {
  final random = math.Random.secure();
  final bytes = List<int>.generate(16, (_) => random.nextInt(256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  final hex =
      bytes.map((byte) => byte.toRadixString(16).padLeft(2, '0')).join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
}
