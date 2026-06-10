import 'package:dio/dio.dart';
import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:penny_mobile/app.dart';
import 'package:penny_mobile/core/network/api_client.dart';
import 'package:penny_mobile/core/network/api_endpoints.dart';
import 'package:penny_mobile/data/services/auth_service.dart';
import 'package:penny_mobile/data/services/oauth_service.dart';
import 'package:penny_mobile/presentation/providers/auth_provider.dart';
import 'package:penny_mobile/presentation/providers/providers.dart';

const integrationUserId = 'test-user-123';
const integrationUserEmail = 'test@penny.app';
const integrationUserName = 'Test User';
const integrationGroupId = 'group-family';

final _defaultErrorWidgetBuilder = ErrorWidget.builder;

bool _hiveReady = false;

Future<void> preparePennyIntegrationTest() async {
  resetPennyIntegrationErrorWidget();

  if (!_hiveReady) {
    await Hive.initFlutter();
    _hiveReady = true;
  }

  final prefs = await _openBox('app_preferences');
  await prefs.clear();
  await prefs.put('onboarding_complete', true);
  await prefs.put('has_logged_in', true);

  final guestExpenses = await _openBox('guest_expenses');
  await guestExpenses.clear();
}

void resetPennyIntegrationErrorWidget() {
  ErrorWidget.builder = _defaultErrorWidgetBuilder;
}

Future<Box<dynamic>> _openBox(String name) {
  if (Hive.isBoxOpen(name)) return Future.value(Hive.box(name));
  return Hive.openBox(name);
}

class PennyIntegrationHarness {
  PennyIntegrationHarness({bool signedIn = true})
    : api = IntegrationFakeApiClient(),
      auth = signedIn
          ? MockFirebaseAuth(
              signedIn: true,
              mockUser: MockUser(
                uid: integrationUserId,
                email: integrationUserEmail,
                displayName: integrationUserName,
                isAnonymous: false,
              ),
            )
          : MockFirebaseAuth(signedIn: false);

  final IntegrationFakeApiClient api;
  final MockFirebaseAuth auth;

  Widget get app => ProviderScope(
    overrides: [
      apiClientProvider.overrideWithValue(api),
      authServiceProvider.overrideWithValue(AuthService(auth: auth)),
      oauthServiceProvider.overrideWithValue(OAuthService(auth: auth)),
      authStateProvider.overrideWith((ref) => Stream.value(auth.currentUser)),
      currentUserProvider.overrideWithValue(auth.currentUser),
      pushNotificationInitProvider.overrideWith((ref) async {}),
      pushNavigationStreamProvider.overrideWith((ref) => const Stream.empty()),
    ],
    child: const PennyApp(),
  );
}

class ApiCall {
  const ApiCall(this.method, this.path, this.data, this.queryParameters);

  final String method;
  final String path;
  final Object? data;
  final Map<String, dynamic>? queryParameters;
}

class IntegrationFakeApiClient extends ApiClient {
  IntegrationFakeApiClient() : super(baseUrl: 'https://api.test');

  final calls = <ApiCall>[];
  var _idSequence = 100;

  final expenses = <Map<String, dynamic>>[
    _expense(
      id: 'expense-tim-hortons',
      vendor: 'Tim Hortons',
      amount: 14.50,
      category: 'Meals and entertainment',
      description: 'Client coffee',
      date: '2026-06-03T12:00:00.000Z',
    ),
    _expense(
      id: 'expense-staples',
      vendor: 'Staples',
      amount: 45.99,
      category: 'Office expenses',
      description: 'Printer paper',
      date: '2026-06-05T12:00:00.000Z',
    ),
    _expense(
      id: 'expense-family-market',
      vendor: 'Metro',
      amount: 87.25,
      category: 'Groceries',
      description: 'Household groceries',
      date: '2026-06-06T12:00:00.000Z',
      expenseType: 'group',
      groupId: integrationGroupId,
      groupMetadata: {
        'approvalStatus': 'approved',
        'paidBy': integrationUserId,
      },
    ),
  ];

  final budgets = <Map<String, dynamic>>[
    _budget(
      id: 'budget-meals',
      category: 'Meals and entertainment',
      monthlyLimit: 300,
    ),
    _budget(
      id: 'budget-office',
      category: 'Office expenses',
      monthlyLimit: 200,
    ),
  ];

