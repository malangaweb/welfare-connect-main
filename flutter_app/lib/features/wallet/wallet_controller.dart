import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/db/cache_repository.dart';
import '../../core/network/app_api_client.dart';
import '../../core/providers.dart';

final walletControllerProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) async {
  final api = ref.watch(appApiClientProvider);
  final cache = ref.watch(cacheRepositoryProvider);
  try {
    final payload = await api.post("api-member-summary", {});
    await cache.upsert("wallet_summary", payload);
    return payload;
  } catch (_) {
    return await cache.read("wallet_summary") ??
        {
          "wallet_balance": 0,
          "recent_transactions": <dynamic>[],
        };
  }
});
