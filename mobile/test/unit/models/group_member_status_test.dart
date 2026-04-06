import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/data/models/group_member_model.dart';

void main() {
  group('GroupMemberModel — status field', () {
    late FakeFirebaseFirestore firestore;
    final now = Timestamp.now();

    setUp(() {
      firestore = FakeFirebaseFirestore();
    });

    Map<String, dynamic> _baseData(String status) => {
          'groupId': 'group-1',
          'userId': 'user-1',
          'userEmail': 'test@penny.app',
          'role': 'member',
          'status': status,
          'permissions': {},
          'invitedAt': now,
          'invitedBy': 'owner-1',
        };

    test('parses active status', () async {
      final doc =
          await firestore.collection('groupMembers').add(_baseData('active'));
      final model = GroupMemberModel.fromFirestore(await doc.get());

      expect(model.status, 'active');
    });

    test('parses invited status', () async {
      final doc = await firestore
          .collection('groupMembers')
          .add(_baseData('invited'));
      final model = GroupMemberModel.fromFirestore(await doc.get());

      expect(model.status, 'invited');
    });

    test('parses left status', () async {
      final doc =
          await firestore.collection('groupMembers').add(_baseData('left'));
      final model = GroupMemberModel.fromFirestore(await doc.get());

      expect(model.status, 'left');
    });

    test('parses removed status', () async {
      final doc = await firestore
          .collection('groupMembers')
          .add(_baseData('removed'));
      final model = GroupMemberModel.fromFirestore(await doc.get());

      expect(model.status, 'removed');
    });

    test('defaults to active when status field is null', () async {
      final data = _baseData('active');
      data.remove('status'); // Remove status field
      final doc = await firestore.collection('groupMembers').add(data);
      final model = GroupMemberModel.fromFirestore(await doc.get());

      expect(model.status, 'active');
    });
  });

  group('GroupMemberModel — optional fields', () {
    late FakeFirebaseFirestore firestore;

    setUp(() {
      firestore = FakeFirebaseFirestore();
    });

    test('parses userName when present', () async {
      final now = Timestamp.now();
      final doc = await firestore.collection('groupMembers').add({
        'groupId': 'g-1',
        'userId': 'u-1',
        'userEmail': 'alice@penny.app',
        'userName': 'Alice',
        'role': 'admin',
        'status': 'active',
        'permissions': {'canAddExpenses': true},
        'invitedAt': now,
        'invitedBy': 'owner-1',
        'joinedAt': now,
        'lastActivityAt': now,
      });

      final model = GroupMemberModel.fromFirestore(await doc.get());

      expect(model.userName, 'Alice');
      expect(model.joinedAt, isNotNull);
      expect(model.lastActivityAt, isNotNull);
    });

    test('handles missing optional fields', () async {
      final now = Timestamp.now();
      final doc = await firestore.collection('groupMembers').add({
        'groupId': 'g-1',
        'userId': 'u-1',
        'userEmail': 'bob@penny.app',
        'role': 'member',
        'status': 'invited',
        'permissions': {},
        'invitedAt': now,
        'invitedBy': 'owner-1',
      });

      final model = GroupMemberModel.fromFirestore(await doc.get());

      expect(model.userName, isNull);
      expect(model.joinedAt, isNull);
      expect(model.lastActivityAt, isNull);
    });
  });

  group('GroupPermissions.fromMap', () {
    test('parses all permission fields', () {
      final perms = GroupPermissions.fromMap({
        'canAddExpenses': true,
        'canEditOwnExpenses': true,
        'canEditAllExpenses': false,
        'canDeleteExpenses': false,
        'canApproveExpenses': true,
        'canInviteMembers': true,
        'canRemoveMembers': false,
        'canViewReports': true,
        'canExportData': false,
        'canManageSettings': false,
      });

      expect(perms.canAddExpenses, true);
      expect(perms.canEditOwnExpenses, true);
      expect(perms.canEditAllExpenses, false);
      expect(perms.canDeleteExpenses, false);
      expect(perms.canApproveExpenses, true);
      expect(perms.canInviteMembers, true);
      expect(perms.canRemoveMembers, false);
      expect(perms.canViewReports, true);
      expect(perms.canExportData, false);
      expect(perms.canManageSettings, false);
    });

    test('defaults all permissions to false when map is empty', () {
      final perms = GroupPermissions.fromMap({});

      expect(perms.canAddExpenses, false);
      expect(perms.canEditOwnExpenses, false);
      expect(perms.canEditAllExpenses, false);
      expect(perms.canDeleteExpenses, false);
      expect(perms.canApproveExpenses, false);
      expect(perms.canInviteMembers, false);
      expect(perms.canRemoveMembers, false);
      expect(perms.canViewReports, false);
      expect(perms.canExportData, false);
      expect(perms.canManageSettings, false);
    });

    test('handles partial permissions map', () {
      final perms = GroupPermissions.fromMap({
        'canViewReports': true,
        'canAddExpenses': true,
      });

      expect(perms.canViewReports, true);
      expect(perms.canAddExpenses, true);
      expect(perms.canDeleteExpenses, false); // not in map, defaults false
      expect(perms.canManageSettings, false);
    });
  });

  group('GroupPermissions.forRole', () {
    test('owner has all permissions', () {
      final perms = GroupPermissions.forRole('owner');

      expect(perms.canAddExpenses, true);
      expect(perms.canEditOwnExpenses, true);
      expect(perms.canEditAllExpenses, true);
      expect(perms.canDeleteExpenses, true);
      expect(perms.canApproveExpenses, true);
      expect(perms.canInviteMembers, true);
      expect(perms.canRemoveMembers, true);
      expect(perms.canViewReports, true);
      expect(perms.canExportData, true);
      expect(perms.canManageSettings, true);
    });

    test('admin has all except manageSettings', () {
      final perms = GroupPermissions.forRole('admin');

      expect(perms.canAddExpenses, true);
      expect(perms.canEditOwnExpenses, true);
      expect(perms.canEditAllExpenses, true);
      expect(perms.canDeleteExpenses, true);
      expect(perms.canApproveExpenses, true);
      expect(perms.canInviteMembers, true);
      expect(perms.canRemoveMembers, true);
      expect(perms.canViewReports, true);
      expect(perms.canExportData, true);
      expect(perms.canManageSettings, false);
    });

    test('member has limited permissions', () {
      final perms = GroupPermissions.forRole('member');

      expect(perms.canAddExpenses, true);
      expect(perms.canEditOwnExpenses, true);
      expect(perms.canEditAllExpenses, false);
      expect(perms.canDeleteExpenses, false);
      expect(perms.canApproveExpenses, false);
      expect(perms.canInviteMembers, false);
      expect(perms.canRemoveMembers, false);
      expect(perms.canViewReports, true);
      expect(perms.canExportData, false);
      expect(perms.canManageSettings, false);
    });

    test('viewer can only view reports', () {
      final perms = GroupPermissions.forRole('viewer');

      expect(perms.canAddExpenses, false);
      expect(perms.canEditOwnExpenses, false);
      expect(perms.canEditAllExpenses, false);
      expect(perms.canDeleteExpenses, false);
      expect(perms.canApproveExpenses, false);
      expect(perms.canInviteMembers, false);
      expect(perms.canRemoveMembers, false);
      expect(perms.canViewReports, true);
      expect(perms.canExportData, false);
      expect(perms.canManageSettings, false);
    });

    test('unknown role gets no permissions', () {
      final perms = GroupPermissions.forRole('unknown');

      expect(perms.canAddExpenses, false);
      expect(perms.canEditOwnExpenses, false);
      expect(perms.canViewReports, false);
      expect(perms.canManageSettings, false);
    });
  });
}
