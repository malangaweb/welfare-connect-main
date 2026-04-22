import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../auth/session_controller.dart';

final authControllerProvider = Provider<AuthController>((ref) {
  return AuthController(ref);
});

class AuthController {
  AuthController(this.ref);
  final Ref ref;
  SupabaseClient get _supabase => Supabase.instance.client;

  Future<void> loginAdmin({
    required String username,
    required String password,
  }) async {
    final response = await _supabase.functions.invoke(
      "auth-admin-login",
      body: {"username": username, "password": password},
    );
    if (response.status != 200) {
      throw Exception(response.data["error"] ?? "Admin login failed");
    }
    final data = response.data as Map<String, dynamic>;
    await ref.read(sessionControllerProvider.notifier).setSession(
          AppSession(
            appToken: data["app_token"] as String?,
            role: (data["user"] as Map<String, dynamic>?)?["role"] as String?,
            userId: (data["user"] as Map<String, dynamic>?)?["id"] as String?,
            memberId: (data["user"] as Map<String, dynamic>?)?["member_id"] as String?,
          ),
        );
  }

  Future<void> loginMember({
    required String memberNumber,
    required String phoneNumber,
  }) async {
    final response = await _supabase.functions.invoke(
      "auth-member-login",
      body: {"member_number": memberNumber, "phone_number": phoneNumber},
    );
    if (response.status != 200) {
      throw Exception(response.data["error"] ?? "Member login failed");
    }
    final data = response.data as Map<String, dynamic>;
    await ref.read(sessionControllerProvider.notifier).setSession(
          AppSession(
            appToken: data["app_token"] as String?,
            role: "member",
            userId: (data["member"] as Map<String, dynamic>?)?["id"] as String?,
            memberId: (data["member"] as Map<String, dynamic>?)?["id"] as String?,
          ),
        );
  }

  Future<void> logout() => ref.read(sessionControllerProvider.notifier).clear();
}
