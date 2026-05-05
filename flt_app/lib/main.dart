import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/config/app_config.dart';
import 'app.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  String? startupError;

  // Load environment variables
  try {
    await dotenv.load(fileName: ".env");
  } catch (e) {
    startupError = 'Failed to load .env file: $e';
  }

  // Initialize configuration and Supabase
  if (startupError == null) {
    try {
      AppConfig.validate();
      await AppConfig.initialize();
    } catch (e) {
      startupError = 'Initialization error: $e';
    }
  }

  runApp(
    ProviderScope(
      child: startupError == null
          ? const MalangaCompanionApp()
          : _StartupErrorApp(message: startupError),
    ),
  );

  if (startupError != null) {
    debugPrint('Startup failed: $startupError');
  }
}

class _StartupErrorApp extends StatelessWidget {
  const _StartupErrorApp({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      home: Scaffold(
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              message,
              textAlign: TextAlign.center,
            ),
          ),
        ),
      ),
    );
  }
}
