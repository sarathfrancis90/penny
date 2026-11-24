// End-to-end group flows of the REAL app against a REAL local API.
//
// Several people share one simulator: the app is signed in as one of them at
// a time (sign out, wait for the sign-in screen, sign in as the next), and
// the others' setup steps go straight to the API with their own ID tokens.
// Every permission-relevant action is tried through the UI at least once,
// and every write is checked on the server.
//
// Lines marked `// BUG:` work around a real app/API bug so the later flows
// can still run; each one is also printed as `[E2E-BUG]` and summarised at
// the end of the run.
//
// Run (simulator, with the local API and emulators already up):
//   flutter test integration_test/local/groups_flows_test.dart -d <device> \
//     --dart-define=API_BASE_URL=http://127.0.0.1:8787 \
//     --dart-define=AUTH_EMULATOR_HOST=127.0.0.1:9099
import 'package:dio/dio.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:integration_test/integration_test.dart';
import 'package:intl/intl.dart';
import 'package:penny_mobile/app.dart';
import 'package:penny_mobile/core/constants/categories.dart';
import 'package:penny_mobile/core/constants/env_config.dart';
import 'package:penny_mobile/firebase_options.dart';
import 'package:penny_mobile/presentation/providers/group_providers.dart';

// ------------------------------------------------------------------ helpers

final _bugs = <String>[];
final _notes = <String>[];

void _step(String message) => debugPrint('[E2E] $message');

void _bug(String message) {
  _bugs.add(message);
  debugPrint('[E2E-BUG] $message');
}

void _note(String message) {
  _notes.add(message);
  debugPrint('[E2E-NOTE] $message');
}

String _onScreen() => find
    .byType(Text)
    .evaluate()
    .map((e) => (e.widget as Text).data ?? '')
    .where((t) => t.trim().isNotEmpty)
    .take(80)
    .join(' | ');

Future<void> _pumpUntil(
  WidgetTester tester,
  Finder finder, {
  Duration timeout = const Duration(seconds: 45),
  String? what,
}) async {
  if (!await _waitFor(tester, finder, timeout: timeout)) {
    fail(
      'Timed out waiting for ${what ?? finder.describeMatch(Plurality.one)}. '
      'On screen: ${_onScreen()}',
    );
  }
}

/// Like [_pumpUntil] but returns false instead of failing.
Future<bool> _waitFor(
  WidgetTester tester,
  Finder finder, {
  Duration timeout = const Duration(seconds: 10),
}) async {
  final end = DateTime.now().add(timeout);
  while (DateTime.now().isBefore(end)) {
    await tester.pump(const Duration(milliseconds: 250));
    if (finder.evaluate().isNotEmpty) return true;
  }
  return false;
}

Future<bool> _waitForGone(
  WidgetTester tester,
  Finder finder, {
  Duration timeout = const Duration(seconds: 10),
}) async {
  final end = DateTime.now().add(timeout);
  while (DateTime.now().isBefore(end)) {
    await tester.pump(const Duration(milliseconds: 250));
    if (finder.evaluate().isEmpty) return true;
  }
  return false;
}

Future<void> _pumpUntilGone(
  WidgetTester tester,
  Finder finder, {
  Duration timeout = const Duration(seconds: 45),
  String? what,
}) async {
  if (!await _waitForGone(tester, finder, timeout: timeout)) {
    fail(
      'Timed out waiting for ${what ?? 'widget'} to go away. '
      'On screen: ${_onScreen()}',
    );
  }
}

Future<void> _pumpFor(WidgetTester tester, Duration duration) async {
  final end = DateTime.now().add(duration);
  while (DateTime.now().isBefore(end)) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

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
  fail('Could not open the $name tab. On screen: ${_onScreen()}');
}

Future<void> _hideKeyboard(WidgetTester tester) async {
  FocusManager.instance.primaryFocus?.unfocus();
  await _pumpFor(tester, const Duration(milliseconds: 400));
}

/// Text of the snackbar on screen right now, or '' if there is none.
String _snackText() {
  final texts = find.descendant(
    of: find.byType(SnackBar),
    matching: find.byType(Text),
  );
  return texts.evaluate().map((e) => (e.widget as Text).data ?? '').join(' ');
}

/// Waits for a snackbar containing [part]; returns its full text.
Future<String> _waitSnack(
  WidgetTester tester,
  String part, {
  Duration timeout = const Duration(seconds: 20),
}) async {
  final finder = find.descendant(
    of: find.byType(SnackBar),
    matching: find.textContaining(part),
  );
  await _pumpUntil(
    tester,
    finder,
    timeout: timeout,
    what: 'a snackbar containing "$part"',
  );
  return _snackText();
}

/// Waits for any snackbar and returns its text.
Future<String> _anySnack(
  WidgetTester tester, {
  Duration timeout = const Duration(seconds: 20),
}) async {
  await _pumpUntil(
    tester,
    find.byType(SnackBar),
    timeout: timeout,
    what: 'a snackbar',
  );
  await _pumpFor(tester, const Duration(milliseconds: 300));
  return _snackText();
}

Future<void> _clearSnacks(WidgetTester tester) async {
  for (final element in find.byType(ScaffoldMessenger).evaluate()) {
    final state = (element as StatefulElement).state;
    if (state is ScaffoldMessengerState) state.clearSnackBars();
  }
  await _pumpFor(tester, const Duration(milliseconds: 600));
}

/// Readable means: no raw exception class names or stack-trace text.
bool _readable(String message) =>
    !message.contains('DioException') &&
    !message.contains('Exception:') &&
    !message.contains('RequestOptions') &&
    !message.contains('status code of');

Finder _semantics(String label) => find.byWidgetPredicate(
  (w) => w is Semantics && w.properties.label == label,
);

Future<void> _scrollTo(WidgetTester tester, Finder finder) async {
  // The target may be above the current position: try upwards first, then
  // downwards.
  for (final dy in const [250.0, -250.0]) {
    for (var i = 0; i < 40 && finder.evaluate().isEmpty; i++) {
      final scrollable = find.byType(Scrollable).first;
      final before = tester.state<ScrollableState>(scrollable).position.pixels;
      await tester.drag(scrollable, Offset(0, dy), warnIfMissed: false);
      await _pumpFor(tester, const Duration(milliseconds: 250));
      // Stop once the list no longer moves (top or bottom reached).
      if (tester.state<ScrollableState>(scrollable).position.pixels == before) {
        break;
      }
    }
  }
  if (finder.evaluate().isEmpty) {
    fail('Could not scroll to $finder. On screen: ${_onScreen()}');
  }
  await tester.ensureVisible(finder.first);
  await _pumpFor(tester, const Duration(milliseconds: 300));
}

Future<void> _scrollTop(WidgetTester tester) async {
  await tester.drag(
    find.byType(Scrollable).first,
    const Offset(0, 6000),
    warnIfMissed: false,
  );
  await _pumpFor(tester, const Duration(milliseconds: 800));
}

/// Pull-to-refresh on the first scrollable.
Future<void> _pullToRefresh(WidgetTester tester) async {
  await tester.fling(
    find.byType(Scrollable).first,
    const Offset(0, 400),
    1200,
    warnIfMissed: false,
  );
  await _pumpFor(tester, const Duration(seconds: 2));
}

