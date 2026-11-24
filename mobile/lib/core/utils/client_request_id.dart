import 'dart:convert';
import 'dart:math';

const _alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
final _random = Random.secure();

/// A fresh random 32-character `[a-z0-9]` id sent as `clientRequestId` when
/// creating an expense, so the server can recognise a retried save.
String newClientRequestId() {
  return String.fromCharCodes(
    Iterable.generate(
      32,
      (_) => _alphabet.codeUnitAt(_random.nextInt(_alphabet.length)),
    ),
  );
}

/// Hands out one `clientRequestId` per save: retrying the same content reuses
/// the id, changing the content starts a new save with a new id.
class SaveAttemptId {
  String? _id;
  String? _content;

  String idFor(Map<String, Object?> content) {
    final encoded = jsonEncode(content);
    if (_id == null || encoded != _content) {
      _id = newClientRequestId();
      _content = encoded;
    }
    return _id!;
  }
}
