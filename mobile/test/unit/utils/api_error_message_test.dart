import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/core/network/api_error_message.dart';

DioException _badResponse(int status, [Object? data]) {
  final options = RequestOptions(path: '/api/analyze-expense');
  return DioException(
    requestOptions: options,
    type: DioExceptionType.badResponse,
    response: Response<Object?>(
      requestOptions: options,
      statusCode: status,
      data: data,
    ),
  );
}

void main() {
  group('apiErrorMessage', () {
    test('AI_UNAVAILABLE 503 becomes a friendly AI message', () {
      final message = apiErrorMessage(
        _badResponse(503, {
          'error': 'Service unavailable',
          'code': 'AI_UNAVAILABLE',
          'details': 'AI service is temporarily unavailable',
        }),
      );
      expect(message, kAiUnavailableMessage);
      expect(message, isNot(contains('DioException')));
    });

    test('generic 5xx never leaks the raw DioException text', () {
      final message = apiErrorMessage(_badResponse(500, {'error': 'x'}));
      expect(message, kServerErrorMessage);
    });

    test('4xx surfaces the server details when present', () {
      final message = apiErrorMessage(
        _badResponse(400, {'error': 'Bad Request', 'details': 'Missing text'}),
      );
      expect(message, 'Missing text');
    });

    test('timeouts and connection errors get a network message', () {
      final options = RequestOptions(path: '/x');
      for (final type in [
        DioExceptionType.connectionTimeout,
        DioExceptionType.receiveTimeout,
        DioExceptionType.connectionError,
      ]) {
        expect(
          apiErrorMessage(DioException(requestOptions: options, type: type)),
          kNetworkErrorMessage,
        );
      }
    });

    test('non-Dio errors fall back to a generic message', () {
      expect(apiErrorMessage(StateError('boom')), kGenericErrorMessage);
    });
  });
}
