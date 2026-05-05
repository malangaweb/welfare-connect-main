import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../core/services/storage_service.dart';

/// Auth state model
class AuthState {
  final User? user;
  final String? appToken;
  final String? memberId;
  final String? memberName;
  final String? role;
  final bool isAdmin;
  final bool isLoading;
  final String? error;

  const AuthState({
    this.user,
    this.appToken,
    this.memberId,
    this.memberName,
    this.role,
    this.isAdmin = false,
    this.isLoading = false,
    this.error,
  });

  User? get value => user;
  bool get isAuthenticated => user != null || (appToken?.isNotEmpty ?? false);

  AuthState copyWith({
    User? user,
    String? appToken,
    String? memberId,
    String? memberName,
    String? role,
    bool? isAdmin,
    bool? isLoading,
    String? error,
  }) {
    return AuthState(
      user: user ?? this.user,
      appToken: appToken ?? this.appToken,
      memberId: memberId ?? this.memberId,
      memberName: memberName ?? this.memberName,
      role: role ?? this.role,
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
  final StorageService _storage = StorageService();
  bool _restoreStarted = false;

  @override
  AuthState build() {
    if (!_restoreStarted) {
      _restoreStarted = true;
      Future(() => _restoreSession());
    }
    return const AuthState(isLoading: true);
  }

  Future<void> _restoreSession() async {
    try {
      final token = await _storage.getAuthToken();
      final memberId = await _storage.getMemberId();
      final memberName = await _storage.getMemberName();
      final isAdmin = await _storage.getIsAdmin();
      final role = await _storage.getUserRole();

      state = state.copyWith(
        appToken: token,
        memberId: memberId,
        memberName: memberName,
        isAdmin: isAdmin,
        role: role,
        user: Supabase.instance.client.auth.currentUser,
        isLoading: false,
      );
    } catch (_) {
      state = state.copyWith(isLoading: false);
    }
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
      String? memberId;
      String? memberName;
      String? role;
      if (payload is Map<String, dynamic>) {
        appToken = payload['app_token']?.toString();
        role = payload['user'] is Map<String, dynamic>
            ? (payload['user']['role']?.toString())
            : (payload['role']?.toString());
        final member = payload['member'];
        if (member is Map<String, dynamic>) {
          memberId = member['id']?.toString();
          memberName = member['name']?.toString();
        }
      }

      state = state.copyWith(
        appToken: appToken,
        memberId: memberId,
        memberName: memberName,
        user: Supabase.instance.client.auth.currentUser,
        isAdmin: isAdmin,
        role: role,
        isLoading: false,
      );

      if (appToken != null && appToken.isNotEmpty) {
        await _storage.saveAuthToken(appToken);
      }
      await _storage.saveIsAdmin(isAdmin);
      if (role != null && role.isNotEmpty) {
        await _storage.saveUserRole(role);
      }
      if (memberId != null && memberId.isNotEmpty) {
        await _storage.saveMemberId(memberId);
      }
      if (memberName != null && memberName.isNotEmpty) {
        await _storage.saveMemberName(memberName);
      }
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: e.toString(),
      );
    }
  }

  Future<void> logout() async {
    await Supabase.instance.client.auth.signOut();
    await _storage.clearAll();
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
