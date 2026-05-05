import 'package:supabase_flutter/supabase_flutter.dart';

import 'supabase_service.dart';

class MemberWalletSnapshot {
  final double walletBalance;
  final double totalCredit;
  final double totalDebit;
  final List<Map<String, dynamic>> recentTransactions;
  final bool isDefaulting;
  final double arrearsTotal;
  final double penaltyTotal;
  final int unpaidCasesCount;

  const MemberWalletSnapshot({
    required this.walletBalance,
    required this.totalCredit,
    required this.totalDebit,
    required this.recentTransactions,
    required this.isDefaulting,
    required this.arrearsTotal,
    required this.penaltyTotal,
    required this.unpaidCasesCount,
  });
}

class MemberCaseSnapshot {
  final String id;
  final String caseNumber;
  final String caseType;
  final double contributionPerMember;
  final bool paid;

  const MemberCaseSnapshot({
    required this.id,
    required this.caseNumber,
    required this.caseType,
    required this.contributionPerMember,
    required this.paid,
  });
}

class AdminDashboardSnapshot {
  final int totalMembers;
  final int activeCases;
  final double pendingSuspenseTotal;
  final int pendingSuspenseCount;
  final List<Map<String, dynamic>> recentActivity;

  const AdminDashboardSnapshot({
    required this.totalMembers,
    required this.activeCases,
    required this.pendingSuspenseTotal,
    required this.pendingSuspenseCount,
    required this.recentActivity,
  });
}

class LiveDataService {
  final SupabaseClient _client = Supabase.instance.client;
  final SupabaseService _supabaseService = SupabaseService();

  Future<MemberWalletSnapshot> fetchMemberWalletData({
    required String memberId,
    required String appToken,
  }) async {
    final summaryResponse = await _supabaseService.invokeFunction(
      'api-member-summary',
      body: {'member_id': memberId},
      headers: {'x-app-token': appToken},
    );

    if (summaryResponse.status < 200 || summaryResponse.status >= 300) {
      throw Exception('Failed to load member summary');
    }

    final txResponse = await _supabaseService.invokeFunction(
      'api-member-transactions',
      body: {'member_id': memberId, 'page': 1, 'page_size': 50},
      headers: {'x-app-token': appToken},
    );

    if (txResponse.status < 200 || txResponse.status >= 300) {
      throw Exception('Failed to load member transactions');
    }

    final summary =
        (summaryResponse.data as Map?)?.cast<String, dynamic>() ?? const {};
    final member =
        (summary['member'] as Map?)?.cast<String, dynamic>() ?? const {};
    final txBody =
        (txResponse.data as Map?)?.cast<String, dynamic>() ?? const {};
    final txList = (txBody['transactions'] as List?)
            ?.whereType<Map>()
            .map((e) => e.cast<String, dynamic>())
            .toList() ??
        const <Map<String, dynamic>>[];

    double credits = 0;
    double debits = 0;
    double arrearsTotal = 0;
    double penaltyTotal = 0;
    for (final tx in txList) {
      final amount = _toDouble(tx['amount']);
      final type = (tx['transaction_type'] ?? '').toString().toLowerCase();
      final status = (tx['status'] ?? '').toString().toLowerCase();
      if (status == 'reversed' ||
          (status.isNotEmpty && status != 'completed')) {
        continue;
      }
      if (type == 'wallet_funding' ||
          type == 'deposit' ||
          type == 'contribution_refund' ||
          type == 'case_wallet_refund') {
        credits += amount.abs();
      } else if (type == 'contribution' ||
          type == 'case_wallet_deduction' ||
          type == 'disbursement' ||
          type == 'arrears' ||
          type == 'penalty' ||
          type == 'registration' ||
          type == 'renewal') {
        debits += amount.abs();
      }
      if (type == 'arrears') {
        arrearsTotal += amount.abs();
      }
      if (type == 'penalty') {
        penaltyTotal += amount.abs();
      }
    }
    final activeCases = (summary['active_cases_summary'] as List?)
            ?.whereType<Map>()
            .map((e) => e.cast<String, dynamic>())
            .toList() ??
        const <Map<String, dynamic>>[];
    final unpaidCasesCount = activeCases.where((c) => c['paid'] != true).length;
    final walletBalance = _toDouble(member['wallet_balance']);

    return MemberWalletSnapshot(
      walletBalance: walletBalance,
      totalCredit: credits,
      totalDebit: debits,
      recentTransactions: txList.take(5).toList(),
      isDefaulting:
          walletBalance < 0 || arrearsTotal > 0 || unpaidCasesCount > 0,
      arrearsTotal: arrearsTotal,
      penaltyTotal: penaltyTotal,
      unpaidCasesCount: unpaidCasesCount,
    );
  }

