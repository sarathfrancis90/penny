import 'dart:async';
import 'dart:io';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:penny_mobile/data/services/auth_service.dart';
import 'package:penny_mobile/data/services/push_notification_service.dart';
import 'package:penny_mobile/presentation/providers/auth_provider.dart';
import 'package:penny_mobile/presentation/providers/providers.dart';
import 'package:penny_mobile/presentation/screens/settings/settings_screen.dart';

import '../../helpers/fake_api_client.dart';
import '../../helpers/test_helpers.dart';

class _FakeMessaging extends Fake implements FirebaseMessaging {}

class _FakeUser extends Fake implements User {
  bool deleted = false;
  FirebaseAuthException? deleteError;

  @override
  Future<void> delete() async {
    if (deleteError != null) throw deleteError!;
    deleted = true;
  }
}

void main() {
  late Directory dir;
  late FakeApiClient api;
  late StreamController<RemoteMessage> opened;
  late PushNotificationService push;

  setUp(() async {
    dir = await Directory.systemTemp.createTemp('penny_sign_out');
    Hive.init(dir.path);
    final box = await Hive.openBox('app_preferences');
    await box.put('device_id', 'device-1');
    api = FakeApiClient();
    opened = StreamController<RemoteMessage>.broadcast();
    push = PushNotificationService(
      apiClient: api,
      messaging: _FakeMessaging(),
      onMessage: const Stream.empty(),
      onMessageOpenedApp: opened.stream,
    );
  });

  tearDown(() async {
    await opened.close();
    await Hive.close();
    await dir.delete(recursive: true);
  });

  ProviderContainer signedInContainer(AuthService auth, User user) {
    final container = ProviderContainer(
      overrides: [
        authServiceProvider.overrideWithValue(auth),
        currentUserProvider.overrideWithValue(user),
        apiClientProvider.overrideWithValue(api),
        pushNotificationServiceProvider.overrideWithValue(push),
      ],
    );
    addTearDown(container.dispose);
    return container;
  }

  group('sign-out', () {
    test('unregisters the push token before signing out', () async {
      final mockAuth = createMockAuth();
      final container = signedInContainer(
        AuthService(auth: mockAuth),
        mockAuth.currentUser!,
      );

      await signOutUser(container.read);

      expect(api.calls.single.method, 'DELETE');
      expect(api.calls.single.path, '/api/push-tokens/device-1');
      expect(mockAuth.currentUser, isNull);
    });

    test('still signs out when the token cannot be removed', () async {
      api.queueError(FakeApiClient.networkError());
      final mockAuth = createMockAuth();
      final container = signedInContainer(
        AuthService(auth: mockAuth),
        mockAuth.currentUser!,
      );

      await signOutUser(container.read);

      expect(mockAuth.currentUser, isNull);
    });
  });

  test('message listeners are attached only once', () async {
    final urls = <String>[];
    final sub = push.navigationStream.listen(urls.add);
    addTearDown(sub.cancel);

    expect(push.attachMessageListeners(), isTrue);
    expect(push.attachMessageListeners(), isFalse);
    opened.add(const RemoteMessage(data: {'actionUrl': '/groups/g1'}));
    await Future<void>.delayed(Duration.zero);

    expect(urls, ['/groups/g1']);
  });

  group('account deletion', () {
    var signedOut = false;
    setUp(() => signedOut = false);

    test(
      'keeps the sign-in when the server could not delete the data',
      () async {
        api.queueError(FakeApiClient.networkError());
        final user = _FakeUser();

        await expectLater(
          deleteAccount(
            api: api,
            user: user,
            signOut: () async => signedOut = true,
          ),
          throwsA(isA<Object>()),
        );
        expect(user.deleted, isFalse);
        expect(signedOut, isFalse);
      },
    );

    test('deletes the sign-in after the server deleted the data', () async {
      final user = _FakeUser();
      await deleteAccount(
        api: api,
        user: user,
        signOut: () async => signedOut = true,
      );
      expect(api.calls.single.path, '/api/account/delete');
      expect(user.deleted, isTrue);
      expect(signedOut, isTrue);
    });

    test(
      'signs out even when the server already removed the sign-in',
      () async {
        final user = _FakeUser()
          ..deleteError = FirebaseAuthException(code: 'user-token-expired');
        await deleteAccount(
          api: api,
          user: user,
          signOut: () async => signedOut = true,
        );
        expect(signedOut, isTrue);
      },
    );
  });
}