  final groupBudgets = <Map<String, dynamic>>[
    {
      'id': 'group-budget-groceries',
      'groupId': integrationGroupId,
      'category': 'Groceries',
      'monthlyLimit': 600,
      'period': {'month': 6, 'year': 2026},
      'settings': {
        'rollover': false,
        'alertThreshold': 80,
        'notificationsEnabled': true,
      },
      'setBy': integrationUserId,
      'setByRole': 'owner',
      'createdAt': _now,
      'updatedAt': _now,
    },
  ];

  final incomeSources = <Map<String, dynamic>>[
    _income(
      id: 'income-consulting',
      name: 'Software Consulting',
      category: 'salary',
      amount: 8000,
      frequency: 'monthly',
    ),
    _income(
      id: 'income-freelance',
      name: 'Freelance Support',
      category: 'freelance',
      amount: 2500,
      frequency: 'biweekly',
    ),
  ];

  final savingsGoals = <Map<String, dynamic>>[
    _savings(
      id: 'savings-emergency',
      name: 'Emergency Fund',
      category: 'emergency_fund',
      targetAmount: 12000,
      currentAmount: 4200,
    ),
    _savings(
      id: 'savings-tax',
      name: 'Tax Reserve',
      category: 'custom',
      targetAmount: 9000,
      currentAmount: 3100,
    ),
  ];

  final groups = <Map<String, dynamic>>[
    {
      'id': integrationGroupId,
      'name': 'Family Expenses',
      'description': 'Shared household spending',
      'icon': 'home',
      'createdBy': integrationUserId,
      'createdAt': _now,
      'updatedAt': _now,
      'settings': {
        'requireApproval': true,
        'allowMemberInvites': true,
        'currency': 'CAD',
      },
      'status': 'active',
      'stats': {
        'memberCount': 2,
        'expenseCount': 1,
        'totalAmount': 87.25,
        'lastActivityAt': _now,
      },
    },
    {
      'id': 'group-business-trip',
      'name': 'Business Trip',
      'description': 'Conference travel',
      'icon': 'briefcase',
      'createdBy': integrationUserId,
      'createdAt': _now,
      'updatedAt': _now,
      'settings': {
        'requireApproval': false,
        'allowMemberInvites': true,
        'currency': 'CAD',
      },
      'status': 'active',
      'stats': {
        'memberCount': 3,
        'expenseCount': 0,
        'totalAmount': 0,
        'lastActivityAt': _now,
      },
    },
  ];