// --------------------------------------------------------------- people + API

class _Person {
  _Person(this.key, this.name, this.email, this.password);
  final String key;
  final String name;
  final String email;
  final String password;
  String uid = '';
  String token = '';
}

late Dio _http;

Future<Response<dynamic>> _call(
  _Person who,
  String method,
  String path, {
  Object? data,
  Map<String, dynamic>? query,
}) {
  return _http.request<dynamic>(
    path,
    data: data,
    queryParameters: query,
    options: Options(
      method: method,
      headers: {'Authorization': 'Bearer ${who.token}'},
    ),
  );
}

Map<String, dynamic> _map(Object? value) =>
    value is Map ? Map<String, dynamic>.from(value) : <String, dynamic>{};

List<Map<String, dynamic>> _list(Object? value) =>
    value is List ? value.map(_map).toList() : <Map<String, dynamic>>[];

Future<List<Map<String, dynamic>>> _groupsOf(_Person who) async {
  final r = await _call(who, 'GET', '/api/groups', query: {'userId': who.uid});
  expect(r.statusCode, 200, reason: 'GET /api/groups as ${who.key}: ${r.data}');
  return _list(_map(r.data)['groups']);
}

Future<Map<String, dynamic>?> _groupOf(_Person who, String groupId) async {
  final groups = await _groupsOf(who);
  return groups.where((g) => g['id'] == groupId).firstOrNull;
}

Future<List<Map<String, dynamic>>> _membersOf(
  _Person who,
  String groupId,
) async {
  final r = await _call(who, 'GET', '/api/groups/$groupId/members');
  expect(r.statusCode, 200, reason: 'members as ${who.key}: ${r.data}');
  return _list(_map(r.data)['members']);
}

Future<List<Map<String, dynamic>>> _invitationsOf(_Person who) async {
  final r = await _call(who, 'GET', '/api/groups/invitations');
  expect(r.statusCode, 200, reason: 'invitations as ${who.key}: ${r.data}');
  return _list(_map(r.data)['invitations']);
}

Future<List<Map<String, dynamic>>> _groupExpenses(
  _Person who,
  String groupId,
) async {
  final r = await _call(
    who,
    'GET',
    '/api/expenses',
    query: {'scope': 'group', 'groupId': groupId},
  );
  expect(r.statusCode, 200, reason: 'group expenses as ${who.key}: ${r.data}');
  return _list(_map(r.data)['expenses']);
}

Future<List<Map<String, dynamic>>> _ownExpenses(_Person who) async {
  final r = await _call(
    who,
    'GET',
    '/api/expenses',
    query: {'scope': 'all', 'userId': who.uid},
  );
  expect(r.statusCode, 200, reason: 'own expenses as ${who.key}: ${r.data}');
  return _list(_map(r.data)['expenses']);
}

Future<List<Map<String, dynamic>>> _notificationsOf(_Person who) async {
  final r = await _call(
    who,
    'GET',
    '/api/notifications',
    query: {'userId': who.uid},
  );
  expect(r.statusCode, 200, reason: 'notifications as ${who.key}: ${r.data}');
  return _list(_map(r.data)['notifications']);
}

Future<List<Map<String, dynamic>>> _activitiesOf(
  _Person who,
  String groupId,
) async {
  final r = await _call(who, 'GET', '/api/groups/$groupId/activities');
  expect(r.statusCode, 200, reason: 'activities as ${who.key}: ${r.data}');
  return _list(_map(r.data)['activities']);
}

Future<List<Map<String, dynamic>>> _groupBudgets(
  _Person who,
  String groupId,
) async {
  final now = DateTime.now();
  final r = await _call(
    who,
    'GET',
    '/api/budgets/group',
    query: {'groupId': groupId, 'month': now.month, 'year': now.year},
  );
  expect(r.statusCode, 200, reason: 'group budgets as ${who.key}: ${r.data}');
  return _list(_map(r.data)['budgets']);
}

String _today() => DateFormat('yyyy-MM-dd').format(DateTime.now());

// ----------------------------------------------------------------- UI steps

Future<void> _switchTo(WidgetTester tester, _Person who) async {
  _step('--- switching the app to ${who.key} (${who.name})');
  // Leave any pushed screen first, so only the tab shell is on the stack.
  for (var i = 0; i < 4 && find.byType(BackButton).evaluate().isNotEmpty; i++) {
    await tester.pageBack();
    await _pumpFor(tester, const Duration(milliseconds: 600));
  }
  await _clearSnacks(tester);
  await FirebaseAuth.instance.signOut();
  await _pumpUntil(
    tester,
    find.text('Sign In'),
    timeout: const Duration(seconds: 20),
    what: 'the sign-in screen after signing out',
  );
  await _pumpFor(tester, const Duration(milliseconds: 1500));
  await FirebaseAuth.instance.signInWithEmailAndPassword(
    email: who.email,
    password: who.password,
  );
  await _pumpUntil(
    tester,
    find.text('Describe an expense...'),
    timeout: const Duration(seconds: 30),
    what: 'the home screen for ${who.key}',
  );
  await _pumpFor(tester, const Duration(seconds: 1));
}

Future<void> _openGroupsTab(WidgetTester tester) => _openTab(
  tester,
  Icons.group_outlined,
  find.byTooltip('Create group'),
  name: 'Groups',
);

Future<void> _openGroup(WidgetTester tester, String name) async {
  await _openGroupsTab(tester);
  await _pumpUntil(
    tester,
    find.text(name),
    timeout: const Duration(seconds: 20),
    what: 'group "$name" in the list',
  );
  await tester.tap(find.text(name).first);
  await _pumpUntil(
    tester,
    find.text('MEMBERS'),
    timeout: const Duration(seconds: 20),
    what: 'the group screen of "$name"',
  );
  await _pumpFor(tester, const Duration(milliseconds: 1500));
}

Future<void> _back(WidgetTester tester) async {
  await tester.pageBack();
  await _pumpFor(tester, const Duration(milliseconds: 900));
}

Future<void> _closeSheet(WidgetTester tester, Finder inSheet) async {
  Navigator.of(tester.element(inSheet.first)).pop();
  await _pumpFor(tester, const Duration(milliseconds: 800));
}

/// Invites [email] from the open group screen. Returns the snackbar text.
Future<String> _inviteViaUi(
  WidgetTester tester,
  String email, {
  String role = 'member',
}) async {
  await _clearSnacks(tester);
  await tester.tap(find.byTooltip('Invite member'));
  await _pumpUntil(tester, find.text('Send Invite'), what: 'the invite sheet');
  await tester.enterText(
    find.widgetWithText(TextField, 'Email address'),
    email,
  );
  await _hideKeyboard(tester);
  if (role != 'member') {
    final label = '${role[0].toUpperCase()}${role.substring(1)}';
    await tester.tap(find.byType(DropdownButtonFormField<String>));
    await _pumpFor(tester, const Duration(milliseconds: 800));
    await tester.tap(find.text(label).last);
    await _pumpFor(tester, const Duration(milliseconds: 800));
  }
  await tester.tap(find.text('Send Invite'));
  final text = await _anySnack(tester);
  await _waitForGone(tester, find.text('Send Invite'));
  return text;
}

