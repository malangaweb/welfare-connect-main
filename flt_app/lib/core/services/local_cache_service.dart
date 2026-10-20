import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:sqlite3/sqlite3.dart';

/// Small, account-scoped cache for read-only snapshots.
///
/// The server remains authoritative. Callers should invalidate entries after
/// successful writes and must never use this cache to authorize an operation.
class LocalCacheService {
  LocalCacheService._();

  static final LocalCacheService instance = LocalCacheService._();
  Future<Database?>? _database;

  Future<Database?> _open() => _database ??= _openDatabase();

  Future<Database?> _openDatabase() async {
    if (kIsWeb) return null;
    try {
      final directory = await getApplicationSupportDirectory();
      final db = sqlite3.open(p.join(directory.path, 'member_cache.sqlite'));
      db.execute('''
        CREATE TABLE IF NOT EXISTS cache_entries (
          owner_scope TEXT NOT NULL,
          cache_key TEXT NOT NULL,
          payload TEXT NOT NULL,
          saved_at INTEGER NOT NULL,
          PRIMARY KEY (owner_scope, cache_key)
        )
      ''');
      return db;
    } catch (_) {
      // Caching is an optimization; lack of local storage must not block login
      // or prevent a server read from succeeding.
      return null;
    }
  }

  Future<({Map<String, dynamic> value, DateTime savedAt})?> read({
    required String ownerScope,
    required String key,
  }) async {
    final db = await _open();
    if (db == null) return null;
    try {
      final rows = db.select(
        'SELECT payload, saved_at FROM cache_entries '
        'WHERE owner_scope = ? AND cache_key = ?',
        [ownerScope, key],
      );
      if (rows.isEmpty) return null;
      final row = rows.first;
      final decoded = jsonDecode(row['payload'] as String);
      if (decoded is! Map) return null;
      return (
        value: decoded.cast<String, dynamic>(),
        savedAt: DateTime.fromMillisecondsSinceEpoch(row['saved_at'] as int),
      );
    } catch (_) {
      return null;
    }
  }

  Future<void> write({
    required String ownerScope,
    required String key,
    required Map<String, dynamic> value,
  }) async {
    final db = await _open();
    if (db == null) return;
    try {
      db.execute(
        'INSERT INTO cache_entries(owner_scope, cache_key, payload, saved_at) '
        'VALUES (?, ?, ?, ?) '
        'ON CONFLICT(owner_scope, cache_key) DO UPDATE SET '
        'payload = excluded.payload, saved_at = excluded.saved_at',
        [
          ownerScope,
          key,
          jsonEncode(value),
          DateTime.now().millisecondsSinceEpoch
        ],
      );
    } catch (_) {
      // A cache write must never turn a successful API response into an error.
    }
  }

  Future<void> remove({required String ownerScope, required String key}) async {
    final db = await _open();
    try {
      db?.execute(
        'DELETE FROM cache_entries WHERE owner_scope = ? AND cache_key = ?',
        [ownerScope, key],
      );
    } catch (_) {
      // Cache cleanup must not undo or fail a completed server operation.
    }
  }

  Future<void> clearOwner(String ownerScope) async {
    final db = await _open();
    try {
      db?.execute(
        'DELETE FROM cache_entries WHERE owner_scope = ?',
        [ownerScope],
      );
    } catch (_) {
      // Logout must complete even if the cache cannot be reached.
    }
  }
}
