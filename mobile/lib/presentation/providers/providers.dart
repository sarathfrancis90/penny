import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:penny_mobile/core/constants/env_config.dart';
import 'package:penny_mobile/core/network/api_client.dart';
import 'package:penny_mobile/core/network/api_endpoints.dart';
import 'package:penny_mobile/data/repositories/ai_repository.dart';
import 'package:penny_mobile/data/repositories/api_response_helpers.dart';
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
import 'package:penny_mobile/presentation/providers/default_group_selection.dart';
import 'package:penny_mobile/presentation/providers/user_session.dart';

final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient(baseUrl: EnvConfig.apiBaseUrl);
});

final aiRepositoryProvider = Provider<AiRepository>((ref) {
  return AiRepository(apiClient: ref.watch(apiClientProvider));
});

final conversationRepositoryProvider = Provider<ConversationRepository>((ref) {
  return ConversationRepository(apiClient: ref.watch(apiClientProvider));
});

final expenseRepositoryProvider = Provider<ExpenseRepository>((ref) {
  return ExpenseRepository(apiClient: ref.watch(apiClientProvider));
});

final budgetRepositoryProvider = Provider<BudgetRepository>((ref) {
  return BudgetRepository(apiClient: ref.watch(apiClientProvider));
});

final incomeRepositoryProvider = Provider<IncomeRepository>((ref) {
  return IncomeRepository(apiClient: ref.watch(apiClientProvider));
});

final savingsRepositoryProvider = Provider<SavingsRepository>((ref) {
  return SavingsRepository(apiClient: ref.watch(apiClientProvider));
});

final groupRepositoryProvider = Provider<GroupRepository>((ref) {
  return GroupRepository(apiClient: ref.watch(apiClientProvider));
});

final groupIncomeRepositoryProvider = Provider<GroupIncomeRepository>((ref) {
  return GroupIncomeRepository(apiClient: ref.watch(apiClientProvider));
});

final groupSavingsRepositoryProvider = Provider<GroupSavingsRepository>((ref) {
  return GroupSavingsRepository(apiClient: ref.watch(apiClientProvider));
});

final notificationRepositoryProvider = Provider<NotificationRepository>((ref) {
  return NotificationRepository(apiClient: ref.watch(apiClientProvider));
});

final storageServiceProvider = Provider<StorageService>((ref) {
  return StorageService(apiClient: ref.watch(apiClientProvider));
});

final duplicateDetectorProvider = Provider<DuplicateDetector>((ref) {
  return DuplicateDetector(apiClient: ref.watch(apiClientProvider));
});

final pushNotificationServiceProvider = Provider<PushNotificationService>((
  ref,
) {
  return PushNotificationService(apiClient: ref.watch(apiClientProvider));
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

/// Stops push notifications for [userId] on this device. Best-effort: it
/// never throws and gives up after a few seconds, so it cannot hold up a
/// sign-out or an account deletion.
Future<void> unregisterPushToken(
  PushNotificationService service,
  String userId,
) async {
  try {
    await service.removeToken(userId).timeout(const Duration(seconds: 3));
  } catch (error) {
    debugPrint('[Push] Could not unregister this device: $error');
  }
}

/// Signs the current user out, first unregistering this device's push token
/// so the signed-out user's notifications stop arriving here.
Future<void> signOutUser(T Function<T>(ProviderListenable<T>) read) async {
  final user = read(currentUserProvider);
  if (user != null) {
    await unregisterPushToken(read(pushNotificationServiceProvider), user.uid);
  }
  await read(authServiceProvider).signOut();
}

/// Stream of navigation URLs from push notification taps.
final pushNavigationStreamProvider = StreamProvider<String>((ref) {
  final service = ref.read(pushNotificationServiceProvider);
  return service.navigationStream;
});

/// Stream the user's default group ID from their preferences.
/// Returns `null` when no default group is set.
final defaultGroupProvider = StreamProvider.autoDispose<String?>((ref) {
  keepForCurrentSession(ref);
  final user = ref.watch(currentUserProvider);
  if (user == null) return const Stream.empty();
  final api = ref.watch(apiClientProvider);
  return Stream.fromFuture(
    api
        .get(ApiEndpoints.defaultGroup, queryParameters: {'userId': user.uid})
        .then((response) => parseDefaultGroupId(responseMap(response))),
  );
});
