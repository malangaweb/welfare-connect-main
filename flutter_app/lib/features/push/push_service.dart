import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/app_api_client.dart';

final pushServiceProvider = Provider<PushService>((ref) {
  return PushService(ref.watch(appApiClientProvider));
});

class PushService {
  PushService(this.api);
  final AppApiClient api;

  Future<void> registerDeviceToken() async {
    final fm = FirebaseMessaging.instance;
    await fm.requestPermission(alert: true, badge: true, sound: true);
    final token = await fm.getToken();
    if (token == null) return;
    await api.post("api-register-device-token", {
      "device_token": token,
      "platform": "flutter",
    });
  }
}
