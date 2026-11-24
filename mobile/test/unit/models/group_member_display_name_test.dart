import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/data/models/api_timestamp.dart';
import 'package:penny_mobile/data/models/group_member_model.dart';

GroupMemberModel _member({String? userName, String userEmail = ''}) =>
    GroupMemberModel(
      id: 'g_u',
      groupId: 'g',
      userId: 'u',
      userEmail: userEmail,
      role: 'member',
      status: 'active',
      permissions: const GroupPermissions(),
      invitedAt: Timestamp.now(),
      invitedBy: 'o',
      userName: userName,
    );

void main() {
  group('a member who joined without a name', () {
    test('is shown by email when the name is empty', () {
      final m = _member(userName: '', userEmail: 'sam@example.test');
      expect(m.displayName, 'sam@example.test');
      expect(m.initial, 'S');
    });

    test('is shown by email when the name is only spaces', () {
      final m = _member(userName: '   ', userEmail: 'sam@example.test');
      expect(m.displayName, 'sam@example.test');
    });

    test('still has a label and an initial with no name and no email', () {
      final m = _member(userName: '');
      expect(m.displayName, 'Member');
      expect(m.initial, '?');
    });

    test('uses the name when there is one', () {
      final m = _member(userName: ' bob ', userEmail: 'b@example.test');
      expect(m.displayName, 'bob');
      expect(m.initial, 'B');
    });
  });
}
