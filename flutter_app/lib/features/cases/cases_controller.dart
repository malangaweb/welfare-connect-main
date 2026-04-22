import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/app_api_client.dart';
import '../../core/providers.dart';

final casesControllerProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final api = ref.watch(appApiClientProvider);
  final cache = ref.watch(cacheRepositoryProvider);
  try {
    final data = await api.get("api-cases-list");
    await cache.upsert("cases_list", data);
    return ((data["cases"] as List?) ?? [])
        .map((e) => (e as Map).cast<String, dynamic>())
        .toList();
  } catch (_) {
    final cached = await cache.read("cases_list");
    return ((cached?["cases"] as List?) ?? [])
        .map((e) => (e as Map).cast<String, dynamic>())
        .toList();
  }
});
