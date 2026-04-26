import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/constants/app_constants.dart';

class AdminDashboardScreen extends StatelessWidget {
  const AdminDashboardScreen({super.key});

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
        child: SafeArea(
          child: Column(
            children: [
              // Top App Bar
              _buildTopAppBar(theme),

              // Main content
              Expanded(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(
                    AppConstants.marginEdge,
                    24,
                    AppConstants.marginEdge,
                    AppConstants.marginEdge,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Capability Chips
                      _buildCapabilityChips(theme),

                      const SizedBox(height: AppConstants.sectionGap),

                      // Module Selector (horizontal scroll)
                      _buildModuleSelector(theme),

                      const SizedBox(height: AppConstants.sectionGap),

                      // Active Module: Members Overview
                      const Text(
                        'Members Overview',
                        style: TextStyle(
                          fontFamily: 'Manrope',
                          fontSize: 24,
                          fontWeight: FontWeight.w700,
                          color: AppColors.primary,
                        ),
                      ),

                      const SizedBox(height: AppConstants.gutter),

                      // Bento Stats Grid
                      _buildBentoStats(theme),

                      const SizedBox(height: AppConstants.sectionGap),

                      // Recent Activity
                      _buildRecentActivity(theme),
                    ],
                  ),
                ),
              ),

              // Bottom Navigation
              _buildBottomNavBar(theme),
            ],
          ),
        ),
      ),
      floatingActionButton: _buildLogoutFAB(),
    );
  }

  Widget _buildTopAppBar(ThemeData theme) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.8),
        border: const Border(
          bottom: BorderSide(color: Color(0xFFE2E8F0), width: 1),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          IconButton(
            onPressed: () {},
            icon: const Icon(Icons.menu, color: AppColors.primary),
          ),
          const Text(
            'Admin Portal',
            style: TextStyle(
              fontFamily: 'Manrope',
              fontSize: 20,
              fontWeight: FontWeight.w800,
              color: AppColors.primary,
            ),
          ),
          Container(
            padding: const EdgeInsets.all(2),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(color: AppColors.primary, width: 2),
            ),
            child: const CircleAvatar(
              radius: 18,
              backgroundColor: AppColors.primaryContainer,
              child: Icon(Icons.person, color: Colors.white, size: 20),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCapabilityChips(ThemeData theme) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: ['Overview', 'Inventory', 'Reports', 'Settings'].map((cap) {
          final isSelected = cap == 'Overview';
          return Padding(
            padding: const EdgeInsets.only(right: 8),
            child: FilterChip(
              label: Text(cap),
              selected: isSelected,
              onSelected: (val) {},
              backgroundColor: Colors.white,
              selectedColor: AppColors.primaryFixed,
              labelStyle: TextStyle(
                fontFamily: 'Manrope',
                fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                color: isSelected ? AppColors.primary : AppColors.secondary,
              ),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildModuleSelector(ThemeData theme) {
    return SizedBox(
      height: 120,
      child: ListView(
        scrollDirection: Axis.horizontal,
        children: [
          _ModuleCard(
            title: 'Members',
            icon: Icons.people,
            color: const Color(0xFFE0F2FE),
            iconColor: const Color(0xFF0EA5E9),
            isSelected: true,
          ),
          _ModuleCard(
            title: 'Welfare',
            icon: Icons.favorite,
            color: const Color(0xFFF0FDF4),
            iconColor: const Color(0xFF22C55E),
          ),
          _ModuleCard(
            title: 'Finance',
            icon: Icons.account_balance,
            color: const Color(0xFFFEF3C7),
            iconColor: const Color(0xFFF59E0B),
          ),
        ],
      ),
    );
  }

  Widget _buildBentoStats(ThemeData theme) {
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisSpacing: 16,
      mainAxisSpacing: 16,
      childAspectRatio: 1.4,
      children: const [
        _StatCard(
          title: 'Total Members',
          value: '1,248',
          icon: Icons.group,
          color: AppColors.primaryContainer,
        ),
        _StatCard(
          title: 'Active Cases',
          value: '24',
          icon: Icons.pending_actions,
          color: AppColors.secondary,
        ),
        _StatCard(
          title: 'Suspense',
          value: 'KES 45K',
          icon: Icons.warning_amber,
          color: AppColors.tertiary,
        ),
        _StatCard(
          title: 'Growth',
          value: '+12%',
          icon: Icons.trending_up,
          color: Color(0xFF0EA5E9),
        ),
      ],
    );
  }

  Widget _buildRecentActivity(ThemeData theme) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Recent Activity',
          style: TextStyle(
            fontFamily: 'Manrope',
            fontSize: 18,
            fontWeight: FontWeight.w700,
            color: AppColors.onSurface,
          ),
        ),
        const SizedBox(height: 16),
        const _ActivityItem(
          name: 'John Doe',
          description: 'Added new contribution',
          timeAgo: '2m ago',
          icon: Icons.add_circle,
        ),
        const _ActivityItem(
          name: 'Mary Smith',
          description: 'Updated profile info',
          timeAgo: '15m ago',
          icon: Icons.edit,
        ),
        const _ActivityItem(
          name: 'Admin',
          description: 'Resolved suspense item',
          timeAgo: '1h ago',
          icon: Icons.check_circle,
        ),
      ],
    );
  }

  Widget _buildBottomNavBar(ThemeData theme) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white,
        border: const Border(top: BorderSide(color: Color(0xFFE2E8F0))),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 10,
            offset: const Offset(0, -4),
          ),
        ],
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          _BottomNavItem(
            icon: Icons.home,
            label: 'Home',
            isActive: true,
            onTap: () {},
          ),
          _BottomNavItem(
            icon: Icons.list_alt,
            label: 'Cases',
            isActive: false,
            onTap: () {},
          ),
          _BottomNavItem(
            icon: Icons.history,
            label: 'History',
            isActive: false,
            onTap: () {},
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

  Widget _buildLogoutFAB() {
    return FloatingActionButton.extended(
      onPressed: () {},
      backgroundColor: AppColors.error,
      icon: const Icon(Icons.logout, color: Colors.white),
      label: const Text('Logout', style: TextStyle(color: Colors.white)),
    );
  }
}

