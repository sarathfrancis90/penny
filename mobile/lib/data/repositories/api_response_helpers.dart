import 'package:dio/dio.dart';

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

class ApiDocument {
  ApiDocument(Map<String, dynamic> data)
    : id = (data['id'] ?? data['groupId'] ?? '').toString(),
      _data = data;

  final String id;
  final Map<String, dynamic> _data;

  Map<String, dynamic> data() => _data;
}