  Future<List<MemberCaseSnapshot>> fetchMemberCases({
    required String memberId,
    required String appToken,
  }) async {
    final response = await _supabaseService.invokeFunction(
      'api-member-summary',
      body: {'member_id': memberId},
      headers: {'x-app-token': appToken},
    );

    if (response.status < 200 || response.status >= 300) {
      throw Exception('Failed to load member cases');
    }

    final payload =
        (response.data as Map?)?.cast<String, dynamic>() ?? const {};
    final cases = (payload['active_cases_summary'] as List?)
            ?.whereType<Map>()
            .map((e) => e.cast<String, dynamic>())
            .toList() ??
        const <Map<String, dynamic>>[];

    return cases
        .map((c) => MemberCaseSnapshot(
              id: (c['id'] ?? '').toString(),
              caseNumber: (c['case_number'] ?? 'N/A').toString(),
              caseType: (c['case_type'] ?? 'unknown').toString(),
              contributionPerMember: _toDouble(c['contribution_per_member']),
              paid: c['paid'] == true,
            ))
        .toList();
  }

  Future<List<Map<String, dynamic>>> fetchMemberTransactions({
    required String memberId,
    required String appToken,
    int pageSize = 200,
  }) async {
    final txResponse = await _supabaseService.invokeFunction(
      'api-member-transactions',
      body: {'member_id': memberId, 'page': 1, 'page_size': pageSize},
      headers: {'x-app-token': appToken},
    );

    if (txResponse.status < 200 || txResponse.status >= 300) {
      throw Exception('Failed to load member transactions');
    }

    final txBody =
        (txResponse.data as Map?)?.cast<String, dynamic>() ?? const {};
    return (txBody['transactions'] as List?)
            ?.whereType<Map>()
            .map((e) => e.cast<String, dynamic>())
            .toList() ??
        const <Map<String, dynamic>>[];
  }

  Future<Map<String, dynamic>> fetchMemberSummary({
    required String memberId,
    required String appToken,
  }) async {
    final response = await _supabaseService.invokeFunction(
      'api-member-summary',
      body: {'member_id': memberId},
      headers: {'x-app-token': appToken},
    );
    if (response.status < 200 || response.status >= 300) {
      throw Exception('Failed to load member summary');
    }
    return (response.data as Map?)?.cast<String, dynamic>() ?? const {};
  }

  Future<Map<String, dynamic>> buildMemberReport({
    required String memberId,
    required String appToken,
  }) async {
    final summary =
        await fetchMemberSummary(memberId: memberId, appToken: appToken);
    final tx = await fetchMemberTransactions(
      memberId: memberId,
      appToken: appToken,
      pageSize: 500,
    );
    final completed = tx.where((t) {
      final s = (t['status'] ?? '').toString();
      return s.isEmpty || s == 'completed';
    }).toList();
    final total = completed.length;
    final credits = completed.fold<double>(0, (sum, t) {
      final type = (t['transaction_type'] ?? '').toString();
      final amount = _toDouble(t['amount']).abs();
      if (type == 'wallet_funding' ||
          type == 'contribution_refund' ||
          type == 'case_wallet_refund') {
        return sum + amount;
      }
      return sum;
    });
    final debits = completed.fold<double>(0, (sum, t) {
      final type = (t['transaction_type'] ?? '').toString();
      final amount = _toDouble(t['amount']).abs();
      if (type == 'case_wallet_deduction' ||
          type == 'arrears' ||
          type == 'penalty' ||
          type == 'registration' ||
          type == 'renewal') {
        return sum + amount;
      }
      return sum;
    });
    final activeCases = (summary['active_cases_summary'] as List?)?.length ?? 0;
    return {
      'total_transactions': total,
      'total_credits': credits,
      'total_debits': debits,
      'active_cases': activeCases,
      'wallet_balance':
          _toDouble((summary['member'] as Map?)?['wallet_balance']),
    };
  }

