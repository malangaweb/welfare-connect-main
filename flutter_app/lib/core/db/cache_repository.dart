import 'dart:convert';

import 'app_database.dart';

class CacheRepository {
  CacheRepository(this.db);
  final AppDatabase db;

  Future<void> upsert(String key, Map<String, dynamic> payload) async {
    await db.into(db.cachedItems).insertOnConflictUpdate(
          CachedItemsCompanion.insert(
            cacheKey: key,
            payloadJson: jsonEncode(payload),
            updatedAt: DateTime.now(),
          ),
        );
  }

  Future<Map<String, dynamic>?> read(String key) async {
    final row = await (db.select(db.cachedItems)
          ..where((t) => t.cacheKey.equals(key)))
        .getSingleOrNull();
    if (row == null) return null;
    return jsonDecode(row.payloadJson) as Map<String, dynamic>;
  }

  Future<void> enqueueOutbox(
      String action, Map<String, dynamic> payload) async {
    await db.into(db.outboxItems).insert(
          OutboxItemsCompanion.insert(
            action: action,
            payloadJson: jsonEncode(payload),
            createdAt: DateTime.now(),
            nextAttemptAt: DateTime.now(),
          ),
        );
  }
}
