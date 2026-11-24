import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/core/network/api_client.dart';
import 'package:penny_mobile/core/network/api_endpoints.dart';
import 'package:penny_mobile/data/repositories/ai_repository.dart';
import 'package:penny_mobile/data/repositories/expense_repository.dart';
import 'package:penny_mobile/data/services/storage_service.dart';

import '../../helpers/fake_api_client.dart';

class _RecordingAdapter implements HttpClientAdapter {
  final requests = <RequestOptions>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    return ResponseBody.fromString(
      '{}',
      200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  late FakeApiClient api;

  setUp(() => api = FakeApiClient());

  test(
    'saveExpense sends clientRequestId, and group fields for a group',
    () async {
      final repo = ExpenseRepository(apiClient: api);
      await repo.saveExpense(
        userId: 'u1',
        vendor: 'Metro',
        amount: 20,
        category: 'Groceries',
        date: '2026-11-20',
        groupId: 'g1',
        clientRequestId: 'abc',
      );
      await repo.saveExpense(
        userId: 'u1',
        vendor: 'Metro',
        amount: 20,
        category: 'Groceries',
        date: '2026-11-20',
      );

      final group = api.calls[0].data! as Map;
      expect(group['clientRequestId'], 'abc');
      expect(group['groupId'], 'g1');
      expect(group['expenseType'], 'group');
      final personal = api.calls[1].data! as Map;
      expect(personal.containsKey('groupId'), isFalse);
      expect(personal.containsKey('expenseType'), isFalse);
      expect(personal.containsKey('clientRequestId'), isFalse);
    },
  );

  test(
    'analyzeExpense sends the device-local date and a 90 s timeout',
    () async {
      api.queueResponse({
        'success': true,
        'data': {'vendor': 'Tim Hortons', 'amount': 6.42},
      });
      await AiRepository(apiClient: api).analyzeExpense(
        text: 'coffee 6.42',
        userId: 'u1',
        now: DateTime(2026, 3, 5, 23, 30),
      );

      final call = api.calls.single;
      expect(call.path, ApiEndpoints.analyzeExpense);
      expect((call.data! as Map)['localDate'], '2026-03-05');
      expect(call.receiveTimeout, const Duration(seconds: 90));
    },
  );

  test('receipt upload uses the 90 s timeout', () async {
    final dir = await Directory.systemTemp.createTemp('penny_receipt');
    addTearDown(() => dir.delete(recursive: true));
    final file = File('${dir.path}/r.jpg')..writeAsBytesSync([1, 2, 3]);
    api.queueResponse({'url': 'https://cdn.test/r.jpg'});

    await StorageService(apiClient: api).uploadReceipt(file, 'u1');

    expect(api.calls.single.path, ApiEndpoints.receiptMedia);
    expect(api.calls.single.receiveTimeout, const Duration(seconds: 90));
  });

  test(
    'ApiClient applies a per-request receive timeout only when asked',
    () async {
      final client = ApiClient(baseUrl: 'https://api.test');
      final adapter = _RecordingAdapter();
      client.dio.interceptors.clear(); // no Firebase in unit tests
      client.dio.httpClientAdapter = adapter;

      await client.post<dynamic>('/a', data: const {'x': 1});
      await client.post<dynamic>(
        '/b',
        data: const {'x': 1},
        receiveTimeout: ApiClient.longReceiveTimeout,
      );

      expect(adapter.requests[0].receiveTimeout, const Duration(seconds: 30));
      expect(adapter.requests[1].receiveTimeout, const Duration(seconds: 90));
    },
  );
}
