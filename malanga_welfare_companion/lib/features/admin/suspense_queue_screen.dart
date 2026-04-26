import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../core/theme/app_colors.dart';
import '../../core/constants/app_constants.dart';

class SuspenseQueueScreen extends StatelessWidget {
  const SuspenseQueueScreen({super.key});

  Future<List<_SuspenseQueueItem>> _fetchSuspenseItems() async {
    final supabase = Supabase.instance.client;
    final rows = await supabase
        .from('wrong_mpesa_transactions')
        .select(
          'id, amount, phone_number, reference, mpesa_receipt_number, transaction_date, status',
        )
        .eq('status', 'pending')
        .order('transaction_date', ascending: false)
        .limit(100);

    return (rows as List<dynamic>)
        .whereType<Map<String, dynamic>>()
        .map(_SuspenseQueueItem.fromMap)
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              Color(0xFFF8FAFC),
              Color(0xFFEEF2F7),
            ],
          ),
        ),
        child: Stack(
          children: [
            SafeArea(
              child: Column(
                children: [
                  const SizedBox(height: 72),
                  Expanded(
                    child: FutureBuilder<List<_SuspenseQueueItem>>(
                      future: _fetchSuspenseItems(),
                      builder: (context, snapshot) {
                        final items = snapshot.data ?? const <_SuspenseQueueItem>[];
                        final totalOutstanding = items.fold<double>(
                          0,
                          (sum, item) => sum + item.amount,
                        );

                        return SingleChildScrollView(
                          physics: const BouncingScrollPhysics(),
                          padding: const EdgeInsets.fromLTRB(16, 20, 16, 100),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              _buildStatsCard(
                                theme,
                                totalOutstanding: totalOutstanding,
                                itemCount: items.length,
                              ),
                              const SizedBox(height: AppConstants.sectionGap),
                              _buildQueueHeader(theme, itemCount: items.length),
                              const SizedBox(height: AppConstants.gutter),
                              if (snapshot.connectionState == ConnectionState.waiting)
                                const Center(
                                  child: Padding(
                                    padding: EdgeInsets.symmetric(vertical: 40),
                                    child: CircularProgressIndicator(),
                                  ),
                                )
                              else if (snapshot.hasError)
                                _buildErrorCard(theme, snapshot.error.toString())
                              else
                                _buildSuspenseCards(items),
                            ],
                          ),
                        );
                      },
                    ),
                  ),
                ],
              ),
            ),
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: _buildTopAppBar(context, theme),
            ),
            Positioned(
              bottom: 0,
              left: 0,
              right: 0,
              child: _buildBottomNavBar(theme),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTopAppBar(BuildContext context, ThemeData theme) {
    return ClipRRect(
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12),
        child: Container(
          padding: EdgeInsets.only(
            top: MediaQuery.of(context).padding.top + 8,
            bottom: 12,
            left: 16,
            right: 16,
          ),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.7),
            border: Border(
              bottom: BorderSide(
                color: const Color(0xFFE2E8F0).withValues(alpha: 0.5),
                width: 1,
              ),
            ),
          ),
          child: Row(
            children: [
              IconButton(
                onPressed: () {},
                icon: const Icon(Icons.menu, color: AppColors.primary),
              ),
              const Expanded(
                child: Text(
                  'Suspense Queue',
                  style: TextStyle(
                    fontFamily: 'Manrope',
                    fontWeight: FontWeight.w700,
                    fontSize: 18,
                    color: AppColors.primary,
                  ),
                ),
              ),
              Row(
                children: [
                  const Text(
                    'Admin',
                    style: TextStyle(
                      fontFamily: 'Manrope',
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF434840),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: AppColors.primaryContainer,
                      border: Border.all(color: Colors.white, width: 2),
                      borderRadius: BorderRadius.circular(999),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.1),
                          blurRadius: 4,
                          offset: const Offset(0, 2),
                        ),
                      ],
                    ),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(999),
                      child: Image.network(
                        'https://lh3.googleusercontent.com/aida-public/AB6AXuDk--jUREUhe9F-o8kZDKNTyfEZ9_1iNUXxbyImtx1f25OqpOy34tAHXZrnOzVLhPwS1HUnTewK0-EI1bqxkhJO6ZMiTVDKC-esrfSx7XZ7uHsWo2L0hhRErmDxGF9g9gG4PWJyXIgeN7cpFdbmIAwMCBBLk9IeiXSYVtLSMK-9pGwTHHP7OvSH6B6jqLgg4x8GXcy7BDjO8b67d2U-fHcAmNQyb4Zy56nIgQbPF2_1eroQGrY-UinuvrDLOAu0dG_Zqs9JqjuGflc',
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => const Center(
                          child: Text(
                            'AD',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: Colors.white,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildStatsCard(
    ThemeData theme, {
    required double totalOutstanding,
    required int itemCount,
  }) {
    final amountFmt = NumberFormat.currency(
      locale: 'en_KE',
      symbol: 'KES ',
      decimalDigits: 2,
    );

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppConstants.cardPadding),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            AppColors.primary,
            AppColors.primaryContainer,
          ],
        ),
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(
            color: AppColors.primary.withValues(alpha: 0.3),
            blurRadius: 20,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Total Outstanding',
                style: theme.textTheme.labelLarge?.copyWith(
                  color: Colors.white.withValues(alpha: 0.7),
                  fontWeight: FontWeight.w600,
                ),
              ),
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(
                  Icons.account_balance_wallet,
                  color: Colors.white,
                  size: 20,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            amountFmt.format(totalOutstanding),
            style: theme.textTheme.headlineLarge?.copyWith(
              color: Colors.white,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.5,
            ),
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.trending_up,
                  size: 16,
                  color: Color(0xFFADFF2F),
                ),
                const SizedBox(width: 6),
                Text(
                  '$itemCount pending items',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildQueueHeader(ThemeData theme, {required int itemCount}) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Active Queue',
              style: TextStyle(
                fontFamily: 'Manrope',
                fontSize: 22,
                fontWeight: FontWeight.w800,
                color: AppColors.primary,
                letterSpacing: -0.5,
              ),
            ),
            Text(
              '$itemCount payments awaiting manual verification',
              style: const TextStyle(
                fontFamily: 'Manrope',
                fontSize: 13,
                color: Color(0xFF64748B),
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            color: AppColors.primary.withValues(alpha: 0.05),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: AppColors.primary.withValues(alpha: 0.1),
            ),
          ),
          child: const Row(
            children: [
              Icon(Icons.filter_list, size: 16, color: AppColors.primary),
              SizedBox(width: 6),
              Text(
                'Filter',
                style: TextStyle(
                  fontFamily: 'Manrope',
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: AppColors.primary,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildSuspenseCards(List<_SuspenseQueueItem> items) {
    if (items.isEmpty) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0xFFE2E8F0)),
        ),
        child: const Text(
          'No pending suspense transactions.',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontFamily: 'Manrope',
            color: Color(0xFF64748B),
            fontWeight: FontWeight.w600,
          ),
        ),
      );
    }

    return Column(
      children: items.map((item) {
        return Padding(
          padding: const EdgeInsets.only(bottom: 16),
          child: _SuspenseCard(
            amount: item.formattedAmount,
            phone: item.phoneNumber,
            reference: item.reference,
            title: item.title,
            onMatch: () {
              // Action handled in widget
            },
          ),
        );
      }).toList(),
    );
  }

  Widget _buildErrorCard(ThemeData theme, String error) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFFCA5A5)),
      ),
      child: Text(
        'Failed to load suspense data.\n$error',
        textAlign: TextAlign.center,
        style: theme.textTheme.bodyMedium?.copyWith(
          color: const Color(0xFFB91C1C),
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  Widget _buildBottomNavBar(ThemeData theme) {
    return Container(
      margin: const EdgeInsets.all(16),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(28),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 15, sigmaY: 15),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            decoration: BoxDecoration(
              color: AppColors.primary.withValues(alpha: 0.9),
              borderRadius: BorderRadius.circular(28),
              boxShadow: [
                BoxShadow(
                  color: AppColors.primary.withValues(alpha: 0.2),
                  blurRadius: 20,
                  offset: const Offset(0, 8),
                ),
              ],
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                _BottomNavItem(
                  icon: Icons.dashboard_rounded,
                  label: 'Dash',
                  isActive: false,
                  onTap: () {},
                ),
                _BottomNavItem(
                  icon: Icons.account_tree_rounded,
                  label: 'Queue',
                  isActive: true,
                  onTap: () {},
                ),
                _BottomNavItem(
                  icon: Icons.history_rounded,
                  label: 'History',
                  isActive: false,
                  onTap: () {},
                ),
                _BottomNavItem(
                  icon: Icons.settings_rounded,
                  label: 'Settings',
                  isActive: false,
                  onTap: () {},
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _SuspenseCard extends StatelessWidget {
  final String amount;
  final String phone;
  final String reference;
  final String title;
  final VoidCallback onMatch;

  const _SuspenseCard({
    required this.amount,
    required this.phone,
    required this.reference,
    required this.title,
    required this.onMatch,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF64748B).withValues(alpha: 0.08),
            blurRadius: 15,
            offset: const Offset(0, 4),
          ),
        ],
        border: Border.all(
          color: const Color(0xFFE2E8F0),
          width: 1,
        ),
      ),
      child: Column(
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: AppColors.primary.withValues(alpha: 0.05),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: const Icon(
                  Icons.payments_outlined,
                  color: AppColors.primary,
                  size: 24,
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        fontFamily: 'Manrope',
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                        color: AppColors.primary,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '$phone • $reference',
                      style: const TextStyle(
                        fontFamily: 'Manrope',
                        fontSize: 13,
                        color: Color(0xFF64748B),
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    'KES $amount',
                    style: const TextStyle(
                      fontFamily: 'Manrope',
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                      color: AppColors.primary,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF1F5F9),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: const Text(
                      'SUSPENSE',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        color: Color(0xFF64748B),
                        letterSpacing: 0.5,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 20),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () {},
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                    side: const BorderSide(color: Color(0xFFE2E8F0)),
                  ),
                  child: const Text(
                    'Reject',
                    style: TextStyle(
                      fontFamily: 'Manrope',
                      fontWeight: FontWeight.w700,
                      color: Color(0xFF64748B),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                flex: 2,
                child: ElevatedButton(
                  onPressed: () {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text('Matching transaction $reference...'),
                        behavior: SnackBarBehavior.floating,
                        backgroundColor: AppColors.primary,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                    );
                    onMatch();
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    elevation: 0,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                  child: const Text(
                    'Verify & Match',
                    style: TextStyle(
                      fontFamily: 'Manrope',
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _BottomNavItem extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool isActive;
  final VoidCallback onTap;

  const _BottomNavItem({
    required this.icon,
    required this.label,
    required this.isActive,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: isActive ? Colors.white.withValues(alpha: 0.15) : Colors.transparent,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(
              icon,
              size: 24,
              color: isActive ? Colors.white : Colors.white.withValues(alpha: 0.5),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: TextStyle(
              fontFamily: 'Manrope',
              fontSize: 10,
              fontWeight: isActive ? FontWeight.w800 : FontWeight.w500,
              color: isActive ? Colors.white : Colors.white.withValues(alpha: 0.5),
            ),
          ),
        ],
      ),
    );
  }
}

class _SuspenseQueueItem {
  final String id;
  final double amount;
  final String phoneNumber;
  final String reference;
  final String mpesaReceipt;

  const _SuspenseQueueItem({
    required this.id,
    required this.amount,
    required this.phoneNumber,
    required this.reference,
    required this.mpesaReceipt,
  });

  factory _SuspenseQueueItem.fromMap(Map<String, dynamic> map) {
    final rawAmount = map['amount'];
    final parsedAmount = rawAmount is num
        ? rawAmount.toDouble()
        : double.tryParse(rawAmount?.toString() ?? '') ?? 0;

    final ref = (map['reference'] ?? '').toString().trim();
    final receipt = (map['mpesa_receipt_number'] ?? 'N/A').toString();

    return _SuspenseQueueItem(
      id: (map['id'] ?? '').toString(),
      amount: parsedAmount,
      phoneNumber: (map['phone_number'] ?? 'Unknown').toString(),
      reference: ref.isEmpty ? receipt : ref,
      mpesaReceipt: receipt,
    );
  }

  String get title => 'M-Pesa Payment';

  String get formattedAmount {
    final amountFmt = NumberFormat.currency(
      locale: 'en_KE',
      symbol: '',
      decimalDigits: 2,
    );
    return amountFmt.format(amount).trim();
  }
}
