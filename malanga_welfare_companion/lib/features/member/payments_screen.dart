import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/app_colors.dart';
import '../../core/constants/app_constants.dart';
import '../../core/services/supabase_service.dart';

class PaymentsScreen extends StatefulWidget {
  const PaymentsScreen({super.key});

  @override
  State<PaymentsScreen> createState() => _PaymentsScreenState();
}

class _PaymentsScreenState extends State<PaymentsScreen> {
  final _formKey = GlobalKey<FormState>();
  final _phoneController = TextEditingController();
  final _amountController = TextEditingController();
  final _referenceController = TextEditingController();
  bool _isLoading = false;

  @override
  void dispose() {
    _phoneController.dispose();
    _amountController.dispose();
    _referenceController.dispose();
    super.dispose();
  }

  Future<void> _handleSubmit() async {
    if (_formKey.currentState!.validate()) {
      setState(() => _isLoading = true);
      try {
        final response = await SupabaseService().invokeFunction(
          'stk-push',
          body: {
            'phone_number': _phoneController.text.trim(),
            'amount': double.tryParse(_amountController.text.trim()) ?? 0,
            'reference': _referenceController.text.trim(),
          },
        );

        if (mounted) {
          if (response.status == 200 || response.status == 201) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('STK Push initiated successfully. Please check your phone.'),
                backgroundColor: Colors.green,
              ),
            );
          } else {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text('Error: ${response.data?['error'] ?? 'Failed to initiate STK Push'}'),
                backgroundColor: Colors.red,
              ),
            );
          }
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Connection error: $e'),
              backgroundColor: Colors.red,
            ),
          );
        }
      } finally {
        if (mounted) {
          setState(() => _isLoading = false);
        }
      }
    }
  }

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
                      // Info Banner (Gold Gradient)
                      _buildInfoBanner(theme),

                      SizedBox(height: AppConstants.sectionGap),

                      // Form Card
                      _buildFormCard(theme),

                      SizedBox(height: AppConstants.sectionGap),

                      // Contextual Help Cards
                      _buildHelpCards(theme),
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
            offset: const Offset(0, 8),
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
                    'https://lh3.googleusercontent.com/aida-public/AB6AXuDGmBGFP2tBSWE7FveR_qzrJ776S476YDacFeA_TlOhscT1D3x4kTRYrmtOvRfAseEIxkJL26cRZvEtWKKVlCPaNJWYT6cQWNLsWWCW_TIXfVNunTJkHjxlKN62RkMDbms1eRp6Z-g0ZEsTpTIEH25D1wNZsnxchj16al3FPH2w_HxzqvKyneVS6Xd2V3ZRX_DO9sdTZhQTnZux3IcBdrTeZ9XeSFcwImO6fW3hEcG6EtidRXTNcc4nUslfT1TwLmVoNmFo5Kl-_oA',
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

  Widget _buildInfoBanner(ThemeData theme) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppConstants.cardPadding),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color(0xFFC38741),
            Color(0xFFF0E3D2),
          ],
        ),
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFFC38741).withValues(alpha: 0.2),
            blurRadius: 12,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Quick Payment',
            style: theme.textTheme.headlineMedium?.copyWith(
              color: AppColors.primary,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            'Initiate M-Pesa STK Push',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: AppColors.primary,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFormCard(ThemeData theme) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: AppColors.surfaceContainerLowest,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.06),
            blurRadius: 20,
            offset: const Offset(0, 4),
          ),
        ],
        border: Border.all(color: const Color(0xFFE9EEF5)),
      ),
      child: Form(
        key: _formKey,
        child: Column(
          children: [
            // Phone Number
            _buildFormField(
              key: const ValueKey('payment_phone_field'),
              controller: _phoneController,
              label: 'Phone number',
              hint: '0712 345 678',
              icon: Icons.smartphone,
              keyboardType: TextInputType.phone,
              validator: (value) {
                if (value == null || value.trim().isEmpty) {
                  return 'Please enter phone number';
                }
                return null;
              },
            ),

            SizedBox(height: AppConstants.sectionGap),

            // Amount
            _buildFormField(
              key: const ValueKey('payment_amount_field'),
              controller: _amountController,
              label: 'Amount',
              hint: 'KES 0.00',
              icon: Icons.payments,
              keyboardType: TextInputType.number,
              validator: (value) {
                if (value == null || value.trim().isEmpty) {
                  return 'Please enter amount';
                }
                return null;
              },
            ),

            SizedBox(height: AppConstants.sectionGap),

            // Account Reference
            _buildFormField(
              key: const ValueKey('payment_reference_field'),
              controller: _referenceController,
              label: 'Account Reference',
              hint: 'e.g. Welfare-001',
              icon: Icons.receipt_long,
              validator: (value) {
                if (value == null || value.trim().isEmpty) {
                  return 'Please enter reference';
                }
                return null;
              },
            ),

            const SizedBox(height: 24),

            // Submit Button
            FilledButton(
              key: const ValueKey('payment_submit_button'),
              onPressed: _isLoading ? null : _handleSubmit,
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFF151311),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 20),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(AppConstants.radiusXl),
                ),
                textStyle: theme.textTheme.labelLarge?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
              child: _isLoading 
                ? const SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(
                      color: Colors.white,
                      strokeWidth: 2,
                    ),
                  )
                : const Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text('Initiate STK Push'),
                      SizedBox(width: 8),
                      Icon(Icons.arrow_forward, size: 20),
                    ],
                  ),
            ),
          ],
        ),
      ),
    );
  }
 
  Widget _buildHelpCards(ThemeData theme) {
    return Row(
      children: [
        Expanded(
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppColors.surfaceContainerHigh,
              borderRadius: BorderRadius.circular(24),
            ),
            child: Column(
              children: [
                const Icon(
                  Icons.verified_user,
                  color: AppColors.primaryContainer,
                ),
                const SizedBox(height: 12),
                Text(
                  'Secure Transaction',
                  style: theme.textTheme.labelLarge?.copyWith(
                    color: AppColors.primaryContainer,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Encrypted end-to-end',
                  style: theme.textTheme.bodySmall?.copyWith(
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
              borderRadius: BorderRadius.circular(24),
            ),
            child: Column(
              children: [
                Icon(
                  Icons.history,
                  color: AppColors.tertiary,
                ),
                const SizedBox(height: 12),
                Text(
                  'History',
                  style: theme.textTheme.labelLarge?.copyWith(
                    color: AppColors.tertiary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'View past payments',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: AppColors.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ),
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
            isActive: false,
            onTap: () => context.go('/member/cases'),
          ),
          _BottomNavItem(
            icon: Icons.widgets,
            label: 'Payments',
            isActive: true,
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

  Widget _buildFormField({
    required TextEditingController controller,
    required String label,
    required String hint,
    required IconData icon,
    TextInputType? keyboardType,
    String? Function(String?)? validator,
    Key? key,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: Theme.of(context).textTheme.labelLarge?.copyWith(
                color: AppColors.onSurfaceVariant,
              ),
        ),
        const SizedBox(height: 8),
        TextFormField(
          key: key,
          controller: controller,
          keyboardType: keyboardType,
          validator: validator,
          style: Theme.of(context).textTheme.bodyLarge,
          decoration: InputDecoration(
            hintText: hint,
            prefixIcon: Icon(icon, color: AppColors.onSurfaceVariant.withValues(alpha: 0.6)),
            filled: true,
            fillColor: AppColors.onBackground.withValues(alpha: 0.05),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(AppConstants.radiusXl),
              borderSide: BorderSide.none,
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(AppConstants.radiusXl),
              borderSide: const BorderSide(
                color: AppColors.primaryContainer,
                width: 2,
              ),
            ),
          ),
        ),
      ],
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
            ],
          ),
        ),
      ),
    );
  }
}
