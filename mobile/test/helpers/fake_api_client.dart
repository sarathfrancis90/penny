import 'dart:collection';

import 'package:dio/dio.dart';
import 'package:penny_mobile/core/network/api_client.dart';

class FakeApiCall {
  const FakeApiCall(this.method, this.path, this.data, this.queryParameters);

  final String method;
  final String path;
  final Object? data;
  final Map<String, dynamic>? queryParameters;
}

class FakeApiClient extends ApiClient {
  FakeApiClient() : super(baseUrl: 'https://api.test');

  final calls = <FakeApiCall>[];
  final _responses = Queue<Object?>();

  void queueResponse(Object? data) => _responses.add(data);

  @override
  Future<Response<T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
  }) async {
    calls.add(FakeApiCall('GET', path, null, queryParameters));
    return _response<T>();
  }

  @override
  Future<Response<T>> post<T>(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
  }) async {
    calls.add(FakeApiCall('POST', path, data, queryParameters));
    return _response<T>();
  }

  @override
  Future<Response<T>> patch<T>(String path, {Object? data}) async {
    calls.add(FakeApiCall('PATCH', path, data, null));
    return _response<T>();
  }

  @override
  Future<Response<T>> put<T>(String path, {Object? data}) async {
    calls.add(FakeApiCall('PUT', path, data, null));
    return _response<T>();
  }

  @override
  Future<Response<T>> delete<T>(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
  }) async {
    calls.add(FakeApiCall('DELETE', path, data, queryParameters));
    return _response<T>();
  }

  Response<T> _response<T>() {
    final data = _responses.isEmpty
        ? <String, Object?>{}
        : _responses.removeFirst();
    return Response<T>(
      data: data as T,
      requestOptions: RequestOptions(path: calls.last.path),
      statusCode: 200,
    );
  }
}