Future<String> _addGroupExpenseViaUi(
  WidgetTester tester,
  String vendor,
  String amount,
) async {
  await _clearSnacks(tester);
  await tester.tap(find.byTooltip('Add group expense'));
  await _pumpUntil(tester, find.text('Add Expense'), what: 'the expense sheet');
  await tester.enterText(
    find.widgetWithText(TextField, 'Vendor / merchant'),
    vendor,
  );
  await tester.enterText(find.widgetWithText(TextField, 'Amount'), amount);
  await _hideKeyboard(tester);
  await tester.tap(find.text('Add Expense'));
  final text = await _anySnack(tester);
  await _waitForGone(tester, find.text('Add Expense'));
  return text;
}

Future<void> _longPressMember(WidgetTester tester, String name) async {
  await _scrollTop(tester);
  await _pumpUntil(tester, find.text(name), what: 'member "$name"');
  await tester.longPress(find.text(name).first);
  await _pumpFor(tester, const Duration(milliseconds: 900));
}

Future<String> _changeRoleViaUi(
  WidgetTester tester,
  String memberName,
  String newRoleLabel,
) async {
  await _clearSnacks(tester);
  await _longPressMember(tester, memberName);
  await _pumpUntil(
    tester,
    find.text('Manage $memberName'),
    what: 'the member management sheet',
  );
  await tester.tap(
    find
        .descendant(
          of: find.byType(ListTile),
          matching: find.text(newRoleLabel),
        )
        .last,
  );
  return _anySnack(tester);
}

Future<void> _openOverflow(WidgetTester tester) async {
  await tester.tap(find.byIcon(Icons.more_vert).first);
  await _pumpFor(tester, const Duration(milliseconds: 900));
}

Future<void> _createBudgetViaUi(
  WidgetTester tester,
  String category,
  String limit,
) async {
  await _scrollTo(tester, find.text('BUDGETS'));
  await tester.tap(find.text('Add').first);
  await _pumpUntil(
    tester,
    find.text('Add Group Budget'),
    what: 'the group budget sheet',
  );
  await tester.tap(find.byType(DropdownButtonFormField<String>));
  await _pumpFor(tester, const Duration(milliseconds: 900));
  await tester.tap(find.text(category).last);
  await _pumpFor(tester, const Duration(milliseconds: 900));
  await tester.enterText(
    find.widgetWithText(TextField, r'Monthly Limit ($)'),
    limit,
  );
  await _hideKeyboard(tester);
  await tester.tap(find.text('Create Budget'));
  await _pumpUntilGone(
    tester,
    find.text('Add Group Budget'),
    timeout: const Duration(seconds: 20),
    what: 'the budget sheet after saving',
  );
}

Future<void> _openNotifications(WidgetTester tester) async {
  await _openTab(
    tester,
    Icons.chat_bubble_outline,
    find.text('Describe an expense...'),
    name: 'Home',
  );
  await tester.tap(find.byIcon(Icons.notifications_outlined).first);
  await _pumpUntil(
    tester,
    find.text('Notifications'),
    what: 'the notifications screen',
  );
  await _pumpFor(tester, const Duration(seconds: 2));
}

Future<void> _openDashboard(WidgetTester tester) => _openTab(
  tester,
  Icons.bar_chart_outlined,
  find.byIcon(Icons.date_range),
  name: 'Dashboard',
);

/// Checks [finder] shows within a few seconds; if not, records [bugText],
/// runs [workaround] and waits again (failing if it still does not show).
Future<void> _expectSoonOrBug(
  WidgetTester tester,
  Finder finder,
  String bugText,
  Future<void> Function() workaround, {
  Duration timeout = const Duration(seconds: 8),
}) async {
  if (await _waitFor(tester, finder, timeout: timeout)) return;
  _bug(bugText);
  await workaround();
  await _pumpUntil(
    tester,
    finder,
    timeout: const Duration(seconds: 20),
    what: '$finder after the workaround',
  );
}

Future<void> _expectGoneSoonOrBug(
  WidgetTester tester,
  Finder finder,
  String bugText,
  Future<void> Function() workaround, {
  Duration timeout = const Duration(seconds: 8),
}) async {
  if (await _waitForGone(tester, finder, timeout: timeout)) return;
  _bug(bugText);
  await workaround();
  await _pumpUntilGone(
    tester,
    finder,
    timeout: const Duration(seconds: 20),
    what: '$finder after the workaround',
  );
}

