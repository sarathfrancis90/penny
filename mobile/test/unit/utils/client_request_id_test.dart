import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/core/utils/client_request_id.dart';

void main() {
  test('newClientRequestId is 32 chars of [a-z0-9] and random', () {
    final a = newClientRequestId();
    final b = newClientRequestId();
    expect(a, matches(RegExp(r'^[a-z0-9]{32}$')));
    expect(b, matches(RegExp(r'^[a-z0-9]{32}$')));
    expect(a, isNot(b));
  });

  group('SaveAttemptId', () {
    test('reuses the id when the same save is retried', () {
      final attempt = SaveAttemptId();
      final payload = {'vendor': 'Tim Hortons', 'amount': 6.42};
      expect(attempt.idFor(payload), attempt.idFor({...payload}));
    });

    test('issues a new id once the save content changes', () {
      final attempt = SaveAttemptId();
      final first = attempt.idFor({'vendor': 'Tim Hortons', 'amount': 6.42});
      final second = attempt.idFor({'vendor': 'Tim Hortons', 'amount': 7.0});
      expect(second, isNot(first));
    });
  });
}
