import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Configuration for the app
class AppConfig {
  static Future<void> initialize() async {
    await Supabase.initialize(
      url: supabaseUrl,
      anonKey: supabaseAnonKey,
    ).timeout(
      const Duration(seconds: 10),
      onTimeout: () => throw Exception('Supabase initialization timed out'),
    );
  }

  static String get supabaseUrl =>
      dotenv.env['SUPABASE_URL']?.trim() ??
      dotenv.env['VITE_SUPABASE_URL']?.trim() ??
      '';

  static String get supabaseAnonKey =>
      dotenv.env['SUPABASE_ANON_KEY']?.trim() ??
      dotenv.env['VITE_SUPABASE_ANON_KEY']?.trim() ??
      '';

  static bool get enableFirebase =>
      (dotenv.env['ENABLE_FIREBASE'] ?? 'false').toLowerCase() == 'true';

  static void validate() {
    final url = supabaseUrl;
    final anonKey = supabaseAnonKey;

    if (url.isEmpty) {
      throw Exception(
        'Supabase URL not configured. Set SUPABASE_URL or VITE_SUPABASE_URL in .env',
      );
    }

    if (url.contains('your-project')) {
      throw Exception(
        'Supabase URL is still a placeholder. Use your real project URL.',
      );
    }

    final parsed = Uri.tryParse(url);
    if (parsed == null || !parsed.hasScheme || parsed.host.isEmpty) {
      throw Exception('SUPABASE_URL is invalid: "$url"');
    }

    if (!parsed.host.endsWith('supabase.co')) {
      throw Exception(
        'SUPABASE_URL host must end with supabase.co. Got: ${parsed.host}',
      );
    }

    if (anonKey.isEmpty) {
      throw Exception(
        'Supabase anon key not configured. Set SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY in .env',
      );
    }

    if (anonKey.contains('your-anon-key')) {
      throw Exception(
        'Supabase anon key is still a placeholder. Use your real anon key.',
      );
    }

    if (anonKey.length < 20) {
      throw Exception('SUPABASE_ANON_KEY looks too short to be valid.');
    }
  }
}
