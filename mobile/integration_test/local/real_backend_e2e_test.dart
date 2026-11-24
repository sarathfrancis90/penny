// End-to-end run of the REAL app against a REAL local API.
//
// Nothing here is faked: the app talks to a locally running standalone API
// (which uses the Firestore/Storage emulators and the real AI model) and signs
// in through the Firebase Auth emulator. It lives in a subfolder so CI, which
// runs `integration_test/*_test.dart` without a backend, does not pick it up.
//
// Run (simulator, with the local API and emulators already up):
//   flutter test integration_test/local/real_backend_e2e_test.dart -d <device> \
//     --dart-define=API_BASE_URL=http://127.0.0.1:8787 \
//     --dart-define=AUTH_EMULATOR_HOST=127.0.0.1:9099 \
//     --dart-define=E2E_RECEIPT_PATH=/absolute/path/to/receipt.jpg
import 'dart:io';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:integration_test/integration_test.dart';
import 'package:penny_mobile/app.dart';
import 'package:penny_mobile/core/constants/env_config.dart';
import 'package:penny_mobile/firebase_options.dart';
import 'package:penny_mobile/presentation/providers/chat_provider.dart';
import 'package:penny_mobile/presentation/providers/expense_providers.dart';
import 'package:penny_mobile/presentation/providers/group_providers.dart';
import 'package:penny_mobile/presentation/providers/providers.dart';

const _receiptPath = String.fromEnvironment('E2E_RECEIPT_PATH');
// On Android, push the photo first: adb push receipt.jpg /data/local/tmp/

Future<void> _pumpUntil(
  WidgetTester tester,
  Finder finder, {
  Duration timeout = const Duration(seconds: 45),
  String? what,
}) async {
  final end = DateTime.now().add(timeout);
  while (DateTime.now().isBefore(end)) {
    await tester.pump(const Duration(milliseconds: 250));
    if (finder.evaluate().isNotEmpty) return;
  }
  final shown = find
      .byType(Text)
      .evaluate()
      .map((e) => (e.widget as Text).data ?? '')
      .where((t) => t.trim().isNotEmpty)
      .take(60)
      .join(' | ');
  fail(
    'Timed out waiting for ${what ?? finder.describeMatch(Plurality.one)}. '
    'On screen: $shown',
  );
}

Future<void> _pumpUntilGone(
  WidgetTester tester,
  Finder finder, {
  Duration timeout = const Duration(seconds: 45),
  String? what,
}) async {
  final end = DateTime.now().add(timeout);
  while (DateTime.now().isBefore(end)) {
    await tester.pump(const Duration(milliseconds: 250));
    if (finder.evaluate().isEmpty) return;
  }
  fail('Timed out waiting for ${what ?? 'widget'} to go away');
}

