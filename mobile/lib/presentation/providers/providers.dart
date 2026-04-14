import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:penny_mobile/core/constants/env_config.dart';
import 'package:penny_mobile/core/network/api_client.dart';
import 'package:penny_mobile/data/repositories/ai_repository.dart';
import 'package:penny_mobile/data/repositories/budget_repository.dart';
import 'package:penny_mobile/data/repositories/conversation_repository.dart';
import 'package:penny_mobile/data/repositories/expense_repository.dart';
import 'package:penny_mobile/data/repositories/income_repository.dart';
import 'package:penny_mobile/data/repositories/group_income_repository.dart';
import 'package:penny_mobile/data/repositories/group_repository.dart';
import 'package:penny_mobile/data/repositories/group_savings_repository.dart';
import 'package:penny_mobile/data/repositories/notification_repository.dart';
import 'package:penny_mobile/data/repositories/savings_repository.dart';
import 'package:penny_mobile/data/services/duplicate_detector.dart';
import 'package:penny_mobile/data/services/export_service.dart';
import 'package:penny_mobile/data/services/push_notification_service.dart';
import 'package:penny_mobile/data/services/storage_service.dart';
import 'package:penny_mobile/presentation/providers/auth_provider.dart';

final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient(baseUrl: EnvConfig.apiBaseUrl);
});

final aiRepositoryProvider = Provider<AiRepository>((ref) {
  return AiRepository(apiClient: ref.watch(apiClientProvider));
});

final conversationRepositoryProvider = Provider<ConversationRepository>((ref) {
  return ConversationRepository();
});

final expenseRepositoryProvider = Provider<ExpenseRepository>((ref) {
  return ExpenseRepository();
});

final budgetRepositoryProvider = Provider<BudgetRepository>((ref) {
  return BudgetRepository();
});

final incomeRepositoryProvider = Provider<IncomeRepository>((ref) {
  return IncomeRepository();
});

final savingsRepositoryProvider = Provider<SavingsRepository>((ref) {
  return SavingsRepository();
});

final groupRepositoryProvider = Provider<GroupRepository>((ref) {
  return GroupRepository(apiClient: ref.watch(apiClientProvider));
});

final groupIncomeRepositoryProvider = Provider<GroupIncomeRepository>((ref) {
  return GroupIncomeRepository();
});

final groupSavingsRepositoryProvider = Provider<GroupSavingsRepository>((ref) {
  return GroupSavingsRepository();
});

final notificationRepositoryProvider = Provider<NotificationRepository>((ref) {
  return NotificationRepository();
});

final storageServiceProvider = Provider<StorageService>((ref) {
  return StorageService();
});

final duplicateDetectorProvider = Provider<DuplicateDetector>((ref) {
  return DuplicateDetector();
});

final pushNotificationServiceProvider =
    Provider<PushNotificationService>((ref) {
  return PushNotificationService();
});

final exportServiceProvider = Provider<ExportService>((ref) => ExportService());

/// Initializes push notifications when a user is authenticated.
/// Watch this provider in the app shell to trigger initialization.
final pushNotificationInitProvider = FutureProvider<void>((ref) async {
  final user = ref.watch(currentUserProvider);
  final service = ref.read(pushNotificationServiceProvider);
  if (user != null) {
    await service.initialize();
    await service.requestPermission();
    await service.getAndStoreToken(user.uid);
  }
});

/// Stream of navigation URLs from push notification taps.
final pushNavigationStreamProvider = StreamProvider<String>((ref) {
  final service = ref.read(pushNotificationServiceProvider);
  return service.navigationStream;
});

/// Stream the user's default group ID from their preferences.
/// Returns `null` when no default group is set.
final defaultGroupProvider = StreamProvider<String?>((ref) {
  final user = ref.watch(currentUserProvider);
  if (user == null) return const Stream.empty();
  return FirebaseFirestore.instance
      .collection('users')
      .doc(user.uid)
      .snapshots()
      .map((snap) =>
          snap.data()?['preferences']?['defaultGroupId'] as String?);
});
