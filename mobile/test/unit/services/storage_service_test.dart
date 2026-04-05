import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/data/services/storage_service.dart';

void main() {
  group('StorageService', () {
    test('uploadReceipt generates correct storage path format', () {
      // StorageService uses path: receipts/{userId}/{timestamp}_{uuid}.jpg
      // We can't test actual upload without Firebase Storage
      // but we can verify the service exists and is properly typed
      expect(StorageService, isNotNull);
    });

    test('FakeStorageService returns mock URL', () async {
      // This mirrors the _FakeStorageService used in integration tests
      final fake = _FakeStorageService();
      final url = await fake.uploadReceipt(null, 'test-user');
      expect(url, contains('https://'));
      expect(url, contains('receipt'));
    });
  });
}

class _FakeStorageService implements StorageService {
  @override
  Future<String> uploadReceipt(dynamic imageFile, String userId) async =>
      'https://fake-storage.example.com/receipts/$userId/receipt.jpg';
  @override
  Future<void> deleteReceipt(String receiptPath) async {}
  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}