  Future<List<Map<String, dynamic>>> searchMembers({
    required String query,
    required String excludeMemberId,
  }) async {
    if (query.trim().isEmpty) return const [];
    final rows = await _client
        .from('members')
        .select('id, name, member_number')
        .or('name.ilike.%$query%,member_number.ilike.%$query%')
        .neq('id', excludeMemberId)
        .limit(8);
    return (rows as List)
        .whereType<Map>()
        .map((e) => e.cast<String, dynamic>())
        .toList();
  }

  Future<void> transferFunds({
    required String fromMemberId,
    required String toMemberId,
    required double amount,
    required String toMemberNumber,
  }) async {
    final referenceValue = 'Transfer to $toMemberNumber';
    final primaryResult = await (_client.rpc as dynamic)('transfer_funds', {
      'from_member_id': fromMemberId,
      'to_member_id': toMemberId,
      'amount': amount,
      'reference_text': referenceValue,
    });
    if (primaryResult.error != null) {
      final fallbackResult = await (_client.rpc as dynamic)('transfer_funds', {
        'from_member_id': fromMemberId,
        'to_member_id': toMemberId,
        'amount': amount,
        'reference': referenceValue,
      });
      if (fallbackResult.error != null) {
        throw Exception(fallbackResult.error.message ?? 'Transfer failed');
      }
    }
  }

  Future<void> payToCase({
    required String memberId,
    required String caseId,
    required String caseNumber,
    required double amount,
  }) async {
    final existing = await _client
        .from('transactions')
        .select('status, amount, transaction_type')
        .eq('member_id', memberId)
        .eq('case_id', caseId)
        .inFilter('transaction_type', [
      'contribution',
      'case_wallet_deduction',
      'contribution_refund',
      'case_wallet_refund',
    ]);

    final netPaid =
        (existing as List).whereType<Map>().fold<double>(0, (sum, row) {
      final status = (row['status'] ?? '').toString();
      if (status.isNotEmpty && status != 'completed') return sum;
      final txType = (row['transaction_type'] ?? '').toString();
      final txAmount = _toDouble(row['amount']);
      if (txType == 'contribution' || txType == 'case_wallet_deduction') {
        return sum + txAmount.abs();
      }
      if (txType == 'contribution_refund' || txType == 'case_wallet_refund') {
        return sum - txAmount.abs();
      }
      return sum;
    });

    if (netPaid > 0) {
      throw Exception('Case already paid');
    }

    await _client.from('transactions').insert({
      'member_id': memberId,
      'case_id': caseId,
      'amount': amount,
      'transaction_type': 'case_wallet_deduction',
      'status': 'completed',
      'description':
          'Case wallet deduction for case #$caseNumber (member portal)',
      'metadata': {'source': 'member_portal_pay_to_case'},
    });
  }

  Future<void> updateMemberPin({
    required String memberId,
    required String oldPin,
    required String newPin,
  }) async {
    final response = await (_client.rpc as dynamic)('update_member_pin', {
      'p_member_id': memberId,
      'p_old_pin': oldPin,
      'p_new_pin': newPin,
    });
    if (response.error != null) {
      throw Exception(response.error.message ?? 'Failed to update PIN');
    }
    final data = response.data as Map<String, dynamic>?;
    if (data != null && data['success'] == false) {
      throw Exception((data['message'] ?? 'Failed to update PIN').toString());
    }
  }