// --------------------------------------------------------------------- test

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  final configured =
      EnvConfig.authEmulatorHost.isNotEmpty &&
      EnvConfig.apiBaseUrl.startsWith('http://127.0.0.1');

  testWidgets(
    'groups: create/edit, invitations, roles, expenses, budgets, '
    'remove/leave, delete/archive, notifications',
    (tester) async {
      // Use Flutter's test keyboard: the simulator's real keyboard sends
      // its own (empty) text back on unfocus and wipes what the test typed.
      tester.testTextInput.register();
      // ---- start-up, exactly like main() ----
      await Hive.initFlutter();
      final prefs = await Hive.openBox('app_preferences');
      await Hive.openBox('guest_expenses');
      await prefs.put('onboarding_complete', true);
      await prefs.put('guest_mode', false);
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

      // A second Firebase app, only for creating the other people and getting
      // their ID tokens, so the app's own sign-in is never disturbed.
      final helperApp = Firebase.apps.any((a) => a.name == 'e2e-helper')
          ? Firebase.app('e2e-helper')
          : await Firebase.initializeApp(
              name: 'e2e-helper',
              options: DefaultFirebaseOptions.currentPlatform,
            );
      final helperAuth = FirebaseAuth.instanceFor(app: helperApp);
      await helperAuth.useAuthEmulator(host[0], int.parse(host[1]));

      _http = Dio(
        BaseOptions(
          baseUrl: EnvConfig.apiBaseUrl,
          validateStatus: (_) => true,
          connectTimeout: const Duration(seconds: 20),
          receiveTimeout: const Duration(seconds: 60),
        ),
      );

      final stamp = DateTime.now().millisecondsSinceEpoch;
      _Person person(String key, String name) => _Person(
        key,
        name,
        'grp-${key.toLowerCase()}-$stamp@example.test',
        'local-e2e-$key-$stamp',
      );
      final a = person('A', 'Alice Owner');
      final b = person('B', 'Bravo Admin');
      final c = person('C', 'Charlie Member');
      final d = person('D', 'Delta Viewer');
      final e = person('E', 'Echo Decliner');
      final fEmail = 'grp-f-$stamp@example.test';
      for (final p in [a, b, c, d, e]) {
        final cred = await helperAuth.createUserWithEmailAndPassword(
          email: p.email,
          password: p.password,
        );
        await cred.user!.updateDisplayName(p.name);
        p.uid = cred.user!.uid;
        p.token = (await cred.user!.getIdToken(true))!;
      }
      await helperAuth.signOut();

      final cat1 = expenseCategories.first;
      final cat2 = expenseCategories[1];
      final groupName = 'Trip $stamp';
      final editedName = 'Ski Trip $stamp';

      // Personal expenses that must survive everything group-related.
      final bPersonal = await _call(
        b,
        'POST',
        '/api/expenses',
        data: {
          'userId': b.uid,
          'vendor': 'Bravo Personal Book',
          'amount': 15,
          'category': cat2,
          'date': _today(),
        },
      );
      expect(bPersonal.statusCode, 200, reason: '${bPersonal.data}');
      final dPersonal = await _call(
        d,
        'POST',
        '/api/expenses',
        data: {
          'userId': d.uid,
          'vendor': 'Delta Personal Lamp',
          'amount': 20,
          'category': cat2,
          'date': _today(),
        },
      );
      expect(dPersonal.statusCode, 200, reason: '${dPersonal.data}');

      // ================================================== session A1 (owner)
      await FirebaseAuth.instance.signInWithEmailAndPassword(
        email: a.email,
        password: a.password,
      );
      await tester.pumpWidget(const ProviderScope(child: PennyApp()));
      await _pumpUntil(
        tester,
        find.text('Describe an expense...'),
        what: 'the home screen',
      );
      final container = ProviderScope.containerOf(
        tester.element(find.byType(PennyApp)),
      );

      // ---- Flow 1: create a group through the UI ----
      _step('Flow 1: create group');
      await _openGroupsTab(tester);
      await _pumpUntil(tester, find.text('No groups yet'));
      await tester.tap(find.byTooltip('Create group'));
      await _pumpUntil(
        tester,
        find.widgetWithText(TextField, 'Group name'),
        what: 'the create-group sheet',
      );
      // Edge: an empty name does nothing (sheet stays, nothing created).
      await tester.tap(
        find.widgetWithText(ElevatedButton, 'Create Group').last,
      );
      await _pumpFor(tester, const Duration(seconds: 1));
      expect(find.widgetWithText(TextField, 'Group name'), findsOneWidget);
      expect(await _groupsOf(a), isEmpty);

      await tester.tap(find.text('🏠').last);
      await _pumpFor(tester, const Duration(milliseconds: 300));
      await tester.enterText(
        find.widgetWithText(TextField, 'Group name'),
        groupName,
      );
      await tester.enterText(
        find.widgetWithText(TextField, 'Description (optional)'),
        'Winter getaway',
      );
      await _hideKeyboard(tester);
      await tester.tap(
        find.widgetWithText(ElevatedButton, 'Create Group').last,
      );
      await _pumpUntilGone(
        tester,
        find.widgetWithText(TextField, 'Group name'),
        what: 'the create-group sheet after saving',
      );
      await _expectSoonOrBug(
        tester,
        find.text(groupName),
        'Flow 1: a group created in the "Create Group" sheet does not appear '
        'on the Groups screen (stays on "No groups yet") until the list '
        'provider is refreshed. groups_screen.dart _CreateGroupSheetState.'
        '_save never invalidates userGroupsProvider (a keep-alive, '
        'one-shot Stream.fromFuture), and the empty state has no '
        'pull-to-refresh.',
        // BUG: refresh the list the way a fix would.
        () async => container.invalidate(userGroupsProvider),
      );
      var groups = await _groupsOf(a);
      expect(groups, hasLength(1));
      final groupId = groups.single['id'] as String;
      expect(groups.single['name'], groupName);
      expect(groups.single['icon'], '🏠');
      expect(groups.single['description'], 'Winter getaway');
      expect(groups.single['myRole'], 'owner');
      _note(
        'Flow 1: the Create Group sheet has no colour picker; colour can '
        'only be set in Edit Group.',
      );

      // ---- Flow 1b: edit it through the UI ----
      _step('Flow 1b: edit group');
      await _openGroup(tester, groupName);
      await tester.tap(find.byTooltip('Edit group'));
      await _pumpUntil(tester, find.text('Save Changes'), what: 'edit sheet');
      // Edge: a one-letter name is refused by the server with a readable
      // message and nothing changes.
      await tester.enterText(find.byType(TextField).first, 'X');
      await _hideKeyboard(tester);
      await tester.tap(find.text('Save Changes'));
      final shortNameError = await _anySnack(tester);
      _step('one-letter name -> "$shortNameError"');
      expect(shortNameError, contains('Failed'));
      if (!_readable(shortNameError)) {
        _bug(
          'Flow 1b: saving a one-letter group name shows the raw exception '
          'instead of the server message "Name must be between 2 and 100 '
          'characters". Snackbar: "$shortNameError". '
          'group_detail_screen.dart _EditGroupSheetState._save uses '
          "'Failed to update: \$e' instead of apiErrorMessage(e); the sheet "
          'also has no client-side length check.',
        );
      }
      expect((await _groupOf(a, groupId))!['name'], groupName);
      await _clearSnacks(tester);

      await tester.enterText(find.byType(TextField).first, editedName);
      await tester.enterText(find.byType(TextField).at(1), 'Edited trip');
      await _hideKeyboard(tester);
      await tester.tap(_semantics('Group color: #34C759'));
      await _pumpFor(tester, const Duration(milliseconds: 300));
      await tester.tap(_semantics('Group icon: ✈️'));
      await _pumpFor(tester, const Duration(milliseconds: 300));
      await tester.ensureVisible(find.text('Save Changes'));
      await tester.tap(find.text('Save Changes'));
      await _waitSnack(tester, 'Group updated');
      await _pumpUntil(
        tester,
        find.text(editedName),
        what: 'the new name on the group screen',
      );
      final edited = (await _groupOf(a, groupId))!;
      expect(edited['name'], editedName);
      expect(edited['color'], '#34C759');
      expect(edited['icon'], '✈️');
      expect(edited['description'], 'Edited trip');

      // ---- Flow 2: invitations through the UI ----
      _step('Flow 2: invitations');
      for (final p in [b, c, d, e]) {
        final text = await _inviteViaUi(tester, p.email);
        expect(text, contains('Invitation sent to ${p.email}'));
      }
      // Edge: inviting the same email again.
      final dupText = await _inviteViaUi(tester, c.email);
      _step('duplicate invite of C -> "$dupText"');
      final cInvites = (await _invitationsOf(
        c,
      )).where((i) => i['groupId'] == groupId).toList();
      if (cInvites.length > 1 || dupText.contains('Invitation sent')) {
        _bug(
          'Flow 2: inviting an email that already has a pending invitation '
          'succeeds and creates a second pending invitation '
          '(${cInvites.length} pending for C; snackbar "$dupText"). API '
          'apps/api/src/services/firestore-groups.ts inviteMember (~l.461) '
          'only checks groupMembers for an existing member/invite, but '
          'pending invitations live in groupInvitations; the app-side check '
          'in _InviteMemberSheetState._sendInvite only looks at members too.',
        );
      }
      // Edge: an address without "@" is not sent.
      if (find.text('Send Invite').evaluate().isNotEmpty) {
        await _closeSheet(tester, find.text('Send Invite'));
      }
      // Let the previous sheet finish closing before tapping again.
      await _pumpFor(tester, const Duration(seconds: 1));
      await tester.tap(find.byTooltip('Invite member'));
      await _pumpUntil(tester, find.text('Send Invite'));
      await tester.enterText(
        find.widgetWithText(TextField, 'Email address'),
        'not-an-email',
      );
      await _hideKeyboard(tester);
      await tester.tap(find.text('Send Invite'));
      await _pumpFor(tester, const Duration(seconds: 1));
      expect(find.text('Send Invite'), findsOneWidget);
      await _closeSheet(tester, find.text('Send Invite'));
      for (final p in [b, d, e]) {
        final invites = (await _invitationsOf(
          p,
        )).where((i) => i['groupId'] == groupId).toList();
        expect(invites, hasLength(1), reason: 'pending invite for ${p.key}');
        expect(invites.single['role'], 'member');
        expect(invites.single['groupName'], editedName);
      }

      // ---- Flow 4a: owner adds a group expense through the UI ----
      _step('Flow 4a: owner group expense');
      await _clearSnacks(tester);
      await tester.tap(find.byTooltip('Add group expense'));
      await _pumpUntil(tester, find.text('Add Expense'));
      // Edge: an amount that is not a number is refused on the device.
      await tester.enterText(
        find.widgetWithText(TextField, 'Vendor / merchant'),
        'Owner Supplies',
      );
      await tester.enterText(find.widgetWithText(TextField, 'Amount'), 'abc');
      await _hideKeyboard(tester);
      await tester.tap(find.text('Add Expense'));
      await _pumpUntil(tester, find.text('Enter a valid amount'));
      await tester.enterText(find.byType(TextField).at(1), '40');
      await _hideKeyboard(tester);
      await tester.tap(find.text('Add Expense'));
      await _waitSnack(tester, 'Expense added');
      await _scrollTo(tester, find.text('Owner Supplies'));
      final afterOwner = await _groupExpenses(a, groupId);
      expect(afterOwner.map((x) => x['vendor']), ['Owner Supplies']);
      expect(afterOwner.single['amount'], 40);
      expect(afterOwner.single['userId'], a.uid);
      await _back(tester);

      // C and D accept through the API (their own tokens).
      for (final p in [c, d]) {
        final invite = (await _invitationsOf(
          p,
        )).firstWhere((i) => i['groupId'] == groupId);
        final r = await _call(
          p,
          'POST',
          '/api/groups/invitations/accept',
          data: {
            'invitationId': invite['id'],
            'userId': p.uid,
            'userEmail': p.email,
            'userName': p.name,
          },
        );
        expect(r.statusCode, 200, reason: 'accept as ${p.key}: ${r.data}');
      }

      // ================================================= session E (decline)
      await _switchTo(tester, e);
      _step('Flow 2: E declines');
      await _openTab(
        tester,
        Icons.group_outlined,
        find.text('Decline'),
        name: 'Groups (pending invitation)',
      );
      expect(find.text(editedName), findsWidgets);
      expect(
        find.textContaining('Alice Owner invited you to join as Member'),
        findsOneWidget,
      );
      await tester.tap(find.text('Decline'));
      await _waitSnack(tester, 'Invitation declined');
      await _pumpUntilGone(tester, find.text('Decline'));
      expect(find.text(editedName), findsNothing);
      expect(await _invitationsOf(e), isEmpty);
      expect(await _groupsOf(e), isEmpty);
      final eGroup = await _call(e, 'GET', '/api/groups/$groupId');
      expect(
        eGroup.statusCode,
        anyOf(403, 404),
        reason: 'decliner must not read the group: ${eGroup.data}',
      );
      // Edge: the owner can invite again after a decline.
      final reInvite = await _call(
        a,
        'POST',
        '/api/groups/$groupId/members',
        data: {'email': e.email, 'role': 'viewer', 'userId': a.uid},
      );
      expect(reInvite.statusCode, 200, reason: 're-invite: ${reInvite.data}');
      expect(
        (await _invitationsOf(e)).where((i) => i['groupId'] == groupId),
        hasLength(1),
      );

      // ============================================== session B1 (accepts)
      await _switchTo(tester, b);
      _step('Flow 2: B accepts');
      await _openTab(
        tester,
        Icons.group_outlined,
        find.text('Accept'),
        name: 'Groups (pending invitation)',
      );
      await tester.tap(find.text('Accept'));
      await _waitSnack(tester, 'You joined');
      await _pumpUntilGone(tester, find.text('Accept'));
      await _pumpUntilGone(tester, find.textContaining('You joined'));
      await _pumpUntil(tester, find.text(editedName));
      final bGroup = (await _groupOf(b, groupId))!;
      expect(bGroup['myRole'], 'member');
      await _openGroup(tester, editedName);
      // As a member: no invite / edit, but can add expenses.
      expect(find.byTooltip('Invite member'), findsNothing);
      expect(find.byTooltip('Edit group'), findsNothing);
      expect(find.byTooltip('Add group expense'), findsOneWidget);
      _step('Flow 4: B adds a group expense');
      expect(
        await _addGroupExpenseViaUi(tester, 'Bravo Lunch', '25'),
        contains('Expense added'),
      );
      final bLunch = (await _groupExpenses(
        b,
        groupId,
      )).firstWhere((x) => x['vendor'] == 'Bravo Lunch');
      expect(bLunch['amount'], 25);
      expect(bLunch['userId'], b.uid);
      final bLunchId = bLunch['id'] as String;

      // ================================================== session A2 (owner)
      await _switchTo(tester, a);
      await _openGroup(tester, editedName);
      _step('Flow 4: totals + member list');
      for (final p in [a, b, c, d]) {
        expect(find.text(p.name), findsWidgets, reason: '${p.key} listed');
      }
      expect(find.text(e.name), findsNothing);
      expect(find.text('\$65'), findsWidgets, reason: 'total on stats row');
      expect(find.text('4'), findsWidgets, reason: 'member count');
      final stats = _map((await _groupOf(a, groupId))!['stats']);
      expect(stats['memberCount'], 4);
      expect(stats['expenseCount'], 2);
      expect(stats['totalAmount'], 65);

      _step('Flow 3: owner changes roles through the UI');
      // Edge: the owner's own row offers no management.
      await _longPressMember(tester, a.name);
      expect(find.text('Manage ${a.name}'), findsNothing);
      expect(
        await _changeRoleViaUi(tester, b.name, 'Admin'),
        contains('${b.name} is now Admin'),
      );
      expect(
        await _changeRoleViaUi(tester, d.name, 'Viewer'),
        contains('${d.name} is now Viewer'),
      );
      final roles = {
        for (final m in await _membersOf(a, groupId)) m['userId']: m['role'],
      };
      expect(roles[b.uid], 'admin');
      expect(roles[d.uid], 'viewer');
      expect(roles[c.uid], 'member');
      await _pumpUntil(tester, find.text('Admin'), what: 'the Admin chip');
      await _pumpUntil(tester, find.text('Viewer'), what: 'the Viewer chip');

      _step('Flow 4: owner and another member\'s expense');
      await _scrollTo(tester, find.text('Bravo Lunch'));
      await tester.tap(find.text('Bravo Lunch').first);
      await _pumpFor(tester, const Duration(seconds: 2));
      if (find.byTooltip('Edit expense').evaluate().isEmpty &&
          find.byTooltip('Delete expense').evaluate().isEmpty) {
        _bug(
          'Flow 4: the owner cannot edit or delete another member\'s group '
          'expense anywhere in the app. Group expense rows on the group '
          'screen are not tappable (group_detail_screen.dart ~l.254 '
          'builds ExpenseListTile(expense: e) without onTap), and the '
          'dashboard/search only list the user\'s own expenses '
          '(GET /api/expenses?scope=all filters userId). The server allows '
          'it (canEditAllExpenses / canDeleteExpenses).',
        );
      } else {
        await _back(tester);
      }
      // The server allows it for the owner.
      final ownerEdit = await _call(
        a,
        'PATCH',
        '/api/expenses/$bLunchId',
        data: {'userId': a.uid, 'description': 'checked by owner'},
      );
      expect(ownerEdit.statusCode, 200, reason: '${ownerEdit.data}');

      _step('Flow 5: owner creates a group budget through the UI');
      await _createBudgetViaUi(tester, cat1, '100');
      final budgets1 = await _groupBudgets(a, groupId);
      expect(budgets1, hasLength(1));
      expect(budgets1.single['category'], cat1);
      expect(budgets1.single['monthlyLimit'], 100);
      await _expectSoonOrBug(
        tester,
        find.text('\$65 / \$100'),
        'Flow 5: the new group budget does not show on the group screen',
        () async => _pullToRefresh(tester),
      );

      _step('Flow 4: activity feed');
      await _scrollTo(tester, find.text('RECENT ACTIVITY'));
      await _scrollTo(tester, find.textContaining('role from member to admin'));
      await _scrollTo(tester, find.text('Added expense at Bravo Lunch'));
      final actions = (await _activitiesOf(
        a,
        groupId,
      )).map((x) => x['action']).toSet();
      expect(
        actions,
        containsAll([
          'group_created',
          'group_updated',
          'member_invited',
          'member_joined',
          'expense_added',
          'member_role_changed',
        ]),
      );

      // ================================================== session B2 (admin)
      await _switchTo(tester, b);
      await _openGroup(tester, editedName);
      _step('Flow 3: admin');
      expect(find.byTooltip('Invite member'), findsOneWidget);
      expect(find.byTooltip('Add group expense'), findsOneWidget);
      await _openOverflow(tester);
      expect(find.text('Delete Group'), findsNothing);
      expect(find.text('Leave Group'), findsOneWidget);
      await tester.tapAt(const Offset(20, 400));
      await _pumpFor(tester, const Duration(milliseconds: 800));

      // Admin can invite, with a chosen role.
      expect(
        await _inviteViaUi(tester, fEmail, role: 'viewer'),
        contains('Invitation sent to $fEmail'),
      );
      // Admin cannot manage settings. The app shows "Edit group" to admins;
      // try a plain rename through it.
      final editVisible = find.byTooltip('Edit group').evaluate().isNotEmpty;
      if (editVisible) {
        await tester.tap(find.byTooltip('Edit group'));
        await _pumpUntil(tester, find.text('Save Changes'));
        await tester.enterText(
          find.byType(TextField).first,
          'Admin Renamed $stamp',
        );
        await _hideKeyboard(tester);
        await tester.tap(find.text('Save Changes'));
        final adminEdit = await _anySnack(tester);
        _step('admin edit -> "$adminEdit"');
        final nameNow = (await _groupOf(b, groupId))!['name'];
        if (adminEdit.contains('Failed')) {
          _bug(
            'Flow 3: an admin can open "Edit group" but every save fails, '
            'even a plain rename the server allows for admins: the sheet '
            'always sends `settings`, and the API answers 403 "No '
            'permission to update group settings". Snackbar: "$adminEdit". '
            'group_detail_screen.dart _EditGroupSheetState._save (~l.733) '
            'always includes settings; the sheet shows the settings '
            'switches to admins (only the owner has canManageSettings).',
          );
          if (!_readable(adminEdit)) {
            _bug(
              'Flow 3: the admin edit failure shows raw exception text '
              '("$adminEdit") instead of the server message; use '
              'apiErrorMessage(e) in _EditGroupSheetState._save.',
            );
          }
          expect(nameNow, editedName, reason: 'nothing saved');
          await _closeSheet(tester, find.text('Save Changes'));
        } else {
          _note('Admin rename through Edit group saved: "$adminEdit"');
          expect(nameNow, 'Admin Renamed $stamp');
        }
      }
      // What the server allows an admin: a rename yes, settings no.
      final adminSettings = await _call(
        b,
        'PATCH',
        '/api/groups/$groupId',
        data: {
          'userId': b.uid,
          'settings': {'requireApproval': true},
        },
      );
      expect(adminSettings.statusCode, 403, reason: '${adminSettings.data}');
      final adminRename = await _call(
        b,
        'PATCH',
        '/api/groups/$groupId',
        data: {'userId': b.uid, 'name': editedName},
      );
      expect(adminRename.statusCode, 200, reason: '${adminRename.data}');

      _step('Flow 5: admin creates a second budget through the UI');
      await _createBudgetViaUi(tester, cat2, '50');
      final budgets2 = await _groupBudgets(b, groupId);
      expect(budgets2.map((x) => x['category']).toSet(), {cat1, cat2});

      // ================================================= session C (member)
      await _switchTo(tester, c);
      await _openGroup(tester, editedName);
      _step('Flow 3: member');
      expect(find.byTooltip('Invite member'), findsNothing);
      expect(find.byTooltip('Edit group'), findsNothing);
      expect(find.byTooltip('Add group expense'), findsOneWidget);
      // Long-press on another member offers nothing to a member.
      await _longPressMember(tester, b.name);
      expect(find.textContaining('Manage '), findsNothing);
      // Forbidden for a member on the server.
      final memberInvite = await _call(
        c,
        'POST',
        '/api/groups/$groupId/members',
        data: {'email': 'nobody-$stamp@example.test', 'role': 'member'},
      );
      expect(memberInvite.statusCode, 403, reason: '${memberInvite.data}');

      _step('Flow 5: member sees budget usage');
      await _scrollTo(tester, find.text('BUDGETS'));
      expect(find.text('Add'), findsNothing, reason: 'no budget Add button');
      await _scrollTo(tester, find.text('\$65 / \$100'));
      expect(find.text('65% used'), findsOneWidget);
      expect(find.text('\$0 / \$50'), findsOneWidget);
      final memberBudget = await _call(
        c,
        'POST',
        '/api/budgets/group',
        data: {
          'groupId': groupId,
          'userId': c.uid,
          'category': expenseCategories[2],
          'monthlyLimit': 10,
          'period': {
            'month': DateTime.now().month,
            'year': DateTime.now().year,
          },
        },
      );
      expect(memberBudget.statusCode, 403, reason: '${memberBudget.data}');

      _step('Flow 4: member adds an expense');
      await _scrollTop(tester);
      expect(
        await _addGroupExpenseViaUi(tester, 'Charlie Coffee', '10'),
        contains('Expense added'),
      );
      await _scrollTo(tester, find.text('\$75 / \$100'));
      // Another member's expense: no way to edit it in the UI, and the
      // server refuses.
      await _scrollTo(tester, find.text('Bravo Lunch'));
      await tester.tap(find.text('Bravo Lunch').first);
      await _pumpFor(tester, const Duration(seconds: 1));
      expect(find.byTooltip('Edit expense'), findsNothing);
      final memberEdit = await _call(
        c,
        'PATCH',
        '/api/expenses/$bLunchId',
        data: {'userId': c.uid, 'amount': 1},
      );
      expect(memberEdit.statusCode, 403, reason: '${memberEdit.data}');
      final memberDelete = await _call(c, 'DELETE', '/api/expenses/$bLunchId');
      expect(memberDelete.statusCode, 403, reason: '${memberDelete.data}');
      await _back(tester);

      _step('Flow 4: member edits own group expense from the dashboard');
      await _openDashboard(tester);
      await _pumpFor(tester, const Duration(seconds: 1));
      await tester.scrollUntilVisible(
        find.text('Charlie Coffee'),
        300,
        scrollable: find.byType(Scrollable).first,
        maxScrolls: 30,
      );
      expect(find.text('Bravo Lunch'), findsNothing);
      await tester.tap(find.text('Charlie Coffee').first);
      await _pumpUntil(tester, find.byTooltip('Edit expense'));
      expect(find.byTooltip('Delete expense'), findsOneWidget);
      await tester.tap(find.byTooltip('Edit expense'));
      await _pumpUntil(tester, find.text('Save Changes'));
      await tester.enterText(find.byType(TextField).at(1), '12');
      await _hideKeyboard(tester);
      await tester.tap(find.text('Save Changes'));
      await _pumpUntilGone(tester, find.text('Save Changes'));
      await _pumpUntilGone(
        tester,
        find.byTooltip('Edit expense'),
        what: 'the detail screen after saving',
      );
      final coffee = (await _groupExpenses(
        c,
        groupId,
      )).firstWhere((x) => x['vendor'] == 'Charlie Coffee');
      expect(coffee['amount'], 12);
      expect(coffee['userId'], c.uid);
      final stats2 = _map((await _groupOf(c, groupId))!['stats']);
      expect(stats2['expenseCount'], 3);
      expect(stats2['totalAmount'], 77);
      await tester.drag(
        find.byType(Scrollable).first,
        const Offset(0, 5000),
        warnIfMissed: false,
      );
      await _pumpFor(tester, const Duration(seconds: 1));

      _step('Flow 8: member sees group activity in notifications');
      final cNotes = await _notificationsOf(c);
      expect(
        cNotes.where(
          (n) =>
              n['type'] == 'group_expense_added' &&
              '${n['body']}'.contains('Bravo Lunch'),
        ),
        isNotEmpty,
        reason: 'server notification for B\'s expense: $cNotes',
      );
      await _openNotifications(tester);
      await _scrollTo(tester, find.textContaining('at Bravo Lunch'));
      expect(find.text('New expense added'), findsWidgets);
      await _back(tester);

      _step('Flow 6: member leaves the group through the UI');
      await _openGroup(tester, editedName);
      await _clearSnacks(tester);
      await _openOverflow(tester);
      await tester.tap(find.text('Leave Group'));
      await _pumpUntil(tester, find.text('Leave Group?'));
      await tester.tap(find.text('Leave'));
      await _waitSnack(tester, 'Left $editedName');
      await _pumpUntil(tester, find.byTooltip('Create group'));
      expect(await _groupOf(c, groupId), isNull);
      final cRead = await _call(c, 'GET', '/api/groups/$groupId');
      expect(cRead.statusCode, anyOf(403, 404), reason: '${cRead.data}');
      await _expectGoneSoonOrBug(
        tester,
        find.text(editedName),
        'Flow 6: after "Leave Group" the group stays on the Groups screen '
        '(and can still be opened) until a manual refresh. '
        'group_detail_screen.dart _confirmLeaveGroup (~l.405) never '
        'invalidates userGroupsProvider after leaveGroup.',
        // BUG: refresh the list the way a fix would.
        () async => container.invalidate(userGroupsProvider),
      );
      // Edge: the expense the member added stays in the group.
      expect(
        (await _groupExpenses(a, groupId)).map((x) => x['vendor']),
        contains('Charlie Coffee'),
      );

      // ================================================= session D (viewer)
      await _switchTo(tester, d);
      await _openGroup(tester, editedName);
      _step('Flow 3: viewer');
      expect(find.byTooltip('Add group expense'), findsNothing);
      expect(find.byTooltip('Invite member'), findsNothing);
      expect(find.byTooltip('Edit group'), findsNothing);
      expect(find.text('Add first expense'), findsNothing);
      await _scrollTo(tester, find.text('Bravo Lunch'));
      final viewerAdd = await _call(
        d,
        'POST',
        '/api/expenses',
        data: {
          'userId': d.uid,
          'vendor': 'Viewer Sneak',
          'amount': 1,
          'category': cat1,
          'date': _today(),
          'groupId': groupId,
          'expenseType': 'group',
        },
      );
      expect(viewerAdd.statusCode, 403, reason: '${viewerAdd.data}');
      final groupForViewer = (await _groupOf(d, groupId))!;
      expect(_map(groupForViewer['myPermissions'])['canAddExpenses'], false);
      await _back(tester);

      // Second group for the archive check: A owner, B member (API only).
      final g2 = await _call(
        a,
        'POST',
        '/api/groups',
        data: {
          'name': 'Archive Me $stamp',
          'userId': a.uid,
          'userName': a.name,
        },
      );
      expect(g2.statusCode, 200, reason: '${g2.data}');
      final group2Id = _map(g2.data)['groupId'] as String;
      await _call(
        a,
        'POST',
        '/api/groups/$group2Id/members',
        data: {'email': b.email, 'role': 'member', 'userId': a.uid},
      );
      final b2Invite = (await _invitationsOf(
        b,
      )).firstWhere((i) => i['groupId'] == group2Id);
      final b2Accept = await _call(
        b,
        'POST',
        '/api/groups/invitations/accept',
        data: {
          'invitationId': b2Invite['id'],
          'userId': b.uid,
          'userEmail': b.email,
          'userName': b.name,
        },
      );
      expect(b2Accept.statusCode, 200, reason: '${b2Accept.data}');

      // ================================================== session A3 (owner)
      await _switchTo(tester, a);
      await _openGroup(tester, editedName);
      _step('Flow 6: owner removes the viewer through the UI');
      expect(find.text(c.name), findsNothing, reason: 'C left');
      await _clearSnacks(tester);
      await _longPressMember(tester, d.name);
      await _pumpUntil(tester, find.text('Remove from Group'));
      await tester.tap(find.text('Remove from Group'));
      await _pumpUntil(tester, find.text('Remove ${d.name}?'));
      await tester.tap(find.text('Remove'));
      await _waitSnack(tester, 'has been removed');
      await _pumpUntilGone(
        tester,
        find.text(d.name),
        timeout: const Duration(seconds: 15),
        what: 'the removed member in the list',
      );
      expect(await _groupOf(d, groupId), isNull);
      final dRead = await _call(d, 'GET', '/api/groups/$groupId');
      expect(dRead.statusCode, anyOf(403, 404), reason: '${dRead.data}');
      final memberIds = (await _membersOf(a, groupId)).map((m) => m['userId']);
      expect(memberIds, isNot(contains(d.uid)));
      expect(memberIds, isNot(contains(c.uid)));
      final stats3 = _map((await _groupOf(a, groupId))!['stats']);
      expect(stats3['memberCount'], 2, reason: 'A and B are left: $stats3');
      await _scrollTo(tester, find.textContaining('left the group'));
      await _scrollTo(tester, find.textContaining('Removed ${d.email}'));

      _step('Flow 7: owner deletes the group through the UI');
      await _scrollTop(tester);
      await _openOverflow(tester);
      expect(find.text('Leave Group'), findsNothing);
      await tester.tap(find.text('Delete Group'));
      await _pumpUntil(tester, find.text('Delete Group?'));
      // Edge: Cancel keeps it.
      await tester.tap(find.text('Cancel'));
      await _pumpFor(tester, const Duration(milliseconds: 800));
      expect(await _groupOf(a, groupId), isNotNull);
      await _openOverflow(tester);
      await tester.tap(find.text('Delete Group'));
      await _pumpUntil(tester, find.text('Delete Group?'));
      await tester.tap(find.text('Delete'));
      await _waitSnack(tester, 'Deleted $editedName');
      await _pumpUntil(tester, find.byTooltip('Create group'));
      expect(await _groupOf(a, groupId), isNull);
      expect(await _groupOf(b, groupId), isNull);
      await _expectGoneSoonOrBug(
        tester,
        find.text(editedName),
        'Flow 7: after "Delete Group" the deleted group stays on the '
        'owner\'s Groups screen until a manual refresh. '
        'group_detail_screen.dart _confirmDeleteGroup (~l.495) never '
        'invalidates userGroupsProvider after deleteGroup.',
        // BUG: refresh the list the way a fix would.
        () async => container.invalidate(userGroupsProvider),
      );

      _step('Flow 7: archive (API only, no archive control in the app)');
      final archive = await _call(a, 'POST', '/api/groups/$group2Id/archive');
      expect(archive.statusCode, 200, reason: '${archive.data}');
      final archivedForB = await _groupOf(b, group2Id);
      final archivedExpense = await _call(
        b,
        'POST',
        '/api/expenses',
        data: {
          'userId': b.uid,
          'vendor': 'Into Archived',
          'amount': 3,
          'category': cat1,
          'date': _today(),
          'groupId': group2Id,
          'expenseType': 'group',
        },
      );
      _step(
        'archived group for B: status=${archivedForB?['status']}, '
        'add expense -> ${archivedExpense.statusCode}',
      );
      if (archivedExpense.statusCode == 200) {
        _bug(
          'Flow 7: a member can still add expenses to an archived group '
          '(POST /api/expenses with the archived groupId -> 200, group stats '
          'grow). apps/api/src/services/firestore-expenses.ts createExpense '
          '(~l.115) checks membership but not the group status.',
        );
      }

      // ================================================ session D2 (removed)
      await _switchTo(tester, d);
      _step('Flow 6/7/8: removed viewer');
      await _openGroupsTab(tester);
      await _pumpUntil(tester, find.text('No groups yet'));
      expect(find.text(editedName), findsNothing);
      final dNotes = await _notificationsOf(d);
      expect(
        dNotes.map((n) => n['title']),
        contains('Removed from group'),
        reason: '$dNotes',
      );
      await _openNotifications(tester);
      await _scrollTo(tester, find.text('Removed from group'));
      await _back(tester);
      final dOwn = await _ownExpenses(d);
      final lamp = dOwn.firstWhere((x) => x['vendor'] == 'Delta Personal Lamp');
      expect(lamp['amount'], 20);
      expect(lamp['expenseType'], 'personal');
      await _openDashboard(tester);
      await _pumpFor(tester, const Duration(seconds: 1));
      await tester.scrollUntilVisible(
        find.text('Delta Personal Lamp'),
        300,
        scrollable: find.byType(Scrollable).first,
        maxScrolls: 30,
      );
      await tester.drag(
        find.byType(Scrollable).first,
        const Offset(0, 5000),
        warnIfMissed: false,
      );
      await _pumpFor(tester, const Duration(seconds: 1));

      // ================================================= session B3 (admin)
      await _switchTo(tester, b);
      _step('Flow 7/8: admin after delete + archive');
      await _openGroupsTab(tester);
      await _pumpFor(tester, const Duration(seconds: 2));
      expect(find.text(editedName), findsNothing);
      final archivedShown = find
          .text('Archive Me $stamp')
          .evaluate()
          .isNotEmpty;
      _note(
        'Archived group: API lists it for members with status '
        '"${archivedForB?['status']}"; the Groups screen '
        '${archivedShown ? 'shows it like an active group (no archived '
                  'label, FAB still offered)' : 'does not show it'}.',
      );
      final bNotes = await _notificationsOf(b);
      expect(
        bNotes.map((n) => n['title']),
        containsAll(['Group deleted', 'Member role updated']),
        reason: '$bNotes',
      );
      await _openNotifications(tester);
      await _scrollTo(tester, find.text('Group deleted'));
      await _back(tester);
      final bOwn = await _ownExpenses(b);
      final book = bOwn.firstWhere((x) => x['vendor'] == 'Bravo Personal Book');
      expect(book['amount'], 15);
      expect(book['expenseType'], 'personal');
      final lunchAfter = bOwn.firstWhere((x) => x['vendor'] == 'Bravo Lunch');
      _note(
        'After the group was deleted, B\'s group expense "Bravo Lunch" is '
        'now expenseType=${lunchAfter['expenseType']}, '
        'groupId=${lunchAfter['groupId']} (the API turns group expenses '
        'into their author\'s personal expenses).',
      );
      await _openDashboard(tester);
      await _pumpFor(tester, const Duration(seconds: 1));
      await tester.scrollUntilVisible(
        find.text('Bravo Personal Book'),
        300,
        scrollable: find.byType(Scrollable).first,
        maxScrolls: 30,
      );
      await tester.drag(
        find.byType(Scrollable).first,
        const Offset(0, 5000),
        warnIfMissed: false,
      );
      await _pumpFor(tester, const Duration(seconds: 1));

      expect(tester.takeException(), isNull);
      debugPrint('[E2E] ===== summary =====');
      for (final bug in _bugs) {
        debugPrint('[E2E-BUG-SUMMARY] $bug');
      }
      for (final n in _notes) {
        debugPrint('[E2E-NOTE-SUMMARY] $n');
      }
      debugPrint('[E2E] ${_bugs.length} bug(s) recorded');
    },
    skip: !configured,
    timeout: const Timeout(Duration(minutes: 25)),
  );
}