class _StatCard extends StatelessWidget {
  final String title;
  final String value;
  final IconData icon;
  final Color color;

  const _StatCard({
    required this.title,
    required this.value,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Container(
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(icon, color: color, size: 18),
              ),
              const Icon(Icons.more_horiz, color: Color(0xFF94A3B8), size: 18),
            ],
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                value,
                style: const TextStyle(
                  fontFamily: 'Manrope',
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                  color: AppColors.onSurface,
                ),
              ),
              Text(
                title,
                style: const TextStyle(
                  fontFamily: 'Manrope',
                  fontSize: 12,
                  color: Color(0xFF64748B),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ActivityItem extends StatelessWidget {
  final String name;
  final String description;
  final String timeAgo;
  final IconData icon;

  const _ActivityItem({
    required this.name,
    required this.description,
    required this.timeAgo,
    required this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: AppColors.surfaceContainerLow,
              shape: BoxShape.circle,
            ),
            child: Icon(icon, color: AppColors.primary, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  style: const TextStyle(
                    fontFamily: 'Manrope',
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: AppColors.onSurface,
                  ),
                ),
                Text(
                  description,
                  style: const TextStyle(
                    fontFamily: 'Manrope',
                    fontSize: 12,
                    color: Color(0xFF64748B),
                  ),
                ),
              ],
            ),
          ),
          Text(
            timeAgo,
            style: const TextStyle(
              fontFamily: 'Manrope',
              fontSize: 11,
              color: Color(0xFF94A3B8),
            ),
          ),
        ],
      ),
    );
  }
}

class _ModuleCard extends StatelessWidget {
  final String title;
  final IconData icon;
  final Color color;
  final Color iconColor;
  final bool isSelected;

  const _ModuleCard({
    required this.title,
    required this.icon,
    required this.color,
    required this.iconColor,
    this.isSelected = false,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 100,
      margin: const EdgeInsets.only(right: 12),
      decoration: BoxDecoration(
        color: isSelected ? AppColors.primary : Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: isSelected ? AppColors.primary : const Color(0xFFE2E8F0),
        ),
      ),
      child: InkWell(
        onTap: () {},
        borderRadius: BorderRadius.circular(20),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: isSelected ? Colors.white.withValues(alpha: 0.2) : color,
                shape: BoxShape.circle,
              ),
              child: Icon(
                icon,
                color: isSelected ? Colors.white : iconColor,
                size: 24,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              title,
              style: TextStyle(
                fontFamily: 'Manrope',
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: isSelected ? Colors.white : AppColors.onSurface,
              ),
            ),
          ],
        ),
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
                color: isActive
                    ? AppColors.primary
                    : const Color(0xFF94A3B8),
              ),
              const SizedBox(height: 4),
              Text(
                label,
                style: TextStyle(
                  fontFamily: 'Manrope',
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.5,
                  color: isActive
                      ? AppColors.primary
                      : const Color(0xFF94A3B8),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
