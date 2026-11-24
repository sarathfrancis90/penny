import 'package:dio/dio.dart';
import 'package:firebase_auth/firebase_auth.dart';

class ApiClient {
  ApiClient({required String baseUrl})
    : _dio = Dio(
        BaseOptions(
          baseUrl: baseUrl,
          connectTimeout: const Duration(seconds: 15),
          receiveTimeout: const Duration(seconds: 30),
          headers: {'Content-Type': 'application/json'},
        ),
      ) {
    _dio.interceptors.add(_AuthInterceptor());
  }

  final Dio _dio;

  Dio get dio => _dio;

  /// Receive timeout for the slow calls (photo analysis, media upload); the
  /// default 30 s is too short for those on a slow connection.
  static const longReceiveTimeout = Duration(seconds: 90);

  /// [receiveTimeout] overrides the default for this request only.
  Future<Response<T>> post<T>(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
    Duration? receiveTimeout,
  }) {
    return _dio.post<T>(
      path,
      data: data ?? const <String, Object?>{},
      queryParameters: queryParameters,
      options: receiveTimeout == null
          ? null
          : Options(receiveTimeout: receiveTimeout),
    );
  }

  Future<Response<T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
  }) {
    return _dio.get<T>(path, queryParameters: queryParameters);
  }

  Future<Response<T>> patch<T>(String path, {Object? data}) {
    return _dio.patch<T>(path, data: data ?? const <String, Object?>{});
  }

  Future<Response<T>> put<T>(String path, {Object? data}) {
    return _dio.put<T>(path, data: data ?? const <String, Object?>{});
  }

  Future<Response<T>> delete<T>(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
  }) {
    return _dio.delete<T>(
      path,
      data: data ?? const <String, Object?>{},
      queryParameters: queryParameters,
    );
  }
}

class _AuthInterceptor extends Interceptor {
  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final user = FirebaseAuth.instance.currentUser;
    if (user != null) {
      final token = await user.getIdToken();
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }
}
