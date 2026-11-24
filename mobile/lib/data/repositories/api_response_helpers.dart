import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

Map<String, dynamic> responseMap(Response<dynamic> response) {
  final data = response.data;
  if (data is Map<String, dynamic>) return data;
  if (data is Map) return Map<String, dynamic>.from(data);
  throw StateError('Expected API response object');
}

Map<String, dynamic> mapValue(Object? value) {
  if (value is Map<String, dynamic>) return value;
  if (value is Map) return Map<String, dynamic>.from(value);
  return <String, dynamic>{};
}

List<Map<String, dynamic>> listValue(Object? value) {
  if (value is! List) return <Map<String, dynamic>>[];
  return value.map(mapValue).toList();
}

ApiDocument apiDocument(Map<String, dynamic> data) => ApiDocument(data);

/// Parses every item of an API list, skipping an item that fails to parse so
/// one malformed document cannot fail the whole list.
List<T> parseList<T>(Object? value, T Function(ApiDocument doc) parse) {
  final items = <T>[];
  for (final json in listValue(value)) {
    try {
      items.add(parse(apiDocument(json)));
    } catch (error) {
      debugPrint('[API] Skipped an unreadable $T: $error');
    }
  }
  return items;
}

class ApiDocument {
  ApiDocument(Map<String, dynamic> data)
    : id = (data['id'] ?? data['groupId'] ?? '').toString(),
      _data = data;

  final String id;
  final Map<String, dynamic> _data;

  Map<String, dynamic> data() => _data;
}
