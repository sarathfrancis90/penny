import 'package:flutter/material.dart';

enum NotificationType {
  groupExpenseAdded(
    'group_expense_added',
    'New Expense Added',
    'When a group member adds an expense',
    'group',
  ),
  groupInvitation(
    'group_invitation',
    'Group Invitation',
    'When you are invited to a group',
    'group',
  ),
  groupMemberJoined(
    'group_member_joined',
    'Member Joined',
    'When someone joins your group',
    'group',
  ),
  groupMemberLeft(
    'group_member_left',
    'Member Left',
    'When someone leaves your group',
    'group',
  ),
  groupRoleChanged(
    'group_role_changed',
    'Role Changed',
    'When your role is changed',
    'group',
  ),
  groupSettingsChanged(
    'group_settings_changed',
    'Settings Changed',
    'When group settings are updated',
    'group',
  ),
  budgetWarning(
    'budget_warning',
    'Budget Warning',
    'When spending reaches 75% of budget',
    'budget',
  ),
  budgetCritical(
    'budget_critical',
    'Budget Critical',
    'When spending reaches 90% of budget',
    'budget',
  ),
  budgetExceeded(
    'budget_exceeded',
    'Budget Exceeded',
    'When spending exceeds budget',
    'budget',
  ),
  budgetReset(
    'budget_reset',
    'Budget Reset',
    'When budgets reset at month start',
    'budget',
  ),
  milestone(
    'milestone',
    'Milestone Reached',
    'When a savings goal milestone is reached',
    'system',
  ),
  weeklySummary(
    'weekly_summary',
    'Weekly Summary',
    'Weekly spending summary',
    'system',
  ),
  monthlySummary(
    'monthly_summary',
    'Monthly Summary',
    'Monthly spending summary',
    'system',
  );

  const NotificationType(this.value, this.label, this.description, this.category);
  final String value;
  final String label;
  final String description;
  final String category;
}

class NotificationCategory {
  const NotificationCategory(this.key, this.title, this.icon, this.types);
  final String key;
  final String title;
  final IconData icon;
  final List<NotificationType> types;
}

/// Notification types grouped by category for the preferences screen.
const notificationCategories = [
  NotificationCategory(
    'group',
    'Group Activity',
    Icons.group_outlined,
    [
      NotificationType.groupExpenseAdded,
      NotificationType.groupInvitation,
      NotificationType.groupMemberJoined,
      NotificationType.groupMemberLeft,
      NotificationType.groupRoleChanged,
      NotificationType.groupSettingsChanged,
    ],
  ),
  NotificationCategory(
    'budget',
    'Budget Alerts',
    Icons.account_balance_wallet_outlined,
    [
      NotificationType.budgetWarning,
      NotificationType.budgetCritical,
      NotificationType.budgetExceeded,
      NotificationType.budgetReset,
    ],
  ),
  NotificationCategory(
    'system',
    'System',
    Icons.notifications_outlined,
    [
      NotificationType.milestone,
      NotificationType.weeklySummary,
      NotificationType.monthlySummary,
    ],
  ),
];
