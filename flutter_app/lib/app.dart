import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'auth/session_controller.dart';
import 'features/auth/login_screen.dart';
import 'features/home/home_screen.dart';

final _routerProvider = Provider<GoRouter>((ref) {
  final session = ref.watch(sessionControllerProvider);
  return GoRouter(
    initialLocation: "/login",
    redirect: (context, state) {
      final loggedIn = session.appToken != null && session.role != null;
      if (!loggedIn && state.matchedLocation != "/login") return "/login";
      if (loggedIn && state.matchedLocation == "/login") return "/";
      return null;
    },
    routes: [
      GoRoute(path: "/login", builder: (_, __) => const LoginScreen()),
      GoRoute(path: "/", builder: (_, __) => const HomeScreen()),
    ],
  );
});

class MalangaCompanionApp extends ConsumerWidget {
  const MalangaCompanionApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(_routerProvider);

    final scheme = ColorScheme.fromSeed(
      seedColor: const Color(0xFF7FA65A),
      brightness: Brightness.light,
      surface: const Color(0xFFF5F4F2),
    );

    return MaterialApp.router(
      title: "Malanga Companion",
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: scheme,
        scaffoldBackgroundColor: const Color(0xFFF0EFEC),
        appBarTheme: const AppBarTheme(
          backgroundColor: Colors.transparent,
          elevation: 0,
          scrolledUnderElevation: 0,
        ),
        cardTheme: CardThemeData(
          color: Colors.white,
          elevation: 0,
          margin: EdgeInsets.zero,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(26)),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: Colors.white,
          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(16),
            borderSide: BorderSide.none,
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(16),
            borderSide: BorderSide.none,
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(16),
            borderSide: const BorderSide(color: Color(0xFF191715), width: 1.2),
          ),
        ),
        chipTheme: ChipThemeData(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
          side: BorderSide.none,
          backgroundColor: Colors.white,
          selectedColor: const Color(0xFF191715),
          labelStyle: const TextStyle(color: Color(0xFF191715)),
          secondaryLabelStyle: const TextStyle(color: Colors.white),
        ),
      ),
      routerConfig: router,
    );
  }
}
