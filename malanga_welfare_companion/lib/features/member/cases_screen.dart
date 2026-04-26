import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/app_colors.dart';
import '../../core/constants/app_constants.dart';

class CasesScreen extends StatelessWidget {
  const CasesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      body: Container(
        color: AppColors.background,
        child: SafeArea(
          child: Column(
            children: [
              // Top App Bar
              _buildTopAppBar(theme),

              // Main content
              Expanded(
                child: SingleChildScrollView(
                  padding: EdgeInsets.fromLTRB(
                    AppConstants.marginEdge,
                    80,
                    AppConstants.marginEdge,
                    AppConstants.marginEdge,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Headline
                      const Text(
                        'My Welfare Cases',
                        style: TextStyle(
                          fontFamily: 'Manrope',
                          fontSize: 32,
                          fontWeight: FontWeight.w700,
                          color: AppColors.primary,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Review and track your active benefit applications.',
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: AppColors.onSurfaceVariant,
                        ),
                      ),

                      SizedBox(height: AppConstants.sectionGap),

                      // Stats Overview (Bento Style)
                      _buildBentoStats(theme),

                      SizedBox(height: AppConstants.sectionGap),

                      // Case Cards List
                      _buildCaseCards(theme),
                    ],
                  ),
                ),
              ),

              // Bottom Navigation Bar
              _buildBottomNavBar(context, theme),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildTopAppBar(ThemeData theme) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.centerLeft,
          end: Alignment.centerRight,
          colors: [
            Color(0xFF31512E),
            Color(0xFF628A49),
          ],
        ),
        borderRadius: BorderRadius.only(
          bottomLeft: Radius.circular(24),
          bottomRight: Radius.circular(24),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.08),
            blurRadius: 30,
            offset: Offset(0, 8),
          ),
        ],
      ),
      child: Row(
        children: [
          // User Avatar
          Stack(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  border: Border.all(color: Colors.white.withValues(alpha: 0.2), width: 2),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(999),
                  child: Image.network(
                    'https://lh3.googleusercontent.com/aida-public/AB6AXuBctb1UUMzfFRhAGdMChBenfdzLVsFctYhPeewAnL0MLNsrTp9tVl_tJqz7U_Sx92dUlYeGYrNBEs2ImfJ8ChApTz5GhBj_FF9EraUFUu6DJ2QrESOxWB3rXqpHhrWmXOrhGgobepC9Jy2k2WKfp9Dlm4BGD_ojoprC6R551I6A5zpsZRziNQPYpkxXUR4njiZGO1aT_9XG3fJky8DAE_C4oKXvpgFAjQK0vVV0gW_RLNxLDLjsuzeAIsfx50eSfkkL6eKIPJOQ0X8',
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => Container(
                      color: AppColors.surfaceContainerLowest,
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(width: 12),
          const Expanded(
            child: Text(
              'Welfare Portal',
              style: TextStyle(
                fontFamily: 'Manrope',
                fontWeight: FontWeight.w600,
                fontSize: 18,
                color: Colors.white,
              ),
            ),
          ),
          IconButton(
            onPressed: () {},
            icon: const Icon(Icons.notifications, color: Colors.white),
          ),
        ],
      ),
    );
  }

  Widget _buildBentoStats(ThemeData theme) {
    return Column(
      children: [
        // Main stat card (spans 2 columns)
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(AppConstants.cardPadding),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                AppColors.primaryContainer,
                Color(0xFF628A49),
              ],
            ),
            borderRadius: BorderRadius.circular(AppConstants.radiusXxl),
            boxShadow: [
              BoxShadow(
                color: AppColors.primary.withValues(alpha: 0.15),
                blurRadius: 12,
                offset: const Offset(0, 6),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Total Value',
                style: theme.textTheme.labelLarge?.copyWith(
                  color: Colors.white70,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                '\$4,250.00',
                style: theme.textTheme.displayLarge?.copyWith(
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  const Icon(
                    Icons.account_balance_wallet,
                    size: 24,
                    color: Colors.white70,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    'Approved benefits across all programs',
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: Colors.white70,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),

        SizedBox(height: AppConstants.gutter),

        // Two-column grid for stats
        Row(
          children: [
            Expanded(
              child: Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppColors.surfaceContainerHigh,
                  borderRadius: BorderRadius.circular(AppConstants.radiusXxl),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(
                      Icons.pending_actions,
                      color: AppColors.primary,
                    ),
                    const SizedBox(height: 12),
                    Text(
                      '3 Active',
                      style: theme.textTheme.titleLarge?.copyWith(
                        color: AppColors.onSurface,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Pending Review',
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: AppColors.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            SizedBox(width: AppConstants.gutter),
            Expanded(
              child: Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppColors.surfaceContainerHigh,
                  borderRadius: BorderRadius.circular(AppConstants.radiusXxl),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(
                      Icons.check_circle,
                      color: AppColors.tertiary,
                    ),
                    const SizedBox(height: 12),
                    Text(
                      '12 Closed',
                      style: theme.textTheme.titleLarge?.copyWith(
                        color: AppColors.onSurface,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'This Year',
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: AppColors.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildCaseCards(ThemeData theme) {
    return Column(
      children: [
        // Case Card 1 - Paid
        _CaseCard(
          caseNumber: 'WF-2024-0892',
          title: 'Medical Assistance',
          status: 'Paid',
          isPaid: true,
          expectedAmount: '\$1,200.00',
          actualAmount: '\$1,200.00',
        ),

        SizedBox(height: AppConstants.gutter),

        // Case Card 2 - Unpaid
        _CaseCard(
          caseNumber: 'WF-2024-1104',
          title: 'Housing Support',
          status: 'Unpaid',
          isPaid: false,
          expectedAmount: '\$2,450.00',
          actualAmount: null,
        ),

        SizedBox(height: AppConstants.gutter),

        // Case Card 3 - Paid
        _CaseCard(
          caseNumber: 'WF-2024-1215',
          title: 'Education Grant',
          status: 'Paid',
          isPaid: true,
          expectedAmount: '\$600.00',
          actualAmount: '\$600.00',
        ),
      ],
    );
  }

   Widget _buildBottomNavBar(BuildContext context, ThemeData theme) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: const Color(0xFF0F172A),
        borderRadius: const BorderRadius.only(
          topLeft: Radius.circular(32),
          topRight: Radius.circular(32),
        ),
        border: const Border(
          top: BorderSide(color: Color(0x33FFFFFF), width: 1),
        ),
        boxShadow: [
          BoxShadow(
            color: const Color(0x1F000000),
            blurRadius: 20,
            offset: const Offset(0, -4),
          ),
        ],
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          _BottomNavItem(
            icon: Icons.grid_view,
            label: 'Home',
            isActive: false,
            onTap: () => context.go('/member/wallet'),
          ),
          _BottomNavItem(
            icon: Icons.assignment,
            label: 'Cases',
            isActive: true,
            onTap: () => context.go('/member/cases'),
          ),
          _BottomNavItem(
            icon: Icons.widgets,
            label: 'Payments',
            isActive: false,
            onTap: () => context.go('/member/payments'),
          ),
          _BottomNavItem(
            icon: Icons.person,
            label: 'Profile',
            isActive: false,
            onTap: () {},
          ),
        ],
      ),
    );
  }
}

// Widgets

class _CaseCard extends StatelessWidget {
  final String caseNumber;
  final String title;
  final String status;
  final bool isPaid;
  final String expectedAmount;
  final String? actualAmount;

  const _CaseCard({
    required this.caseNumber,
    required this.title,
    required this.status,
    required this.isPaid,
    required this.expectedAmount,
    this.actualAmount,
  });

  @override
  Widget build(BuildContext context) {
    final statusColor = isPaid ? const Color(0xFF059669) : const Color(0xFFD97706);
    final statusBg = isPaid ? const Color(0xFFDCFCE7) : const Color(0xFFFEF3C7);

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(AppConstants.radiusXxl),
        border: Border.all(
          color: const Color(0xFFE9EEF5).withValues(alpha: 0.5),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 6,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      caseNumber,
                      style: const TextStyle(
                        fontFamily: 'Manrope',
                        fontSize: 11,
                        fontWeight: FontWeight.w500,
                        color: Color(0xFF94A3B8),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      title,
                      style: const TextStyle(
                        fontFamily: 'Manrope',
                        fontSize: 18,
                        fontWeight: FontWeight.w600,
                        color: AppColors.primary,
                      ),
                    ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: statusBg,
                  borderRadius: BorderRadius.circular(AppConstants.radiusFull),
                ),
                child: Text(
                  status,
                  style: TextStyle(
                    fontFamily: 'Manrope',
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: statusColor,
                  ),
                ),
              ),
            ],
          ),

          SizedBox(height: AppConstants.gutter),

          Row(
            children: [
              Expanded(
                child: _AmountTile(
                  label: 'Expected',
                  amount: expectedAmount,
                ),
              ),
              SizedBox(width: AppConstants.gutter),
              Expanded(
                child: _AmountTile(
                  label: 'Actual',
                  amount: actualAmount,
                  isPlaceholder: actualAmount == null,
                ),
              ),
            ],
          ),

          SizedBox(height: AppConstants.gutter),

          Row(
            children: [
              if (!isPaid) ...[
                Expanded(
                  child: ElevatedButton(
                    onPressed: () {},
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(AppConstants.radiusXl),
                      ),
                      textStyle: const TextStyle(
                        fontFamily: 'Manrope',
                        fontWeight: FontWeight.w600,
                        fontSize: 14,
                      ),
                    ),
                    child: const Text('Complete Task'),
                  ),
                ),
                SizedBox(width: AppConstants.gutter),
                Container(
                  width: 52,
                  height: 52,
                  decoration: BoxDecoration(
                    color: AppColors.surfaceContainerLow,
                    borderRadius: BorderRadius.circular(AppConstants.radiusXl),
                  ),
                  child: IconButton(
                    onPressed: () {},
                    icon: const Icon(Icons.more_horiz, color: AppColors.onSurface),
                  ),
                ),
              ] else ...[
                Expanded(
                  child: OutlinedButton(
                    onPressed: () {},
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.secondaryContainer,
                      side: BorderSide(color: AppColors.secondaryContainer),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(AppConstants.radiusXl),
                      ),
                      textStyle: const TextStyle(
                        fontFamily: 'Manrope',
                        fontWeight: FontWeight.w600,
                        fontSize: 14,
                      ),
                    ),
                    child: const Text('View Case Details'),
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

class _AmountTile extends StatelessWidget {
  final String label;
  final String? amount;
  final bool isPlaceholder;

  const _AmountTile({
    required this.label,
    this.amount,
    this.isPlaceholder = false,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFFF5F4F1),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(
              fontFamily: 'Manrope',
              fontSize: 11,
              fontWeight: FontWeight.w500,
              color: Color(0xFF64748B),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            isPlaceholder ? '—' : amount!,
            style: TextStyle(
              fontFamily: 'Manrope',
              fontSize: 18,
              fontWeight: FontWeight.w600,
              color: isPlaceholder
                  ? AppColors.onSurfaceVariant.withValues(alpha: 0.4)
                  : AppColors.onSurface,
            ),
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
    return Expanded(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                icon,
                size: 24,
                color: isActive ? const Color(0xFFF59E0B) : const Color(0xFF64748B).withValues(alpha: 0.6),
              ),
              const SizedBox(height: 4),
              Text(
                label,
                style: TextStyle(
                  fontFamily: 'Manrope',
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.5,
                  color: isActive ? const Color(0xFFF59E0B) : const Color(0xFF64748B).withValues(alpha: 0.6),
                ),
              ),
              if (isActive)
                Container(
                  margin: const EdgeInsets.only(top: 4),
                  width: 4,
                  height: 4,
                  decoration: BoxDecoration(
                    color: const Color(0xFFF59E0B),
                    shape: BoxShape.circle,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
