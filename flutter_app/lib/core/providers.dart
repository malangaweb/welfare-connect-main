import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'db/app_database.dart';
import 'db/cache_repository.dart';
import 'network/app_api_client.dart';
import 'sync/sync_engine.dart';

final appDatabaseProvider = Provider<AppDatabase>((ref) {
  final db = AppDatabase();
  ref.onDispose(db.close);
  return db;
});

final cacheRepositoryProvider = Provider<CacheRepository>(
  (ref) => CacheRepository(ref.watch(appDatabaseProvider)),
);

final syncEngineProvider = Provider<SyncEngine>(
  (ref) => SyncEngine(
    db: ref.watch(appDatabaseProvider),
    api: ref.watch(appApiClientProvider),
  ),
);
