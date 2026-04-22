import 'dart:convert';

import 'package:flutter_riverpod/legacy.dart';
import 'package:state_notifier/state_notifier.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

const _storage = FlutterSecureStorage();
const _sessionKey = "app_session_v1";

class AppSession {
  final String? appToken;
  final String? role;
  final String? memberId;
  final String? userId;

  const AppSession({this.appToken, this.role, this.memberId, this.userId});

  AppSession copyWith({
    String? appToken,
    String? role,
    String? memberId,
    String? userId,
  }) {
    return AppSession(
      appToken: appToken ?? this.appToken,
      role: role ?? this.role,
      memberId: memberId ?? this.memberId,
      userId: userId ?? this.userId,
    );
  }

  Map<String, dynamic> toJson() => {
        "appToken": appToken,
        "role": role,
        "memberId": memberId,
        "userId": userId,
      };

  static AppSession fromJson(Map<String, dynamic> json) => AppSession(
        appToken: json["appToken"] as String?,
        role: json["role"] as String?,
        memberId: json["memberId"] as String?,
        userId: json["userId"] as String?,
      );
}

class SessionController extends StateNotifier<AppSession> {
  SessionController() : super(const AppSession()) {
    _hydrate();
  }

  Future<void> _hydrate() async {
    final raw = await _storage.read(key: _sessionKey);
    if (raw == null) return;
    state = AppSession.fromJson(jsonDecode(raw) as Map<String, dynamic>);
  }

  Future<void> setSession(AppSession session) async {
    state = session;
    await _storage.write(key: _sessionKey, value: jsonEncode(session.toJson()));
  }

  Future<void> clear() async {
    state = const AppSession();
    await _storage.delete(key: _sessionKey);
  }
}

final sessionControllerProvider =
    StateNotifierProvider<SessionController, AppSession>(
  (ref) => SessionController(),
);
