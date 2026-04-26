import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/app_colors.dart';
import '../../core/constants/app_constants.dart';

class WalletScreen extends StatelessWidget {
  const WalletScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              Color(0xFFF7FAFC),
              Color(0xFFE9EEF5),
            ],
          ),
        ),
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
                      // Balance Hero Card
                      _buildBalanceCard(theme),

                      SizedBox(height: AppConstants.sectionGap),

                      // Action Pills
                      _buildActionPills(theme),

                      SizedBox(height: AppConstants.sectionGap),

                      // Transactions Section
                      _buildTransactionsSection(theme),
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
        gradient: const LinearGradient(
          begin: Alignment.centerLeft,
          end: Alignment.centerRight,
          colors: [
            Color(0xFF31512E),
            Color(0xFF628A49),
          ],
        ),
        borderRadius: const BorderRadius.only(
          bottomLeft: Radius.circular(24),
          bottomRight: Radius.circular(24),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.08),
            blurRadius: 30,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Row(
        children: [
          // User Avatar
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
                'https://lh3.googleusercontent.com/aida-public/AB6AXuBLawqrGHWRnJu3vctHa8BOO9gZWrPQJeUuDXsTILQb1sYlWYzqDIdb3T53VjHAwuUPzs3SB60q9xjNfRmffZudZkSH75iaJvKQiMG2sV-qbXGbC85w2xBFgkXB_DYRpdU4O4LwaHqAkycVZUss_VOEGOgD92NcHkWw6Et9NfKSJLqTv_3YDomi6WFaJ7RyTkwOQ4GiUlcjsFWLUNj5SEiGMXGXVdUBlyXv1gCMEH4677lftnbyu10Jsj-aJPql7MmDBuJV50mkfWc',
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => Container(
                  color: AppColors.surfaceContainerLowest,
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Welfare Portal',
                style: theme.textTheme.titleLarge?.copyWith(
                  color: Colors.white,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const Text(
                'Wallet and overview',
                style: TextStyle(
                  fontFamily: 'Manrope',
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.5,
                  color: Colors.white70,
                ),
              ),
            ],
          ),
          const Spacer(),
          IconButton(
            onPressed: () {},
            icon: const Icon(Icons.notifications, color: Colors.white),
          ),
        ],
      ),
    );
  }

  Widget _buildBalanceCard(ThemeData theme) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppConstants.cardPadding),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color(0xFF31512E),
            Color(0xFFC88F49),
          ],
        ),
        borderRadius: BorderRadius.circular(32),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF31512E).withValues(alpha: 0.2),
            blurRadius: 20,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Total Balance',
            style: TextStyle(
              fontFamily: 'Manrope',
              fontSize: 12,
              fontWeight: FontWeight.w600,
              letterSpacing: 1,
              color: Colors.white70,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'KES 12,345.00',
            style: theme.textTheme.displayLarge?.copyWith(
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(AppConstants.radiusFull),
                ),
                child: Row(
                  children: [
                    const Icon(
                      Icons.arrow_downward,
                      size: 16,
                      color: Color(0xFF9EC396),
                    ),
                    const SizedBox(width: 4),
                    Text(
                      '+ 2,450.00',
                      style: theme.textTheme.labelLarge?.copyWith(
                        color: Colors.white70,
                      ),
                    ),
                  ],
                ),
              ),
              SizedBox(width: AppConstants.gutter),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(AppConstants.radiusFull),
                ),
                child: Row(
                  children: [
                    const Icon(
                      Icons.arrow_upward,
                      size: 16,
                      color: Color(0xFFF0B429),
                    ),
                    const SizedBox(width: 4),
                    Text(
                      '- 1,120.00',
                      style: theme.textTheme.labelLarge?.copyWith(
                        color: Colors.white70,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildActionPills(ThemeData theme) {
    return Row(
      children: [
        Expanded(
          child: _ActionPill(
            icon: Icons.add_card,
            label: 'Deposit',
            onTap: () {},
          ),
        ),
        SizedBox(width: AppConstants.gutter),
        Expanded(
          child: _ActionPill(
            icon: Icons.send,
            label: 'Send',
            onTap: () {},
          ),
        ),
        SizedBox(width: AppConstants.gutter),
        Expanded(
          child: _ActionPill(
            icon: Icons.grid_view,
            label: 'More',
            onTap: () {},
          ),
        ),
      ],
    );
  }

  Widget _buildTransactionsSection(ThemeData theme) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              'Transactions',
              style: theme.textTheme.headlineMedium?.copyWith(
                color: AppColors.primary,
                fontWeight: FontWeight.w700,
              ),
            ),
            TextButton(
              onPressed: () {},
              child: Text(
                'See All',
                style: theme.textTheme.labelLarge?.copyWith(
                  color: AppColors.tertiaryContainer,
                ),
              ),
            ),
          ],
        ),

        SizedBox(height: AppConstants.gutter),

        Column(
          children: [
            _TransactionCard(
              title: 'Monthly Subsidy',
              subtitle: 'Oct 12, 2023 • 10:45 AM',
              amount: '+ KES 5,000',
              isInflow: true,
              icon: Icons.south_west,
            ),
            SizedBox(height: AppConstants.gutter),
            _TransactionCard(
              title: 'Education Fund',
              subtitle: 'Oct 10, 2023 • 02:15 PM',
              amount: '- KES 1,200',
              isInflow: false,
              icon: Icons.north_east,
            ),
            SizedBox(height: AppConstants.gutter),
            _TransactionCard(
              title: 'Member Contribution',
              subtitle: 'Oct 08, 2023 • 09:00 AM',
              amount: '+ KES 2,500',
              isInflow: true,
              icon: Icons.payments,
            ),
          ],
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
            isActive: true,
            onTap: () => context.go('/member/wallet'),
          ),
          _BottomNavItem(
            icon: Icons.assignment,
            label: 'Cases',
            isActive: false,
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

// Helper Widgets

class _ActionPill extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  const _ActionPill({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: const Color(0xFF161412),
          borderRadius: BorderRadius.circular(AppConstants.radiusXxl),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.2),
              blurRadius: 8,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Column(
          children: [
            Icon(
              icon,
              color: AppColors.primaryFixed,
              size: 28,
            ),
            const SizedBox(height: 8),
            Text(
              label,
              style: const TextStyle(
                fontFamily: 'Manrope',
                fontSize: 11,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.5,
                color: Colors.white,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TransactionCard extends StatelessWidget {
  final String title;
  final String subtitle;
  final String amount;
  final bool isInflow;
  final IconData icon;

  const _TransactionCard({
    required this.title,
    required this.subtitle,
    required this.amount,
    required this.isInflow,
    required this.icon,
  });

  @override
  Widget build(BuildContext context) {
    final amountColor = isInflow ? const Color(0xFF059669) : const Color(0xFFD97706);
    final bgColor = isInflow ? const Color(0xFFDCFCE7) : const Color(0xFFFEF3C7);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFFE9EEF5)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: bgColor,
              shape: BoxShape.circle,
            ),
            child: Icon(
              icon,
              color: amountColor,
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
                    fontWeight: FontWeight.w600,
                    color: AppColors.primary,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: const TextStyle(
                    fontFamily: 'Manrope',
                    fontSize: 12,
                    color: Color(0xFF94A3B8),
                  ),
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                amount,
                style: TextStyle(
                  fontFamily: 'Manrope',
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: amountColor,
                ),
              ),
              Text(
                isInflow ? 'Inflow' : 'Outflow',
                style: TextStyle(
                  fontFamily: 'Manrope',
                  fontSize: 10,
                  color: amountColor.withValues(alpha: 0.7),
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
