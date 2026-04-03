import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/data/models/group_model.dart';
import 'package:penny_mobile/data/models/group_member_model.dart';

void main() {
  group('GroupModel', () {
    late FakeFirebaseFirestore firestore;

    setUp(() {
      firestore = FakeFirebaseFirestore();
    });

    test('fromFirestore parses all fields', () async {
      final now = Timestamp.now();
      final doc = await firestore.collection('groups').add({
        'name': 'Family Expenses',
        'description': 'Shared household costs',
        'color': '#FF5733',
        'icon': '👨‍👩‍👧‍👦',
        'createdBy': 'user-1',
        'createdAt': now,
        'updatedAt': now,
        'settings': {
          'requireApproval': true,
          'allowMemberInvites': false,
          'currency': 'CAD',
          'budget': 5000,
          'budgetPeriod': 'monthly',
        },
        'status': 'active',
        'stats': {
          'memberCount': 3,
          'expenseCount': 42,
          'totalAmount': 2847.50,
          'lastActivityAt': now,
        },
      });

      final model = GroupModel.fromFirestore(await doc.get());

      expect(model.name, 'Family Expenses');
      expect(model.description, 'Shared household costs');
      expect(model.color, '#FF5733');
      expect(model.icon, '👨‍👩‍👧‍👦');
      expect(model.createdBy, 'user-1');
      expect(model.status, 'active');
      expect(model.settings.requireApproval, true);
      expect(model.settings.allowMemberInvites, false);
      expect(model.settings.currency, 'CAD');
      expect(model.settings.budget, 5000);
      expect(model.stats.memberCount, 3);
      expect(model.stats.expenseCount, 42);
      expect(model.stats.totalAmount, 2847.50);
    });

    test('fromFirestore handles missing optional fields', () async {
      final now = Timestamp.now();
      final doc = await firestore.collection('groups').add({
        'name': 'Minimal Group',
        'createdBy': 'user-1',
        'createdAt': now,
        'updatedAt': now,
        'settings': {},
        'status': 'active',
        'stats': {},
      });

      final model = GroupModel.fromFirestore(await doc.get());

      expect(model.description, isNull);
      expect(model.color, isNull);
      expect(model.icon, isNull);
      expect(model.settings.requireApproval, false);
      expect(model.settings.budget, isNull);
      expect(model.stats.memberCount, 0);
      expect(model.stats.totalAmount, 0);
    });
  });

  group('GroupMemberModel', () {
    late FakeFirebaseFirestore firestore;

    setUp(() {
      firestore = FakeFirebaseFirestore();
    });

    test('fromFirestore parses all fields', () async {
      final now = Timestamp.now();
      final doc = await firestore.collection('groupMembers').add({
        'groupId': 'group-1',
        'userId': 'user-1',
        'userEmail': 'test@penny.app',
        'userName': 'Test User',
        'role': 'admin',
        'status': 'active',
        'permissions': {
          'canAddExpenses': true,
          'canEditOwnExpenses': true,
          'canEditAllExpenses': true,
          'canDeleteExpenses': true,
          'canApproveExpenses': true,
          'canInviteMembers': true,
          'canRemoveMembers': true,
          'canViewReports': true,
          'canExportData': true,
          'canManageSettings': false,
        },
        'invitedAt': now,
        'invitedBy': 'owner-1',
        'joinedAt': now,
      });

      final model = GroupMemberModel.fromFirestore(await doc.get());

      expect(model.groupId, 'group-1');
      expect(model.userId, 'user-1');
      expect(model.userEmail, 'test@penny.app');
      expect(model.userName, 'Test User');
      expect(model.role, 'admin');
      expect(model.isAdmin, true);
      expect(model.isOwner, false);
      expect(model.permissions.canAddExpenses, true);
      expect(model.permissions.canManageSettings, false);
    });

    test('isOwner and isAdmin flags work correctly', () async {
      final now = Timestamp.now();
      final base = {
        'groupId': 'g', 'userId': 'u', 'userEmail': 'e',
        'status': 'active', 'permissions': {},
        'invitedAt': now, 'invitedBy': 'x',
      };

      final ownerDoc = await firestore.collection('groupMembers')
          .add({...base, 'role': 'owner'});
      final adminDoc = await firestore.collection('groupMembers')
          .add({...base, 'role': 'admin'});
      final memberDoc = await firestore.collection('groupMembers')
          .add({...base, 'role': 'member'});
      final viewerDoc = await firestore.collection('groupMembers')
          .add({...base, 'role': 'viewer'});

      final owner = GroupMemberModel.fromFirestore(await ownerDoc.get());
      final admin = GroupMemberModel.fromFirestore(await adminDoc.get());
      final member = GroupMemberModel.fromFirestore(await memberDoc.get());
      final viewer = GroupMemberModel.fromFirestore(await viewerDoc.get());

      expect(owner.isOwner, true);
      expect(owner.isAdmin, true);
      expect(admin.isOwner, false);
      expect(admin.isAdmin, true);
      expect(member.isOwner, false);
      expect(member.isAdmin, false);
      expect(viewer.isOwner, false);
      expect(viewer.isAdmin, false);
    });

    test('GroupPermissions.forRole returns correct defaults', () {
      final owner = GroupPermissions.forRole('owner');
      expect(owner.canManageSettings, true);
      expect(owner.canAddExpenses, true);

      final admin = GroupPermissions.forRole('admin');
      expect(admin.canManageSettings, false);
      expect(admin.canApproveExpenses, true);

      final member = GroupPermissions.forRole('member');
      expect(member.canAddExpenses, true);
      expect(member.canDeleteExpenses, false);
      expect(member.canViewReports, true);

      final viewer = GroupPermissions.forRole('viewer');
      expect(viewer.canViewReports, true);
      expect(viewer.canAddExpenses, false);
    });
  });
}
