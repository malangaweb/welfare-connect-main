import 'package:supabase_flutter/supabase_flutter.dart';

import 'supabase_service.dart';

class MemberWalletSnapshot {
  final double walletBalance;
  final double totalCredit;
  final double totalDebit;
  final List<Map<String, dynamic>> recentTransactions;

  const MemberWalletSnapshot({
    required this.walletBalance,
    required this.totalCredit,
    required this.totalDebit,
    required this.recentTransactions,
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
    }

    return MemberWalletSnapshot(
      walletBalance: _toDouble(member['wallet_balance']),
      totalCredit: credits,
      totalDebit: debits,
      recentTransactions: txList.take(5).toList(),
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

  double _toDouble(dynamic value) {
    if (value == null) return 0;
    if (value is num) return value.toDouble();
    return double.tryParse(value.toString()) ?? 0;
  }
}
