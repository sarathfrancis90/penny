import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:penny_mobile/core/constants/app_colors.dart';
import 'package:penny_mobile/data/models/group_member_model.dart';
import 'package:penny_mobile/data/models/group_model.dart';
import 'package:penny_mobile/presentation/providers/group_providers.dart';

class GroupDetailScreen extends ConsumerWidget {
  const GroupDetailScreen({super.key, required this.groupId});

  final String groupId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final group = ref.watch(groupByIdProvider(groupId));
    final membersAsync = ref.watch(groupMembersProvider(groupId));

    if (group == null) {
      return Scaffold(
        appBar: AppBar(),
        body: const Center(child: Text('Group not found')),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(group.name),
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        children: [
          const SizedBox(height: 8),

          // Group header
          _GroupHeader(group: group),
          const SizedBox(height: 24),

          // Stats row
          _StatsRow(group: group),
          const SizedBox(height: 24),

          // Members section
          const Text('MEMBERS',
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600,
                  color: AppColors.textSecondary, letterSpacing: 1)),
          const SizedBox(height: 12),

          membersAsync.when(
            data: (members) => members.isEmpty
                ? const Text('No members',
                    style: TextStyle(color: AppColors.textSecondary))
                : Column(
                    children: members
                        .map((m) => _MemberTile(member: m))
                        .toList(),
                  ),
            loading: () =>
                const Center(child: CircularProgressIndicator()),
            error: (e, _) => Text('Error: $e'),
          ),

          const SizedBox(height: 24),

          // Actions
          if (group.settings.requireApproval)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                children: [
                  const Icon(Icons.verified_outlined, size: 16,
                      color: AppColors.primary),
                  const SizedBox(width: 6),
                  const Text('Expense approval required',
                      style: TextStyle(fontSize: 13,
                          color: AppColors.textSecondary)),
                ],
              ),
            ),

          if (group.description != null &&
              group.description!.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(group.description!,
                style: const TextStyle(
                    fontSize: 14, color: AppColors.textSecondary)),
          ],

          const SizedBox(height: 24),
        ],
      ),
    );
  }
}

class _GroupHeader extends StatelessWidget {
  const _GroupHeader({required this.group});
  final GroupModel group;

  @override
  Widget build(BuildContext context) {
    final icon = group.icon ?? '👥';

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        children: [
          Hero(
            tag: 'group-icon-${group.id}',
            child: Container(
              width: 64, height: 64,
              decoration: BoxDecoration(
                color: AppColors.background,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Center(
                  child: Text(icon, style: const TextStyle(fontSize: 32))),
            ),
          ),
          const SizedBox(height: 12),
          Hero(
            tag: 'group-name-${group.id}',
            flightShuttleBuilder: (
              flightContext,
              animation,
              flightDirection,
              fromHeroContext,
              toHeroContext,
            ) {
              return DefaultTextStyle(
                style: DefaultTextStyle.of(toHeroContext).style,
                child: toHeroContext.widget,
              );
            },
            child: Material(
              type: MaterialType.transparency,
              child: Text(group.name,
                  style: const TextStyle(
                      fontSize: 22, fontWeight: FontWeight.w700)),
            ),
          ),
          if (group.description != null &&
              group.description!.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(group.description!,
                style: const TextStyle(
                    fontSize: 14, color: AppColors.textSecondary),
                textAlign: TextAlign.center),
          ],
        ],
      ),
    );
  }
}

class _StatsRow extends StatelessWidget {
  const _StatsRow({required this.group});
  final GroupModel group;

  @override
  Widget build(BuildContext context) {
    final formatter = NumberFormat.currency(symbol: '\$', decimalDigits: 0);

    return Row(
      children: [
        _StatCard(
          label: 'Members',
          value: '${group.stats.memberCount}',
          icon: Icons.people_outline,
        ),
        const SizedBox(width: 12),
        _StatCard(
          label: 'Expenses',
          value: '${group.stats.expenseCount}',
          icon: Icons.receipt_long_outlined,
        ),
        const SizedBox(width: 12),
        _StatCard(
          label: 'Total',
          value: formatter.format(group.stats.totalAmount),
          icon: Icons.attach_money,
        ),
      ],
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({
    required this.label,
    required this.value,
    required this.icon,
  });

  final String label;
  final String value;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Semantics(
        label: '$label: $value',
        container: true,
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(
            children: [
              Icon(icon, size: 20, color: AppColors.textSecondary),
              const SizedBox(height: 6),
              Text(value,
                  style: const TextStyle(
                      fontSize: 16, fontWeight: FontWeight.w700)),
              Text(label,
                  style: const TextStyle(
                      fontSize: 11, color: AppColors.textSecondary)),
            ],
          ),
        ),
      ),
    );
  }
}

class _MemberTile extends StatelessWidget {
  const _MemberTile({required this.member});
  final GroupMemberModel member;

  Color get _roleColor => switch (member.role) {
        'owner' => AppColors.primary,
        'admin' => AppColors.warning,
        'member' => AppColors.success,
        _ => AppColors.textSecondary,
      };

  @override
  Widget build(BuildContext context) {
    final initial = (member.userName ?? member.userEmail)
        .substring(0, 1)
        .toUpperCase();

    return Semantics(
      label: '${member.userName ?? member.userEmail}, role: ${member.role}',
      container: true,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(
          children: [
            CircleAvatar(
              radius: 18,
              backgroundColor: AppColors.surface,
              child: Text(initial,
                  style: const TextStyle(
                      fontSize: 14, fontWeight: FontWeight.w600)),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(member.userName ?? member.userEmail,
                      style: const TextStyle(
                          fontSize: 15, fontWeight: FontWeight.w500)),
                  if (member.userName != null)
                    Text(member.userEmail,
                        style: const TextStyle(
                            fontSize: 12, color: AppColors.textSecondary)),
                ],
              ),
            ),
            Semantics(
              label: 'Role: ${member.role}',
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: _roleColor.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(member.role,
                    style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: _roleColor)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
