import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/session_controller.dart';
import '../config/app_config.dart';

final appApiClientProvider = Provider<AppApiClient>((ref) {
  final session = ref.watch(sessionControllerProvider);
  return AppApiClient(session.appToken);
});

class AppApiClient {
  AppApiClient(this.appToken)
      : _dio = Dio(
          BaseOptions(
            baseUrl: "${AppConfig.supabaseUrl}/functions/v1",
            headers: {
              "Content-Type": "application/json",
              "apikey": AppConfig.supabaseAnonKey,
              // Supabase gateway expects a project JWT in Authorization.
              "Authorization": "Bearer ${AppConfig.supabaseAnonKey}",
              // App-level auth token verified inside edge functions.
              if (appToken != null) "x-app-token": appToken,
            },
          ),
        );

  final String? appToken;
  final Dio _dio;

  Future<Map<String, dynamic>> post(String path, Map<String, dynamic> body) async {
    final response = await _dio.post(path, data: jsonEncode(body));
    final data = response.data;
    if (data is Map<String, dynamic>) return data;
    return {"data": data};
  }

  Future<Map<String, dynamic>> get(String path, {Map<String, dynamic>? query}) async {
    final response = await _dio.get(path, queryParameters: query);
    final data = response.data;
    if (data is Map<String, dynamic>) return data;
    return {"data": data};
  }
}
