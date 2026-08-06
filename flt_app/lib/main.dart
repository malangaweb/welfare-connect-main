import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:posthog_flutter/posthog_flutter.dart';

import 'app.dart';
import 'core/config/app_config.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  String? startupError;

  // Load environment variables
  try {
    await dotenv.load(fileName: ".env");
  } catch (e) {
    startupError = 'Failed to load .env file: $e';
  }

  if (startupError == null) {
    final posthogProjectToken = dotenv.env['POSTHOG_PROJECT_TOKEN'];
    final posthogHost = dotenv.env['POSTHOG_HOST'];

    if (posthogProjectToken == null || posthogProjectToken.isEmpty) {
      assert(() {
        throw StateError(
          'POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once POSTHOG_PROJECT_TOKEN is configured',
        );
      }());
    } else if (posthogHost == null || posthogHost.isEmpty) {
      assert(() {
        throw StateError(
          'POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once POSTHOG_HOST is configured',
        );
      }());
    } else {
      final config = PostHogConfig(posthogProjectToken);
      config.host = posthogHost;
      config.errorTrackingConfig.captureFlutterErrors = true;
      config.errorTrackingConfig.capturePlatformDispatcherErrors = true;
      config.errorTrackingConfig.captureIsolateErrors = true;
      await Posthog().setup(config);
    }
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
