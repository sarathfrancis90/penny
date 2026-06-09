import 'dart:convert';
import 'dart:io';

import 'package:penny_mobile/core/network/api_client.dart';
import 'package:penny_mobile/core/network/api_endpoints.dart';
import 'package:penny_mobile/data/repositories/api_response_helpers.dart';
import 'package:uuid/uuid.dart';

class StorageService {
  StorageService({required ApiClient apiClient}) : _api = apiClient;

  final ApiClient _api;
  static const _uuid = Uuid();

  Future<String> uploadReceipt(File imageFile, String userId) async {
    final timestamp = DateTime.now().millisecondsSinceEpoch;
    final uniqueId = _uuid.v4().split('-').first;
    final fileName = '${timestamp}_$uniqueId.jpg';
    final bytes = await imageFile.readAsBytes();
    final response = await _api.post(
      ApiEndpoints.receiptMedia,
      data: {
        'userId': userId,
        'fileName': fileName,
        'contentType': 'image/jpeg',
        'base64': base64Encode(bytes),
      },
    );
    return (responseMap(response)['url'] ?? '').toString();
  }

  Future<String> uploadAvatar(File imageFile, String userId) async {
    final bytes = await imageFile.readAsBytes();
    final response = await _api.post(
      ApiEndpoints.avatarMedia,
      data: {
        'userId': userId,
        'fileName': 'profile.jpg',
        'contentType': 'image/jpeg',
        'base64': base64Encode(bytes),
      },
    );
    final data = responseMap(response);
    await _api.patch(
      ApiEndpoints.userProfile,
      data: {
        'userId': userId,
        'photoURL': (data['url'] ?? '').toString(),
        'photoPath': (data['path'] ?? '').toString(),
      },
    );
    return (data['url'] ?? '').toString();
  }

  Future<void> deleteReceipt(String receiptPath) async {
    await _api.delete(ApiEndpoints.receiptMedia, data: {'path': receiptPath});
  }

  Future<void> deleteAvatar(String path) async {
    await _api.delete(ApiEndpoints.avatarMedia, data: {'path': path});
  }
}