Future<void> _pumpFor(WidgetTester tester, Duration duration) async {
  final end = DateTime.now().add(duration);
  while (DateTime.now().isBefore(end)) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

/// Opens a bottom-navigation tab. A snackbar or success overlay can cover the
/// bar for a moment after a save, so keep trying until the tab is showing.
Future<void> _openTab(
  WidgetTester tester,
  IconData icon,
  Finder showing, {
  required String name,
}) async {
  for (var attempt = 0; attempt < 40; attempt++) {
    if (showing.evaluate().isNotEmpty) return;
    final target = find.byIcon(icon);
    if (target.evaluate().isNotEmpty) {
      await tester.tap(target.first, warnIfMissed: false);
    }
    await _pumpFor(tester, const Duration(milliseconds: 500));
  }
  fail('Could not open the $name tab');
}

bool _sameDay(DateTime a, DateTime b) =>
    a.year == b.year && a.month == b.month && a.day == b.day;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  final configured =
      EnvConfig.authEmulatorHost.isNotEmpty &&
      EnvConfig.apiBaseUrl.startsWith('http://127.0.0.1');

  testWidgets(
    'real app against the local API: chat expense, dashboard, date filter, '
    'receipt photo, default group',
    (tester) async {
      // ---- start-up, exactly like main() ----
      await Hive.initFlutter();
      final prefs = await Hive.openBox('app_preferences');
      await Hive.openBox('guest_expenses');
      await prefs.put('onboarding_complete', true);
      await prefs.put('guest_mode', false);
      // Same as main(): on Android the native config already set it up.
      if (defaultTargetPlatform == TargetPlatform.android) {
        await Firebase.initializeApp();
      } else {
        await Firebase.initializeApp(
          options: DefaultFirebaseOptions.currentPlatform,
        );
      }
      final host = EnvConfig.authEmulatorHost.split(':');
      await FirebaseAuth.instance.useAuthEmulator(host[0], int.parse(host[1]));
      await FirebaseAuth.instance.signOut();
      final stamp = DateTime.now().millisecondsSinceEpoch;
      final credential = await FirebaseAuth.instance
          .createUserWithEmailAndPassword(
            email: 'app-e2e-$stamp@example.test',
            password: 'local-e2e-$stamp',
          );
      await credential.user!.updateDisplayName('E2E User');
      final uid = credential.user!.uid;

      await tester.pumpWidget(const ProviderScope(child: PennyApp()));
      await _pumpUntil(
        tester,
        find.text('Describe an expense...'),
        what: 'the home screen',
      );
      final container = ProviderScope.containerOf(
        tester.element(find.byType(PennyApp)),
      );
      final api = container.read(apiClientProvider);

      // ---- 1. add an expense by typing in chat ----
      await tester.enterText(
        find.widgetWithText(TextField, 'Describe an expense...'),
        'Lunch at Subway today for \$14.50',
      );
      await tester.pump();
      await tester.tap(find.byTooltip('Send message'));
      await _pumpUntil(
        tester,
        find.text('Confirm & Save'),
        what: 'the parsed expense card',
      );
      expect(find.textContaining('Subway'), findsWidgets);
      await tester.tap(find.text('Confirm & Save'));
      await _pumpUntilGone(
        tester,
        find.text('Confirm & Save'),
        what: 'the expense card after saving',
      );

      // ---- 2. it shows on the dashboard without a manual refresh ----
      final calendar = find.byIcon(Icons.date_range);
      await _openTab(
        tester,
        Icons.bar_chart_outlined,
        calendar,
        name: 'Dashboard',
      );
      // The expense list sits below the summary and charts, and the lazy list
      // only builds rows near the viewport, so scroll down to it.
      await _pumpFor(tester, const Duration(seconds: 1));
      await tester.scrollUntilVisible(
        find.textContaining('Subway'),
        300,
        scrollable: find.byType(Scrollable).first,
        maxScrolls: 30,
      );
      expect(find.textContaining('Subway'), findsWidgets);
      await tester.drag(
        find.byType(Scrollable).first,
        const Offset(0, 5000),
        warnIfMissed: false,
      );
      await _pumpFor(tester, const Duration(seconds: 1));

      // ---- 3. the customer's date-filter bug, on a real device ----
      await tester.tap(calendar);
      await _pumpUntil(
        tester,
        find.byType(DateRangePickerDialog),
        what: 'the date range picker (first time)',
      );
      await tester.tap(find.text('Save'));
      await _pumpUntilGone(tester, find.byType(DateRangePickerDialog));
      expect(container.read(dashboardPeriodProvider), DashboardPeriod.custom);
      await tester.tap(calendar);
      await _pumpUntil(
        tester,
        find.byType(DateRangePickerDialog),
        timeout: const Duration(seconds: 5),
        what: 'the date range picker when a custom range is already active',
      );
      await tester.tap(find.byIcon(Icons.close));
      await _pumpUntilGone(tester, find.byType(DateRangePickerDialog));
      await tester.tap(find.text('M'));
      await tester.pump();

      // ---- 4. a receipt photo: analysed, photo stored, expense saved ----
      if (_receiptPath.isNotEmpty) {
        await _openTab(
          tester,
          Icons.chat_bubble_outline,
          find.text('Describe an expense...'),
          name: 'Home',
        );
        final started = DateTime.now();
        // The gallery picker is a system screen a test cannot drive, so hand
        // the photo to the same entry point the picker calls.
        final analysis = container
            .read(chatProvider.notifier)
            .analyzeImage(File(_receiptPath));
        await _pumpUntil(
          tester,
          find.text('Confirm & Save'),
          timeout: const Duration(seconds: 90),
          what: 'the expense read from the receipt photo',
        );
        await analysis;
        debugPrint(
          '[E2E] receipt analysed and uploaded in '
          '${DateTime.now().difference(started).inMilliseconds} ms',
        );
        expect(container.read(chatProvider).error, isNull);
        await tester.tap(find.text('Confirm & Save'));
        await _pumpUntilGone(tester, find.text('Confirm & Save'));
      }

      // ---- 5. what the server now holds ----
      final expenses = await container.refresh(allExpensesProvider.future);
      final today = DateTime.now();
      final subway = expenses.singleWhere((e) => e.vendor.contains('Subway'));
      expect(subway.amount, 14.5);
      expect(subway.userId, uid);
      expect(
        _sameDay(subway.date.toDate(), today),
        isTrue,
        reason: 'saved today, shown as ${subway.date.toDate()}',
      );
      if (_receiptPath.isNotEmpty) {
        final receipt = expenses.singleWhere(
          (e) => !e.vendor.contains('Subway'),
        );
        debugPrint(
          '[E2E] receipt saved as ${receipt.vendor} ${receipt.amount} '
          '${receipt.date.toDate()} ${receipt.category}',
        );
        expect(receipt.amount, greaterThan(0));
        expect(receipt.receiptUrl, isNotNull);
        expect(receipt.receiptUrl, isNotEmpty);
      }

      // ---- 6. default group is applied to a new expense ----
      final created = await api.post<Map<String, dynamic>>(
        '/api/groups',
        data: {'name': 'E2E Household', 'userName': 'E2E User'},
      );
      final groupId = created.data!['groupId'] as String;
      await api.post<Map<String, dynamic>>(
        '/api/user/default-group',
        data: {'groupId': groupId},
      );
      container.invalidate(userGroupsProvider);
      container.invalidate(defaultGroupProvider);

      await _openTab(
        tester,
        Icons.chat_bubble_outline,
        find.text('Describe an expense...'),
        name: 'Home',
      );
      // The "saved" confirmation covers the screen for about 1.5 s.
      await _pumpFor(tester, const Duration(seconds: 3));
      await tester.enterText(
        find.widgetWithText(TextField, 'Describe an expense...'),
        'Coffee at Balzacs Roastery today for \$3.25',
      );
      await tester.pump();
      await tester.tap(find.byTooltip('Send message'));
      await _pumpUntil(tester, find.text('Confirm & Save'));
      await _pumpUntil(
        tester,
        find.textContaining('E2E Household'),
        timeout: const Duration(seconds: 10),
        what: 'the default group preselected on the expense card',
      );
      await tester.tap(find.text('Confirm & Save'));
      await _pumpUntilGone(tester, find.text('Confirm & Save'));

      final afterGroup = await container.refresh(allExpensesProvider.future);
      final coffee = afterGroup.singleWhere((e) => e.vendor.contains('Balzac'));
      expect(coffee.amount, 3.25);
      expect(coffee.groupId, groupId);
      expect(coffee.expenseType, 'group');

      // ---- 7. the group screen shows it ----
      await _openTab(
        tester,
        Icons.group_outlined,
        find.textContaining('E2E Household'),
        name: 'Groups',
      );
      await tester.tap(find.textContaining('E2E Household').first);
      await _pumpUntil(
        tester,
        find.textContaining('Balzacs'),
        timeout: const Duration(seconds: 15),
        what: 'the group expense on the group screen',
      );
      await _pumpFor(tester, const Duration(milliseconds: 500));

      // ---- 8. invite a second person, then switch accounts on this phone ----
      final inviteeEmail = 'app-e2e-b-$stamp@example.test';
      final invite = await api.post<Map<String, dynamic>>(
        '/api/groups/$groupId/members',
        data: {'email': inviteeEmail, 'role': 'member'},
      );
      expect(invite.statusCode, 200);

      await FirebaseAuth.instance.signOut();
      // As on a real phone: the sign-in screen comes up before anyone else
      // can sign in.
      await _pumpUntil(
        tester,
        find.text('Sign In'),
        timeout: const Duration(seconds: 20),
        what: 'the sign-in screen after signing out',
      );
      expect(find.textContaining('Subway'), findsNothing);
      expect(find.textContaining('Balzacs'), findsNothing);
      // A person needs at least a moment to type; signing in while the
      // previous screens are still animating away is not something a user
      // can do (and makes go_router briefly show two tab bars).
      await _pumpFor(tester, const Duration(milliseconds: 1500));
      await FirebaseAuth.instance.createUserWithEmailAndPassword(
        email: inviteeEmail,
        password: 'local-e2e-b-$stamp',
      );
      await FirebaseAuth.instance.currentUser!.updateDisplayName('E2E Second');
      final secondUid = FirebaseAuth.instance.currentUser!.uid;

      // Nothing of the first person's may show for the second, not even
      // while the second person's own data is still loading.
      final end = DateTime.now().add(const Duration(seconds: 20));
      var sawHome = false;
      while (DateTime.now().isBefore(end)) {
        await tester.pump(const Duration(milliseconds: 100));
        expect(
          find.textContaining('Subway'),
          findsNothing,
          reason: 'the first account\'s expense showed after switching',
        );
        expect(find.textContaining('Balzacs'), findsNothing);
        if (find.text('Describe an expense...').evaluate().isNotEmpty) {
          sawHome = true;
          break;
        }
      }
      expect(sawHome, isTrue, reason: 'home screen for the second account');

      await _openTab(
        tester,
        Icons.bar_chart_outlined,
        find.byIcon(Icons.date_range),
        name: 'Dashboard',
      );
      for (var i = 0; i < 20; i++) {
        await tester.pump(const Duration(milliseconds: 150));
        expect(find.textContaining('Subway'), findsNothing);
        expect(find.textContaining('Balzacs'), findsNothing);
      }
      final secondExpenses = await container.refresh(
        allExpensesProvider.future,
      );
      expect(
        secondExpenses.where((e) => e.userId != secondUid),
        isEmpty,
        reason: 'the second account must only get its own expenses',
      );

      // ---- 9. the invitation waits on the Groups screen and can be accepted ----
      await _openTab(
        tester,
        Icons.group_outlined,
        find.text('Accept'),
        name: 'Groups (pending invitation)',
      );
      expect(find.textContaining('E2E Household'), findsWidgets);
      expect(find.textContaining('invited you to join'), findsOneWidget);
      await tester.tap(find.text('Accept'));
      await _pumpUntil(
        tester,
        find.textContaining('You joined'),
        timeout: const Duration(seconds: 15),
        what: 'the joined confirmation',
      );
      await _pumpUntilGone(
        tester,
        find.text('Accept'),
        timeout: const Duration(seconds: 15),
        what: 'the invitation card after accepting',
      );
      // The "You joined" message also names the group; let it close first.
      await _pumpUntilGone(
        tester,
        find.textContaining('You joined'),
        timeout: const Duration(seconds: 15),
        what: 'the joined message',
      );
      await _pumpUntil(
        tester,
        find.textContaining('E2E Household'),
        timeout: const Duration(seconds: 15),
        what: 'the joined group in the list',
      );
      await tester.tap(find.textContaining('E2E Household').first);
      await _pumpUntil(
        tester,
        find.text('Expenses'),
        timeout: const Duration(seconds: 15),
        what: 'the group screen for the new member',
      );
      await _pumpFor(tester, const Duration(seconds: 1));
      // The new member is listed (by name, or by email if they had none),
      // and the member list no longer breaks on a member without a name.
      expect(
        find.textContaining('E2E Second').evaluate().isNotEmpty ||
            find.textContaining(inviteeEmail).evaluate().isNotEmpty,
        isTrue,
        reason: 'the new member in the member list',
      );
      expect(tester.takeException(), isNull);
      // The expense list sits below the member list.
      for (
        var i = 0;
        i < 30 && find.textContaining('Balzacs').evaluate().isEmpty;
        i++
      ) {
        await tester.drag(
          find.byType(Scrollable).first,
          const Offset(0, -300),
          warnIfMissed: false,
        );
        await _pumpFor(tester, const Duration(milliseconds: 300));
      }
      expect(find.textContaining('Balzacs'), findsWidgets);
      await _pumpFor(tester, const Duration(milliseconds: 500));
    },
    skip: !configured,
    timeout: const Timeout(Duration(minutes: 6)),
  );
}
