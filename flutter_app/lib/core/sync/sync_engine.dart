import 'dart:convert';

import 'package:drift/drift.dart';

import '../db/app_database.dart';
import '../network/app_api_client.dart';

class SyncEngine {
  SyncEngine({required this.db, required this.api});

  final AppDatabase db;
  final AppApiClient api;

  Future<void> flushOutbox() async {
    final now = DateTime.now();
    final due = await (db.select(db.outboxItems)
          ..where((t) => t.nextAttemptAt.isSmallerOrEqualValue(now))
          ..orderBy([(t) => OrderingTerm.asc(t.createdAt)]))
        .get();

    for (final item in due) {
      try {
        final payload = jsonDecode(item.payloadJson) as Map<String, dynamic>;
        await api.post(item.action, payload);
        await (db.delete(db.outboxItems)..where((t) => t.id.equals(item.id))).go();
      } catch (_) {
        final retries = item.retryCount + 1;
        final delaySeconds = retries < 6 ? (1 << retries) : 60;
        await (db.update(db.outboxItems)..where((t) => t.id.equals(item.id))).write(
          OutboxItemsCompanion(
            retryCount: Value(retries),
            nextAttemptAt: Value(DateTime.now().add(Duration(seconds: delaySeconds))),
          ),
        );
      }
    }
  }
}
