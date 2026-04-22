class AppConfig {
  static const supabaseUrl = String.fromEnvironment("SUPABASE_URL");
  static const supabaseAnonKey = String.fromEnvironment("SUPABASE_ANON_KEY");

  static void validate() {
    if (supabaseUrl.isEmpty || supabaseAnonKey.isEmpty) {
      throw Exception(
        "Missing SUPABASE_URL or SUPABASE_ANON_KEY. "
        "Pass with --dart-define.",
      );
    }
  }
}