  final members = <Map<String, dynamic>>[
    {
      'id': '${integrationGroupId}_$integrationUserId',
      'groupId': integrationGroupId,
      'userId': integrationUserId,
      'userEmail': integrationUserEmail,
      'userName': integrationUserName,
      'role': 'owner',
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
        'canManageSettings': true,
      },
      'invitedAt': _now,
      'invitedBy': integrationUserId,
      'joinedAt': _now,
    },
    {
      'id': '${integrationGroupId}_partner',
      'groupId': integrationGroupId,
      'userId': 'partner-user',
      'userEmail': 'partner@example.com',
      'userName': 'Partner User',
      'role': 'member',
      'status': 'active',
      'permissions': {
        'canAddExpenses': true,
        'canEditOwnExpenses': true,
        'canViewReports': true,
      },
      'invitedAt': _now,
      'invitedBy': integrationUserId,
      'joinedAt': _now,
    },
  ];

  final groupActivities = <Map<String, dynamic>>[
    {
      'id': 'activity-expense-added',
      'groupId': integrationGroupId,
      'userId': integrationUserId,
      'userName': integrationUserName,
      'action': 'expense_added',
      'details': 'Added Metro',
      'createdAt': _now,
    },
  ];

  final groupIncomeSources = <Map<String, dynamic>>[
    {
      'id': 'group-income-rental',
      'groupId': integrationGroupId,
      'addedBy': integrationUserId,
      'name': 'Shared Rental',
      'category': 'rental',
      'amount': 1800,
      'frequency': 'monthly',
      'isRecurring': true,
      'isActive': true,
      'taxable': true,
      'currency': 'CAD',
      'splitType': 'equal',
      'createdAt': _now,
      'updatedAt': _now,
    },
  ];

  final groupSavingsGoals = <Map<String, dynamic>>[
    {
      'id': 'group-savings-reno',
      'groupId': integrationGroupId,
      'createdBy': integrationUserId,
      'name': 'Kitchen Renovation',
      'category': 'house_down_payment',
      'targetAmount': 15000,
      'currentAmount': 3200,
      'monthlyContribution': 600,
      'status': 'active',
      'isActive': true,
      'priority': 'high',
      'currency': 'CAD',
      'contributionType': 'equal',
      'progressPercentage': 21.3,
      'createdAt': _now,
      'updatedAt': _now,
    },
  ];

  final notifications = <Map<String, dynamic>>[
    {
      'id': 'notification-budget',
      'userId': integrationUserId,
      'type': 'budget_warning',
      'title': 'Budget Warning',
      'body': 'Meals budget is approaching the limit',
      'priority': 'high',
      'category': 'budget',
      'read': false,
      'delivered': true,
      'isGrouped': false,
      'createdAt': _now,
    },
    {
      'id': 'notification-group',
      'userId': integrationUserId,
      'type': 'group_expense_added',
      'title': 'New group expense',
      'body': 'Metro was added to Family Expenses',
      'priority': 'medium',
      'category': 'group',
      'read': true,
      'delivered': true,
      'isGrouped': false,
      'groupId': integrationGroupId,
      'createdAt': _now,
    },
  ];

  final conversations = <Map<String, dynamic>>[
    {
      'id': 'conversation-1',
      'userId': integrationUserId,
      'title': 'June expenses',
      'createdAt': _now,
      'updatedAt': _now,
      'lastMessagePreview': 'Track office purchases',
      'messageCount': 2,
      'status': 'active',
      'totalExpensesCreated': 1,
      'metadata': {
        'lastAccessedAt': _now,
        'isPinned': false,
        'aiTitleGenerated': false,
      },
    },
  ];

  final messages = <Map<String, dynamic>>[
    {
      'id': 'message-1',
      'conversationId': 'conversation-1',
      'role': 'user',
      'content': 'Track office purchases',
      'timestamp': _now,
      'status': 'sent',
    },
  ];

  @override
  Future<Response<T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
  }) async {
    calls.add(ApiCall('GET', path, null, queryParameters));
    return _response<T>(_get(path, queryParameters ?? const {}), path);
  }

  @override
  Future<Response<T>> post<T>(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
  }) async {
    calls.add(ApiCall('POST', path, data, queryParameters));
    return _response<T>(_post(path, _mapData(data)), path);
  }

  @override
  Future<Response<T>> patch<T>(String path, {Object? data}) async {
    calls.add(ApiCall('PATCH', path, data, null));
    return _response<T>(_patch(path, _mapData(data)), path);
  }

  @override
  Future<Response<T>> put<T>(String path, {Object? data}) async {
    calls.add(ApiCall('PUT', path, data, null));
    return _response<T>({}, path);
  }

  @override
  Future<Response<T>> delete<T>(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
  }) async {
    calls.add(ApiCall('DELETE', path, data, queryParameters));
    return _response<T>(_delete(path), path);
  }

  Object _get(String path, Map<String, dynamic> query) {
    if (path == ApiEndpoints.expenses) {
      final scope = query['scope'] as String? ?? 'all';
      final groupId = query['groupId'] as String?;
      final approvalStatus = query['approvalStatus'] as String?;
      var result = expenses;
      if (scope == 'personal') {
        result = result.where((e) => e['expenseType'] == 'personal').toList();
      } else if (scope == 'group') {
        result = result.where((e) => e['groupId'] == groupId).toList();
      }
      if (approvalStatus != null) {
        result = result
            .where(
              (e) =>
                  (e['groupMetadata']
                      as Map<String, dynamic>?)?['approvalStatus'] ==
                  approvalStatus,
            )
            .toList();
      }
      return {'expenses': result};
    }
    if (path == ApiEndpoints.personalBudgets) return {'budgets': budgets};
    if (path == ApiEndpoints.groupBudgets) return {'budgets': groupBudgets};
    if (path == ApiEndpoints.personalIncome) {
      return {'incomeSources': incomeSources};
    }
    if (path == ApiEndpoints.groupIncome) {
      return {'incomeSources': groupIncomeSources};
    }
    if (path == ApiEndpoints.personalSavings) {
      return {'savingsGoals': savingsGoals};
    }
    if (path == ApiEndpoints.groupSavings) {
      return {'savingsGoals': groupSavingsGoals};
    }
    if (path == ApiEndpoints.groups) return {'groups': groups};
    if (path == ApiEndpoints.notifications) {
      return {'notifications': notifications};
    }
    if (path == ApiEndpoints.conversations) {
      return {'conversations': conversations};
    }
    if (path == ApiEndpoints.defaultGroup) {
      return {'groupId': integrationGroupId};
    }
    if (path == ApiEndpoints.userProfile) {
      return {
        'profile': {
          'userId': integrationUserId,
          'displayName': integrationUserName,
          'email': integrationUserEmail,
        },
      };
    }
    if (path == ApiEndpoints.userPreferences) {
      return {
        'preferences': {
          'currency': 'CAD',
          'fiscalYearEnd': 'December',
          'themeMode': 'system',
        },
      };
    }
    if (path == ApiEndpoints.notificationSettings) {
      return {
        'settings': {
          'id': 'notification-settings',
          'globalMute': false,
          'quietHoursStart': '22:00',
          'quietHoursEnd': '08:00',
          'updatedAt': _now,
        },
      };
    }
    if (path == ApiEndpoints.notificationPreferences) {
      return {'preferences': <String, dynamic>{}};
    }

    final groupId = _match(path, r'^/api/groups/([^/]+)$');
    if (groupId != null) {
      return {'group': groups.firstWhere((group) => group['id'] == groupId)};
    }
    final membersGroupId = _match(path, r'^/api/groups/([^/]+)/members$');
    if (membersGroupId != null) {
      return {
        'members': members
            .where((member) => member['groupId'] == membersGroupId)
            .toList(),
      };
    }
    final membershipGroupId = _match(
      path,
      r'^/api/groups/([^/]+)/membership/me$',
    );
    if (membershipGroupId != null) {
      return {
        'membership': members.firstWhere(
          (member) =>
              member['groupId'] == membershipGroupId &&
              member['userId'] == integrationUserId,
        ),
      };
    }
    final activityGroupId = _match(path, r'^/api/groups/([^/]+)/activities$');
    if (activityGroupId != null) {
      return {
        'activities': groupActivities
            .where((activity) => activity['groupId'] == activityGroupId)
            .toList(),
      };
    }
    final conversationId = _match(path, r'^/api/conversations/([^/]+)$');
    if (conversationId != null) {
      return {
        'conversation': conversations.firstWhere(
          (conversation) => conversation['id'] == conversationId,
        ),
      };
    }
    final messagesConversationId = _match(
      path,
      r'^/api/conversations/([^/]+)/messages$',
    );
    if (messagesConversationId != null) {
      return {
        'messages': messages
            .where(
              (message) => message['conversationId'] == messagesConversationId,
            )
            .toList(),
      };
    }

    return <String, dynamic>{};
  }

  Object _post(String path, Map<String, dynamic> data) {
    if (path == ApiEndpoints.expenses) {
      final id = 'expense-${_idSequence++}';
      expenses.insert(
        0,
        _expense(
          id: id,
          vendor: data['vendor'] as String? ?? 'Expense',
          amount: (data['amount'] as num?)?.toDouble() ?? 0,
          category: data['category'] as String? ?? 'Office expenses',
          description: data['description'] as String?,
          date: data['date'] as String? ?? _now,
          expenseType: data['groupId'] == null ? 'personal' : 'group',
          groupId: data['groupId'] as String?,
        ),
      );
      return {'id': id};
    }
    if (path == ApiEndpoints.conversations) {
      final id = 'conversation-${_idSequence++}';
      conversations.insert(0, {
        'id': id,
        'userId': data['userId'] as String? ?? integrationUserId,
        'title': data['title'] as String? ?? 'New chat',
        'createdAt': _now,
        'updatedAt': _now,
        'lastMessagePreview': data['firstMessage'] as String? ?? '',
        'messageCount': 1,
        'status': 'active',
        'totalExpensesCreated': 0,
        'metadata': {
          'lastAccessedAt': _now,
          'isPinned': false,
          'aiTitleGenerated': false,
        },
      });
      return {'conversationId': id};
    }
    if (path == ApiEndpoints.markAllNotificationsRead) {
      for (final notification in notifications) {
        notification['read'] = true;
      }
      return {};
    }
    if (path == ApiEndpoints.defaultGroup) return {};
    if (path == ApiEndpoints.analyzeExpense) {
      return {
        'expenses': [
          {
            'vendor': 'Tim Hortons',
            'amount': 14.50,
            'category': 'Meals and entertainment',
            'date': '2026-06-03',
            'confidence': 0.9,
          },
        ],
      };
    }
    if (path == ApiEndpoints.aiChat) return {'response': 'Recorded.'};
    return {};
  }

  Object _patch(String path, Map<String, dynamic> data) {
    final expenseId = _match(path, r'^/api/expenses/([^/]+)$');
    if (expenseId != null) {
      final expense = expenses.firstWhere((item) => item['id'] == expenseId);
      expense.addAll(data);
      expense['updatedAt'] = _now;
      return {};
    }
    final notificationId = _match(path, r'^/api/notifications/([^/]+)/read$');
    if (notificationId != null) {
      final notification = notifications.firstWhere(
        (item) => item['id'] == notificationId,
      );
      notification['read'] = true;
      notification['readAt'] = _now;
      return {};
    }
    return {};
  }

  Object _delete(String path) {
    final expenseId = _match(path, r'^/api/expenses/([^/]+)$');
    if (expenseId != null) {
      expenses.removeWhere((expense) => expense['id'] == expenseId);
      return {};
    }
    return {};
  }

  Response<T> _response<T>(Object data, String path) {
    return Response<T>(
      data: data as T,
      requestOptions: RequestOptions(path: path),
      statusCode: 200,
    );
  }

  Map<String, dynamic> _mapData(Object? data) {
    if (data is Map<String, dynamic>) return data;
    if (data is Map) return Map<String, dynamic>.from(data);
    return <String, dynamic>{};
  }

  static String? _match(String path, String pattern) {
    return RegExp(pattern).firstMatch(path)?.group(1);
  }

  static Map<String, dynamic> _expense({
    required String id,
    required String vendor,
    required double amount,
    required String category,
    required String date,
    String? description,
    String expenseType = 'personal',
    String? groupId,
    Map<String, dynamic>? groupMetadata,
  }) {
    return {
      'id': id,
      'userId': integrationUserId,
      'vendor': vendor,
      'amount': amount,
      'category': category,
      'description': description,
      'date': date,
      'expenseType': expenseType,
      'groupId': groupId,
      'groupMetadata': ?groupMetadata,
      'createdAt': date,
      'updatedAt': date,
      'syncStatus': 'synced',
      'history': <Map<String, dynamic>>[],
    };
  }

  static Map<String, dynamic> _budget({
    required String id,
    required String category,
    required double monthlyLimit,
  }) {
    return {
      'id': id,
      'userId': integrationUserId,
      'category': category,
      'monthlyLimit': monthlyLimit,
      'period': {'month': 6, 'year': 2026},
      'settings': {
        'rollover': false,
        'alertThreshold': 80,
        'notificationsEnabled': true,
      },
      'isActive': true,
      'createdAt': _now,
      'updatedAt': _now,
    };
  }

  static Map<String, dynamic> _income({
    required String id,
    required String name,
    required String category,
    required double amount,
    required String frequency,
  }) {
    return {
      'id': id,
      'userId': integrationUserId,
      'name': name,
      'category': category,
      'amount': amount,
      'frequency': frequency,
      'isRecurring': true,
      'isActive': true,
      'taxable': true,
      'currency': 'CAD',
      'startDate': _now,
      'createdAt': _now,
      'updatedAt': _now,
    };
  }

  static Map<String, dynamic> _savings({
    required String id,
    required String name,
    required String category,
    required double targetAmount,
    required double currentAmount,
  }) {
    return {
      'id': id,
      'userId': integrationUserId,
      'name': name,
      'category': category,
      'targetAmount': targetAmount,
      'currentAmount': currentAmount,
      'monthlyContribution': 500,
      'status': 'active',
      'isActive': true,
      'priority': 'high',
      'currency': 'CAD',
      'startDate': _now,
      'createdAt': _now,
      'updatedAt': _now,
      'progressPercentage': currentAmount / targetAmount * 100,
      'onTrack': true,
    };
  }
}

const _now = '2026-06-09T12:00:00.000Z';
