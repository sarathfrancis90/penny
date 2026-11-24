import 'dart:async';
import 'dart:collection';

import 'package:dio/dio.dart';
import 'package:penny_mobile/core/network/api_client.dart';

class FakeApiCall {
  const FakeApiCall(
    this.method,
    this.path,
    this.data,
    this.queryParameters, {
    this.receiveTimeout,
  });

  final String method;
  final String path;
  final Object? data;
  final Map<String, dynamic>? queryParameters;
  final Duration? receiveTimeout;
}

class _QueuedError {
  const _QueuedError(this.error);
  final Object error;
}

class FakeApiClient extends ApiClient {
  FakeApiClient() : super(baseUrl: 'https://api.test');

  final calls = <FakeApiCall>[];
  final _responses = Queue<Object?>();

  void queueResponse(Object? data) => _responses.add(data);

  /// The next call throws [error].
  void queueError(Object error) => _responses.add(_QueuedError(error));

  /// The next call waits for [completer]; complete it with the response data
  /// or with an error.
  void queuePending(Completer<Object?> completer) => _responses.add(completer);

  final _stubs = <String, Object? Function()>{};

  /// Every call to [path] gets [respond]'s value (or what it throws),
  /// regardless of call order. Takes priority over the queue.
  void stub(String path, Object? Function() respond) => _stubs[path] = respond;

  /// A network-style failure for [queueError].
  static DioException networkError([String path = '/']) => DioException(
    requestOptions: RequestOptions(path: path),
    type: DioExceptionType.connectionError,
  );

  @override
  Future<Response<T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
  }) {
    calls.add(FakeApiCall('GET', path, null, queryParameters));
    return _response<T>(path);
  }

  @override
  Future<Response<T>> post<T>(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
    Duration? receiveTimeout,
  }) {
    calls.add(
      FakeApiCall(
        'POST',
        path,
        data,
        queryParameters,
        receiveTimeout: receiveTimeout,
      ),
    );
    return _response<T>(path);
  }

  @override
  Future<Response<T>> patch<T>(String path, {Object? data}) {
    calls.add(FakeApiCall('PATCH', path, data, null));
    return _response<T>(path);
  }

  @override
  Future<Response<T>> put<T>(String path, {Object? data}) {
    calls.add(FakeApiCall('PUT', path, data, null));
    return _response<T>(path);
  }

  @override
  Future<Response<T>> delete<T>(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
  }) {
    calls.add(FakeApiCall('DELETE', path, data, queryParameters));
    return _response<T>(path);
  }

  /// While true, every call waits forever (a slow server).
  bool holdResponses = false;

  Future<Response<T>> _response<T>(String path) async {
    if (holdResponses) await Completer<void>().future;
    final stub = _stubs[path];
    Object? data = stub != null
        ? stub()
        : _responses.isEmpty
        ? <String, Object?>{}
        : _responses.removeFirst();
    if (data is Completer<Object?>) data = await data.future;
    if (data is _QueuedError) throw data.error;
    return Response<T>(
      data: data as T,
      requestOptions: RequestOptions(path: path),
      statusCode: 200,
    );
  }
}
