class AppConfig {
  static const supabaseUrl = String.fromEnvironment("SUPABASE_URL");
  static const supabaseAnonKey = String.fromEnvironment("SUPABASE_ANON_KEY");

  static void validate() {
    final hasPlaceholders = supabaseUrl.contains("<your-project>") || supabaseAnonKey.contains("<your-anon-key>");
    if (supabaseUrl.isEmpty || supabaseAnonKey.isEmpty || hasPlaceholders) {
      throw Exception(
        "Invalid SUPABASE_URL or SUPABASE_ANON_KEY. "
        "Use real values via --dart-define/--dart-define-from-file.",
      );
    }
  }
}
