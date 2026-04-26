import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Secure storage wrapper for tokens and sensitive data
class StorageService {
  static final StorageService _instance = StorageService._internal();
  factory StorageService() => _instance;
  StorageService._internal();

  static const FlutterSecureStorage _storage = FlutterSecureStorage();

  static const String _keyAuthToken = 'auth_token';
  static const String _keyUserEmail = 'user_email';
  static const String _keyUserRole = 'user_role';

  Future<void> saveAuthToken(String token) async {
    await _storage.write(key: _keyAuthToken, value: token);
  }

  Future<String?> getAuthToken() async {
    return await _storage.read(key: _keyAuthToken);
  }

  Future<void> saveUserEmail(String email) async {
    await _storage.write(key: _keyUserEmail, value: email);
  }

  Future<String?> getUserEmail() async {
    return await _storage.read(key: _keyUserEmail);
  }

  Future<void> saveUserRole(String role) async {
    await _storage.write(key: _keyUserRole, value: role);
  }

  Future<String?> getUserRole() async {
    return await _storage.read(key: _keyUserRole);
  }

  Future<void> clearAll() async {
    await _storage.deleteAll();
  }
}