  Future<AdminDashboardSnapshot> fetchAdminDashboard() async {
    final members = await _client.from('members').select('id');
    final activeCases =
        await _client.from('cases').select('id').eq('is_active', true);
    final suspenseRows = await _client
        .from('wrong_mpesa_transactions')
        .select('amount, status')
        .eq('status', 'pending');

    final recentTx = await _client
        .from('transactions')
        .select('description, transaction_type, created_at, amount, status')
        .order('created_at', ascending: false)
        .limit(5);

    final suspenseList = (suspenseRows as List)
        .whereType<Map>()
        .map((e) => e.cast<String, dynamic>())
        .toList();
    final suspenseTotal = suspenseList.fold<double>(
        0, (sum, row) => sum + _toDouble(row['amount']));

    return AdminDashboardSnapshot(
      totalMembers: (members as List).length,
      activeCases: (activeCases as List).length,
      pendingSuspenseTotal: suspenseTotal,
      pendingSuspenseCount: suspenseList.length,
      recentActivity: (recentTx as List)
          .whereType<Map>()
          .map((e) => e.cast<String, dynamic>())
          .toList(),
    );
  }

  Future<List<Map<String, dynamic>>> fetchAdminMembers({
    int page = 1,
    int pageSize = 25,
    String search = '',
  }) async {
    var query = _client
        .from('members')
        .select(
            'id, member_number, name, phone_number, wallet_balance, status, is_active');
    if (search.trim().isNotEmpty) {
      final q = search.trim();
      query = query.or(
        'name.ilike.%$q%,member_number.ilike.%$q%,phone_number.ilike.%$q%',
      );
    }
    final rows = await query.limit(5000);
    final mapped = (rows as List)
        .whereType<Map>()
        .map((e) => e.cast<String, dynamic>())
        .toList();
    mapped.sort((a, b) {
      final aNum = _memberNumberOrder((a['member_number'] ?? '').toString());
      final bNum = _memberNumberOrder((b['member_number'] ?? '').toString());
      final numCmp = aNum.compareTo(bNum);
      if (numCmp != 0) return numCmp;
      return (a['member_number'] ?? '')
          .toString()
          .compareTo((b['member_number'] ?? '').toString());
    });
    final from = (page - 1) * pageSize;
    if (from >= mapped.length) return const [];
    final to = (from + pageSize).clamp(0, mapped.length);
    return mapped.sublist(from, to);
  }

  Future<List<Map<String, dynamic>>> fetchAdminCases({int limit = 200}) async {
    final rows = await _client
        .from('cases')
        .select(
            'id, case_number, case_type, contribution_per_member, expected_amount, actual_amount, is_active, is_finalized, created_at')
        .order('created_at', ascending: false)
        .limit(limit);
    return (rows as List)
        .whereType<Map>()
        .map((e) => e.cast<String, dynamic>())
        .toList();
  }

  Future<void> finalizeCase({required String caseId, required double actualAmount}) async {
    await _client.from('cases').update({
      'is_finalized': true,
      'is_active': false,
      'actual_amount': actualAmount,
    }).eq('id', caseId);
  }

  Future<void> reopenCase({required String caseId}) async {
    await _client.from('cases').update({
      'is_finalized': false,
      'is_active': true,
    }).eq('id', caseId);
  }

  Future<List<Map<String, dynamic>>> fetchAdminTransactions({
    int page = 1,
    int pageSize = 30,
    String search = '',
  }) async {
    final from = (page - 1) * pageSize;
    final to = from + pageSize - 1;
    var query = _client
        .from('transactions')
        .select(
            'id, member_id, amount, transaction_type, status, payment_method, description, created_at');
    if (search.trim().isNotEmpty) {
      final q = search.trim();
      query = query.or(
        'description.ilike.%$q%,transaction_type.ilike.%$q%,status.ilike.%$q%,payment_method.ilike.%$q%',
      );
    }
    final rows =
        await query.order('created_at', ascending: false).range(from, to);
    return (rows as List)
        .whereType<Map>()
        .map((e) => e.cast<String, dynamic>())
        .toList();
  }

