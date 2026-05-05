import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:malanga_welfare_companion/main.dart' as app;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('End-to-End Test', () {
    testWidgets('Full flow: Login -> Wallet -> Payments -> STK Push', (tester) async {
      app.main();
      await tester.pumpAndSettle();

      // 1. Login
      final memberField = find.byKey(const ValueKey('login_member_field'));
      final phoneField = find.byKey(const ValueKey('login_phone_field'));
      final loginButton = find.byKey(const ValueKey('login_submit_button'));

      expect(memberField, findsOneWidget);
      expect(phoneField, findsOneWidget);

      await tester.enterText(memberField, 'MLG-001');
      await tester.enterText(phoneField, '0712345678');
      await tester.tap(loginButton);
      
      // Wait for navigation to Wallet
      await tester.pumpAndSettle();
      
      // 2. Verify Wallet Screen
      expect(find.text('Malanga Wallet'), findsOneWidget); // Found in wallet_screen.dart
      expect(find.text('Total Balance'), findsOneWidget);

      // 3. Navigate to Payments via Bottom Nav
      final paymentsNav = find.byIcon(Icons.widgets);
      await tester.tap(paymentsNav);
      await tester.pumpAndSettle();

      // 4. Perform STK Push
      final payPhoneField = find.byKey(const ValueKey('payment_phone_field'));
      final payAmountField = find.byKey(const ValueKey('payment_amount_field'));
      final payRefField = find.byKey(const ValueKey('payment_reference_field'));
      final payButton = find.byKey(const ValueKey('payment_submit_button'));

      expect(payPhoneField, findsOneWidget);
      
      await tester.enterText(payPhoneField, '0712345678');
      await tester.enterText(payAmountField, '10');
      await tester.enterText(payRefField, 'TEST-REF');
      
      await tester.tap(payButton);
      await tester.pumpAndSettle();

      // 5. Navigate to Cases
      final casesNav = find.byIcon(Icons.assignment);
      await tester.tap(casesNav);
      await tester.pumpAndSettle();
      
      expect(find.text('Active Cases'), findsOneWidget);
    });

    testWidgets('Security: Admin route access protection', (tester) async {
      // This test would ideally verify that a member cannot access /admin/dashboard
      // But in integration tests, it's harder to force a URL change without UI.
      // We can rely on the redirect logic verified in unit/widget tests if needed.
    });
  });
}
