import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:penny_mobile/data/repositories/conversation_repository.dart';
import 'package:penny_mobile/data/repositories/expense_repository.dart';
import 'package:penny_mobile/data/services/auth_service.dart';
import 'package:penny_mobile/presentation/providers/auth_provider.dart';
import 'package:penny_mobile/presentation/providers/providers.dart';

/// Creates a mock Firebase user.
MockUser createMockUser({
  String uid = 'test-user-123',
  String email = 'test@penny.app',
  String displayName = 'Test User',
}) {
  return MockUser(
    uid: uid,
    email: email,
    displayName: displayName,
    isAnonymous: false,
  );
}

/// Creates a mock FirebaseAuth that is already signed in.
MockFirebaseAuth createMockAuth({MockUser? user}) {
  final mockUser = user ?? createMockUser();
  return MockFirebaseAuth(
    signedIn: true,
    mockUser: mockUser,
  );
}

/// Creates a FakeFirebaseFirestore with optional seed data.
FakeFirebaseFirestore createFakeFirestore() {
  return FakeFirebaseFirestore();
}

/// Seeds an expense into the fake Firestore.
Future<String> seedExpense(
  FakeFirebaseFirestore firestore, {
  String userId = 'test-user-123',
  String vendor = 'Tim Hortons',
  double amount = 14.50,
  String category = 'Meals and entertainment',
  String? description,
  DateTime? date,
}) async {
  final now = Timestamp.now();
  final expenseDate = date != null
      ? Timestamp.fromDate(DateTime(date.year, date.month, date.day, 12))
      : now;

  final doc = await firestore.collection('expenses').add({
    'userId': userId,
    'vendor': vendor,
    'amount': amount,
    'category': category,
    'date': expenseDate,
    'description': description ?? '',
    'expenseType': 'personal',
    'groupId': null,
    'createdAt': now,
    'updatedAt': now,
    'syncStatus': 'synced',
    'history': [
      {'action': 'created', 'by': userId, 'at': now},
    ],
  });

  return doc.id;
}

/// Creates Riverpod overrides for testing with fakes.
List<Override> createTestOverrides({
  MockFirebaseAuth? auth,
  FakeFirebaseFirestore? firestore,
}) {
  final mockAuth = auth ?? createMockAuth();
  final fakeFirestore = firestore ?? createFakeFirestore();

  return [
    authServiceProvider.overrideWithValue(
      AuthService(auth: mockAuth),
    ),
    expenseRepositoryProvider.overrideWithValue(
      ExpenseRepository(firestore: fakeFirestore),
    ),
    conversationRepositoryProvider.overrideWithValue(
      ConversationRepository(firestore: fakeFirestore),
    ),
  ];
}
