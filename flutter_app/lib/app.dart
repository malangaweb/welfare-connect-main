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
    return MaterialApp.router(
      title: "Malanga Companion",
      theme: ThemeData(useMaterial3: true, colorSchemeSeed: Colors.indigo),
      routerConfig: router,
    );
  }
}
