import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/auth/login_screen.dart';
import '../../features/admin/admin_dashboard_screen.dart';
import '../../features/admin/suspense_queue_screen.dart';
import '../../features/member/wallet_screen.dart';
import '../../features/member/cases_screen.dart';
import '../../features/member/payments_screen.dart';
import '../../features/auth/auth_controller.dart';

/// Router configuration with auth state awareness
final routerProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authControllerProvider);

  return GoRouter(
    initialLocation: '/login',
    debugLogDiagnostics: true,
    
    redirect: (context, state) {
      final isLoggedIn = authState.isAuthenticated;
      final isLoginRoute = state.matchedLocation == '/login';
      final isAdminRoute = state.matchedLocation.startsWith('/admin');

      if (!isLoggedIn) {
        return isLoginRoute ? null : '/login';
      }

      // If logged in
      if (isLoginRoute) {
        return authState.isAdmin ? '/admin/dashboard' : '/member/wallet';
      }

      // Protect admin routes
      if (isAdminRoute && !authState.isAdmin) {
        return '/member/wallet';
      }

      return null;
    },

    routes: [
      // Login Route
      GoRoute(
        path: '/login',
        builder: (context, state) => const LoginScreen(),
      ),

      // Admin Routes
      GoRoute(
        path: '/admin/dashboard',
        builder: (context, state) => const AdminDashboardScreen(),
      ),
      GoRoute(
        path: '/admin/suspense-queue',
        builder: (context, state) => const SuspenseQueueScreen(),
      ),

      // Member Routes
      GoRoute(
        path: '/member/wallet',
        builder: (context, state) => const WalletScreen(),
      ),
      GoRoute(
        path: '/member/cases',
        builder: (context, state) => const CasesScreen(),
      ),
      GoRoute(
        path: '/member/payments',
        builder: (context, state) => const PaymentsScreen(),
      ),
    ],

    // Error page builder
    errorBuilder: (context, state) => Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, size: 64, color: Colors.red),
            const SizedBox(height: 16),
            Text(
              'Page not found',
              style: Theme.of(context).textTheme.headlineMedium,
            ),
            const SizedBox(height: 8),
            Text(state.error?.toString() ?? 'Unknown error'),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: () => context.go('/'),
              child: const Text('Go Home'),
            ),
          ],
        ),
      ),
    ),
  );
});
