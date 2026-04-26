import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Auth state model
class AuthState {
  final User? user;
  final String? appToken;
  final bool isAdmin;
  final bool isLoading;
  final String? error;

  const AuthState({
    this.user,
    this.appToken,
    this.isAdmin = false,
    this.isLoading = false,
    this.error,
  });

  User? get value => user;
  bool get isAuthenticated => user != null || (appToken?.isNotEmpty ?? false);

  AuthState copyWith({
    User? user,
    String? appToken,
    bool? isAdmin,
    bool? isLoading,
    String? error,
  }) {
    return AuthState(
      user: user ?? this.user,
      appToken: appToken ?? this.appToken,
      isAdmin: isAdmin ?? this.isAdmin,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

/// Auth controller provider using Riverpod 3.0 Notifier
final authControllerProvider = NotifierProvider<AuthController, AuthState>(() {
  return AuthController();
});

/// Auth controller with Supabase
class AuthController extends Notifier<AuthState> {
  @override
  AuthState build() {
    return const AuthState(isLoading: false);
  }

  Future<void> login({
    required String memberNumber,
    required String phoneNumber,
    required bool isAdmin,
  }) async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      final supabase = Supabase.instance.client;
      final response = isAdmin
          ? await supabase.functions.invoke(
              'auth-admin-login',
              body: {
                'username': memberNumber.trim(),
                'password': phoneNumber.trim(),
              },
            )
          : await supabase.functions.invoke(
              'auth-member-login',
              body: {
                'member_number': memberNumber.trim(),
                'phone_number': phoneNumber.trim(),
              },
            );

      if (response.status < 200 || response.status >= 300) {
        final payload = response.data;
        final message = payload is Map<String, dynamic>
            ? (payload['error']?.toString() ?? 'Invalid credentials')
            : 'Invalid credentials';
        state = state.copyWith(
          isLoading: false,
          error: message,
        );
        return;
      }

      final payload = response.data;
      String? appToken;
      if (payload is Map<String, dynamic>) {
        appToken = payload['app_token']?.toString();
      }

      state = state.copyWith(
        appToken: appToken,
        user: Supabase.instance.client.auth.currentUser,
        isAdmin: isAdmin,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: e.toString(),
      );
    }
  }

  Future<void> logout() async {
    await Supabase.instance.client.auth.signOut();
    state = const AuthState(isLoading: false, appToken: null);
  }

  Future<void> initAuth() async {
    final session = Supabase.instance.client.auth.currentSession;
    if (session?.user != null) {
      final isAdmin = session?.user.userMetadata?['role'] == 'admin';
      state = state.copyWith(
        user: session?.user,
        isAdmin: isAdmin,
      );
    }
  }
}
