import 'package:dio/dio.dart';

const kAiUnavailableMessage =
    "Penny's AI is temporarily unavailable. Please try again in a little "
    'while, or add the expense manually.';
const kServerErrorMessage =
    'Something went wrong on our side. Please try again.';
const kNetworkErrorMessage =
    "Couldn't reach Penny. Check your connection and try again.";
const kGenericErrorMessage = 'Something went wrong. Please try again.';
const kPhotoTooLargeMessage =
    'That photo is too large to upload. Try retaking it a little further '
    'away, or crop it first.';

/// Converts an API/network error into a short message safe to show users.
///
/// Never returns raw `DioException` text.
String apiErrorMessage(Object error) {
  if (error is! DioException) return kGenericErrorMessage;

  switch (error.type) {
    case DioExceptionType.connectionTimeout:
    case DioExceptionType.sendTimeout:
    case DioExceptionType.receiveTimeout:
    case DioExceptionType.connectionError:
      return kNetworkErrorMessage;
    default:
      break;
  }

  final status = error.response?.statusCode;
  final data = error.response?.data;
  final body = data is Map ? data : const <String, Object?>{};

  if (body['code'] == 'AI_UNAVAILABLE') return kAiUnavailableMessage;
  if (status == null) return kGenericErrorMessage;
  if (status == 413) return kPhotoTooLargeMessage;
  if (status >= 500) return kServerErrorMessage;

  final details = body['details'];
  if (details is String && details.trim().isNotEmpty) return details;
  return kGenericErrorMessage;
}