  Future<void> reverseTransaction({
    required String transactionId,
    required String reason,
    String? adminUserId,
  }) async {
    final response = await (_client.rpc as dynamic)('revert_transaction', {
      'p_transaction_id': transactionId,
      'p_admin_id': (adminUserId != null && adminUserId.isNotEmpty) ? adminUserId : null,
      'p_reason': reason,
    });
    if (response.error != null) {
      throw Exception(response.error.message ?? 'Failed to reverse transaction');
    }
    final data = response.data as Map<String, dynamic>?;
    if (data != null && data['success'] == false) {
      throw Exception((data['message'] ?? 'Failed to reverse transaction').toString());
    }
  }

  Future<List<Map<String, dynamic>>> fetchSuspenseQueue({int limit = 150}) async {
    final rows = await _client
        .from('wrong_mpesa_transactions')
        .select('id, amount, phone_number, reference, mpesa_receipt_number, transaction_date, status, intended_case_id')
        .eq('status', 'pending')
        .order('transaction_date', ascending: false)
        .limit(limit);
    return (rows as List)
        .whereType<Map>()
        .map((e) => e.cast<String, dynamic>())
        .toList();
  }

  Future<void> autoMatchSuspense() async {
    final response = await (_client.rpc as dynamic)('match_suspense_transactions');
    if (response.error != null) {
      throw Exception(response.error.message ?? 'Auto-match failed');
    }
  }

  Future<void> matchSuspenseWithMember({
    required String appToken,
    required String suspenseId,
    required String memberId,
    String? caseId,
  }) async {
    final response = await _supabaseService.invokeFunction(
      'api-suspense-match',
      body: {
        'suspense_id': suspenseId,
        'member_id': memberId,
        'case_id': caseId,
      },
      headers: {'x-app-token': appToken},
    );
    if (response.status < 200 || response.status >= 300) {
      final payload = (response.data as Map?)?.cast<String, dynamic>();
      throw Exception(payload?['error']?.toString() ?? 'Match failed');
    }
  }

  Future<void> markSuspenseStatus({
    required String suspenseId,
    required String status,
  }) async {
    await _client
        .from('wrong_mpesa_transactions')
        .update({'status': status})
        .eq('id', suspenseId);
  }

  Future<Map<String, dynamic>?> fetchSettings({required String appToken}) async {
    final response = await _supabaseService.invokeFunction(
      'api-settings',
      body: {'action': 'get'},
      headers: {'x-app-token': appToken},
    );
    if (response.status < 200 || response.status >= 300) {
      final payload = (response.data as Map?)?.cast<String, dynamic>();
      throw Exception(payload?['error']?.toString() ?? 'Failed to load settings');
    }
    final payload = (response.data as Map?)?.cast<String, dynamic>() ?? const {};
    return (payload['settings'] as Map?)?.cast<String, dynamic>();
  }

  Future<Map<String, dynamic>?> updateSettings({
    required String appToken,
    required Map<String, dynamic> settings,
  }) async {
    final response = await _supabaseService.invokeFunction(
      'api-settings',
      body: {'action': 'update', 'settings': settings},
      headers: {'x-app-token': appToken},
    );
    if (response.status < 200 || response.status >= 300) {
      final payload = (response.data as Map?)?.cast<String, dynamic>();
      throw Exception(payload?['error']?.toString() ?? 'Failed to update settings');
    }
    final payload = (response.data as Map?)?.cast<String, dynamic>() ?? const {};
    return (payload['settings'] as Map?)?.cast<String, dynamic>();
  }

  double _toDouble(dynamic value) {
    if (value == null) return 0;
    if (value is num) return value.toDouble();
    return double.tryParse(value.toString()) ?? 0;
  }

  int _memberNumberOrder(String memberNumber) {
    final match = RegExp(r'\d+').firstMatch(memberNumber);
    if (match == null) return 1 << 30;
    return int.tryParse(match.group(0)!) ?? (1 << 30);
  }
}
