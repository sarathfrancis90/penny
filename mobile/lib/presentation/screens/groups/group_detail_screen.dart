import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:penny_mobile/core/constants/app_colors.dart';
import 'package:penny_mobile/core/constants/categories.dart';
import 'package:penny_mobile/core/network/api_endpoints.dart';
import 'package:penny_mobile/data/models/expense_model.dart';
import 'package:penny_mobile/data/models/group_activity_model.dart';
import 'package:penny_mobile/data/models/group_income_model.dart';
import 'package:penny_mobile/data/models/group_member_model.dart';
import 'package:penny_mobile/data/models/group_model.dart';
import 'package:penny_mobile/data/models/group_savings_model.dart';
import 'package:penny_mobile/presentation/providers/auth_provider.dart';
import 'package:penny_mobile/presentation/providers/group_income_providers.dart';
import 'package:penny_mobile/presentation/providers/group_providers.dart';
import 'package:penny_mobile/presentation/providers/group_savings_providers.dart';
import 'package:penny_mobile/presentation/providers/providers.dart';
import 'package:penny_mobile/presentation/screens/dashboard/widgets/expense_list_tile.dart';

class GroupDetailScreen extends ConsumerWidget {
  const GroupDetailScreen({super.key, required this.groupId});

  final String groupId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final group = ref.watch(groupByIdProvider(groupId));
    final membersAsync = ref.watch(groupMembersProvider(groupId));
    final expensesAsync = ref.watch(groupExpensesProvider(groupId));
    final membershipAsync = ref.watch(currentUserMembershipProvider(groupId));
    final user = ref.watch(currentUserProvider);

    if (group == null) {
      return Scaffold(
        appBar: AppBar(),
        body: const Center(child: Text('Group not found')),
      );
    }

    final isOwnerOrAdmin = membershipAsync.valueOrNull?.isAdmin ?? false;
    final isOwner = membershipAsync.valueOrNull?.isOwner ?? false;
    final canAddExpenses =
        membershipAsync.valueOrNull?.permissions.canAddExpenses ?? false;

    return Scaffold(
      appBar: AppBar(
        title: Text(group.name),
        actions: [
          // Invite button (owner/admin only)
          if (isOwnerOrAdmin)
            IconButton(
              icon: const Icon(Icons.person_add_outlined,
                  color: AppColors.primary),
              tooltip: 'Invite member',
              onPressed: () => _showInviteSheet(context, ref, group),
            ),
          // Edit button (owner/admin only)
          if (isOwnerOrAdmin)
            IconButton(
              icon: const Icon(Icons.edit_outlined, color: AppColors.primary),
              tooltip: 'Edit group',
              onPressed: () => _showEditSheet(context, ref, group),
            ),
          // Overflow menu
          _OverflowMenu(
            groupId: groupId,
            isOwner: isOwner,
            onLeave: () => _confirmLeaveGroup(context, ref, group),
            onDelete: () => _confirmDeleteGroup(context, ref, group),
          ),
        ],
      ),
      floatingActionButton: canAddExpenses
          ? FloatingActionButton(
              backgroundColor: AppColors.primary,
              onPressed: () =>
                  _showAddExpenseSheet(context, ref, group, user!.uid),
              child: const Icon(Icons.add, color: Colors.white),
            )
          : null,
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

          // Group Income section (Batch G)
          _GroupIncomeSection(
              groupId: groupId, isOwnerOrAdmin: isOwnerOrAdmin),

          // Group Savings section (Batch G)
          _GroupSavingsSection(
              groupId: groupId, isOwnerOrAdmin: isOwnerOrAdmin),

          // Pending approval section (Batch F) — owners/admins only
          if (isOwnerOrAdmin)
            _PendingApprovalSection(groupId: groupId),

          // Group Expenses section
          const Text('GROUP EXPENSES',
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600,
                  color: AppColors.textSecondary, letterSpacing: 1)),
          const SizedBox(height: 12),

          expensesAsync.when(
            data: (expenses) => expenses.isEmpty
                ? Padding(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    child: Center(
                      child: Column(
                        children: [
                          const Icon(Icons.receipt_long_outlined, size: 32,
                              color: AppColors.textTertiary),
                          const SizedBox(height: 8),
                          const Text('No expenses yet',
                              style: TextStyle(fontSize: 14,
                                  color: AppColors.textSecondary)),
                          if (canAddExpenses) ...[
                            const SizedBox(height: 8),
                            TextButton(
                              onPressed: () => _showAddExpenseSheet(
                                  context, ref, group, user!.uid),
                              child: const Text('Add first expense'),
                            ),
                          ],
                        ],
                      ),
                    ),
                  )
                : Column(
                    children: expenses
                        .map((e) => ExpenseListTile(expense: e))
                        .toList(),
                  ),
            loading: () =>
                const Center(child: CircularProgressIndicator()),
            error: (e, _) => Text('Error loading expenses: $e'),
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

          // Recent activity section (Batch E)
          _RecentActivitySection(groupId: groupId),

          const SizedBox(height: 24),
        ],
      ),
    );
  }

  void _showInviteSheet(
      BuildContext context, WidgetRef ref, GroupModel group) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (_) => _InviteMemberSheet(ref: ref, groupId: group.id),
    );
  }

  void _showEditSheet(
      BuildContext context, WidgetRef ref, GroupModel group) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (_) => _EditGroupSheet(ref: ref, group: group),
    );
  }

  void _showAddExpenseSheet(
      BuildContext context, WidgetRef ref, GroupModel group, String userId) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (_) => _AddGroupExpenseSheet(
        ref: ref,
        groupId: group.id,
        groupName: group.name,
        userId: userId,
      ),
    );
  }

  void _confirmLeaveGroup(
      BuildContext context, WidgetRef ref, GroupModel group) {
    showModalBottomSheet(
      context: context,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.exit_to_app, size: 48,
                  color: AppColors.warning),
              const SizedBox(height: 16),
              const Text('Leave Group?',
                  style: TextStyle(
                      fontSize: 18, fontWeight: FontWeight.w600)),
              const SizedBox(height: 8),
              const Text(
                'You will no longer see this group\'s expenses or be able to add new ones.',
                textAlign: TextAlign.center,
                style: TextStyle(color: AppColors.textSecondary),
              ),
              const SizedBox(height: 24),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Navigator.pop(ctx),
                      child: const Text('Cancel'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.warning),
                      onPressed: () async {
                        Navigator.pop(ctx);
                        try {
                          final user = ref.read(currentUserProvider);
                          await ref
                              .read(groupRepositoryProvider)
                              .leaveGroup(group.id, user!.uid);
                          HapticFeedback.mediumImpact();
                          if (context.mounted) {
                            Navigator.pop(context);
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text('Left ${group.name}'),
                                backgroundColor: AppColors.success,
                              ),
                            );
                          }
                        } catch (e) {
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text('Failed to leave: $e'),
                                backgroundColor: AppColors.error,
                              ),
                            );
                          }
                        }
                      },
                      child: const Text('Leave'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _confirmDeleteGroup(
      BuildContext context, WidgetRef ref, GroupModel group) {
    showModalBottomSheet(
      context: context,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.warning_amber_rounded, size: 48,
                  color: AppColors.error),
              const SizedBox(height: 16),
              const Text('Delete Group?',
                  style: TextStyle(
                      fontSize: 18, fontWeight: FontWeight.w600)),
              const SizedBox(height: 8),
              const Text(
                'This will permanently delete the group and all its data. This cannot be undone.',
                textAlign: TextAlign.center,
                style: TextStyle(color: AppColors.textSecondary),
              ),
              const SizedBox(height: 24),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Navigator.pop(ctx),
                      child: const Text('Cancel'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.error),
                      onPressed: () async {
                        Navigator.pop(ctx);
                        try {
                          final user = ref.read(currentUserProvider);
                          await ref
                              .read(groupRepositoryProvider)
                              .deleteGroup(group.id, user!.uid);
                          HapticFeedback.mediumImpact();
                          if (context.mounted) {
                            Navigator.pop(context);
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text('Deleted ${group.name}'),
                                backgroundColor: AppColors.success,
                              ),
                            );
                          }
                        } catch (e) {
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text('Failed to delete: $e'),
                                backgroundColor: AppColors.error,
                              ),
                            );
                          }
                        }
                      },
                      child: const Text('Delete'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ====== Invite Member Sheet ======

class _InviteMemberSheet extends StatefulWidget {
  const _InviteMemberSheet({required this.ref, required this.groupId});
  final WidgetRef ref;
  final String groupId;

  @override
  State<_InviteMemberSheet> createState() => _InviteMemberSheetState();
}

class _InviteMemberSheetState extends State<_InviteMemberSheet> {
  final _emailController = TextEditingController();
  String _role = 'member';
  bool _sending = false;

  static const _roles = ['admin', 'member', 'viewer'];

  @override
  void dispose() {
    _emailController.dispose();
    super.dispose();
  }

  Future<void> _sendInvite() async {
    final email = _emailController.text.trim();
    if (email.isEmpty || !email.contains('@')) return;

    setState(() => _sending = true);
    try {
      final user = widget.ref.read(currentUserProvider);
      await widget.ref.read(groupRepositoryProvider).inviteMember(
            groupId: widget.groupId,
            email: email,
            role: _role,
            userId: user!.uid,
          );
      HapticFeedback.mediumImpact();
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Invitation sent to $email'),
            backgroundColor: AppColors.success,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to invite: $e'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 24, right: 24, top: 24,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('Invite Member',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600)),
          const SizedBox(height: 20),
          TextField(
            controller: _emailController,
            decoration: const InputDecoration(
              hintText: 'Email address',
              prefixIcon: Icon(Icons.email_outlined),
            ),
            keyboardType: TextInputType.emailAddress,
            textInputAction: TextInputAction.next,
          ),
          const SizedBox(height: 16),
          DropdownButtonFormField<String>(
            initialValue: _role,
            decoration: const InputDecoration(
              labelText: 'Role',
              prefixIcon: Icon(Icons.badge_outlined),
            ),
            items: _roles
                .map((r) => DropdownMenuItem(
                      value: r,
                      child: Text(r[0].toUpperCase() + r.substring(1)),
                    ))
                .toList(),
            onChanged: (v) {
              if (v != null) setState(() => _role = v);
            },
          ),
          const SizedBox(height: 20),
          ElevatedButton(
            onPressed: _sending ? null : _sendInvite,
            child: _sending
                ? const SizedBox(
                    height: 20, width: 20,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Colors.white))
                : const Text('Send Invite'),
          ),
        ],
      ),
    );
  }
}

// ====== Edit Group Sheet ======

class _EditGroupSheet extends StatefulWidget {
  const _EditGroupSheet({required this.ref, required this.group});
  final WidgetRef ref;
  final GroupModel group;

  @override
  State<_EditGroupSheet> createState() => _EditGroupSheetState();
}

class _EditGroupSheetState extends State<_EditGroupSheet> {
  late final TextEditingController _nameController;
  late final TextEditingController _descController;
  late bool _requireApproval;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(text: widget.group.name);
    _descController =
        TextEditingController(text: widget.group.description ?? '');
    _requireApproval = widget.group.settings.requireApproval;
  }

  @override
  void dispose() {
    _nameController.dispose();
    _descController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final name = _nameController.text.trim();
    if (name.isEmpty) return;

    setState(() => _saving = true);
    try {
      final user = widget.ref.read(currentUserProvider);
      await widget.ref.read(groupRepositoryProvider).updateGroup(
            groupId: widget.group.id,
            userId: user!.uid,
            updates: {
              'name': name,
              'description': _descController.text.trim(),
              'settings': {
                ...widget.group.settings.toMap(),
                'requireApproval': _requireApproval,
              },
            },
          );
      HapticFeedback.mediumImpact();
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Group updated'),
            backgroundColor: AppColors.success,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to update: $e'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 24, right: 24, top: 24,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('Edit Group',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600)),
          const SizedBox(height: 20),
          TextField(
            controller: _nameController,
            decoration: const InputDecoration(hintText: 'Group name'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _descController,
            decoration:
                const InputDecoration(hintText: 'Description (optional)'),
            maxLines: 2,
          ),
          const SizedBox(height: 12),
          SwitchListTile(
            title: const Text('Require expense approval',
                style: TextStyle(fontSize: 15)),
            subtitle: const Text('Admins must approve member expenses',
                style: TextStyle(
                    fontSize: 12, color: AppColors.textSecondary)),
            value: _requireApproval,
            onChanged: (v) => setState(() => _requireApproval = v),
            activeTrackColor: AppColors.primary.withValues(alpha: 0.4),
            contentPadding: EdgeInsets.zero,
          ),
          const SizedBox(height: 12),
          ElevatedButton(
            onPressed: _saving ? null : _save,
            child: _saving
                ? const SizedBox(
                    height: 20, width: 20,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Colors.white))
                : const Text('Save Changes'),
          ),
        ],
      ),
    );
  }
}

// ====== Add Group Expense Sheet ======

class _AddGroupExpenseSheet extends StatefulWidget {
  const _AddGroupExpenseSheet({
    required this.ref,
    required this.groupId,
    required this.groupName,
    required this.userId,
  });
  final WidgetRef ref;
  final String groupId;
  final String groupName;
  final String userId;

  @override
  State<_AddGroupExpenseSheet> createState() => _AddGroupExpenseSheetState();
}

class _AddGroupExpenseSheetState extends State<_AddGroupExpenseSheet> {
  final _vendorController = TextEditingController();
  final _amountController = TextEditingController();
  String _category = expenseCategories.first;
  DateTime _date = DateTime.now();
  bool _saving = false;

  @override
  void dispose() {
    _vendorController.dispose();
    _amountController.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime(2020),
      lastDate: DateTime.now(),
    );
    if (picked != null) setState(() => _date = picked);
  }

  Future<void> _save() async {
    final vendor = _vendorController.text.trim();
    final amountText = _amountController.text.trim();
    if (vendor.isEmpty || amountText.isEmpty) return;

    final amount = double.tryParse(amountText);
    if (amount == null || amount <= 0) return;

    setState(() => _saving = true);
    try {
      final dateStr = DateFormat('yyyy-MM-dd').format(_date);
      // Group expenses go through the API for atomic operations
      await widget.ref.read(apiClientProvider).post(
            ApiEndpoints.expenses,
            data: {
              'userId': widget.userId,
              'vendor': vendor,
              'amount': amount,
              'category': _category,
              'date': dateStr,
              'groupId': widget.groupId,
              'expenseType': 'group',
            },
          );
      HapticFeedback.mediumImpact();
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Expense added'),
            backgroundColor: AppColors.success,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to add expense: $e'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 24, right: 24, top: 24,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Add Expense to ${widget.groupName}',
              style:
                  const TextStyle(fontSize: 20, fontWeight: FontWeight.w600)),
          const SizedBox(height: 20),
          TextField(
            controller: _vendorController,
            decoration: const InputDecoration(
              hintText: 'Vendor / merchant',
              prefixIcon: Icon(Icons.store_outlined),
            ),
            textCapitalization: TextCapitalization.words,
            textInputAction: TextInputAction.next,
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _amountController,
            decoration: const InputDecoration(
              hintText: 'Amount',
              prefixIcon: Icon(Icons.attach_money),
            ),
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            textInputAction: TextInputAction.next,
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _category,
            decoration: const InputDecoration(
              labelText: 'Category',
              prefixIcon: Icon(Icons.category_outlined),
            ),
            isExpanded: true,
            items: expenseCategories
                .map((c) => DropdownMenuItem(
                      value: c,
                      child: Text(c,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 14)),
                    ))
                .toList(),
            onChanged: (v) {
              if (v != null) setState(() => _category = v);
            },
          ),
          const SizedBox(height: 12),
          InkWell(
            onTap: _pickDate,
            borderRadius: BorderRadius.circular(12),
            child: InputDecorator(
              decoration: const InputDecoration(
                labelText: 'Date',
                prefixIcon: Icon(Icons.calendar_today_outlined),
              ),
              child: Text(DateFormat('MMM d, yyyy').format(_date)),
            ),
          ),
          const SizedBox(height: 20),
          ElevatedButton(
            onPressed: _saving ? null : _save,
            child: _saving
                ? const SizedBox(
                    height: 20, width: 20,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Colors.white))
                : const Text('Add Expense'),
          ),
        ],
      ),
    );
  }
}

// ====== Shared Widgets ======

class _GroupHeader extends StatelessWidget {
  const _GroupHeader({required this.group});
  final GroupModel group;

  @override
  Widget build(BuildContext context) {
    final icon = group.icon ?? '👥';

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
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
            color: Theme.of(context).cardColor,
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
              backgroundColor: Theme.of(context).cardColor,
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

/// Overflow menu with "Set/Clear Default Group", "Leave", and "Delete" options.
class _OverflowMenu extends ConsumerWidget {
  const _OverflowMenu({
    required this.groupId,
    required this.isOwner,
    this.onLeave,
    this.onDelete,
  });

  final String groupId;
  final bool isOwner;
  final VoidCallback? onLeave;
  final VoidCallback? onDelete;

  Future<void> _setDefaultGroup(BuildContext context, WidgetRef ref) async {
    final user = ref.read(currentUserProvider);
    if (user == null) return;

    try {
      await FirebaseFirestore.instance
          .collection('users')
          .doc(user.uid)
          .set(
        {'preferences': {'defaultGroupId': groupId}},
        SetOptions(merge: true),
      );
      HapticFeedback.mediumImpact();
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Set as default group for new expenses'),
            backgroundColor: AppColors.success,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to set default: $e'),
            backgroundColor: AppColors.error,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    }
  }

  Future<void> _clearDefaultGroup(BuildContext context, WidgetRef ref) async {
    final user = ref.read(currentUserProvider);
    if (user == null) return;

    try {
      await FirebaseFirestore.instance
          .collection('users')
          .doc(user.uid)
          .set(
        {'preferences': {'defaultGroupId': null}},
        SetOptions(merge: true),
      );
      HapticFeedback.mediumImpact();
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Default group cleared'),
            backgroundColor: AppColors.success,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to clear default: $e'),
            backgroundColor: AppColors.error,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final defaultGroupAsync = ref.watch(defaultGroupProvider);
    final isDefault =
        defaultGroupAsync.valueOrNull == groupId;

    return PopupMenuButton<String>(
      icon: const Icon(Icons.more_vert, color: AppColors.textSecondary),
      onSelected: (value) {
        switch (value) {
          case 'set_default':
            _setDefaultGroup(context, ref);
          case 'clear_default':
            _clearDefaultGroup(context, ref);
          case 'leave':
            onLeave?.call();
          case 'delete':
            onDelete?.call();
        }
      },
      itemBuilder: (context) => [
        if (!isDefault)
          const PopupMenuItem(
            value: 'set_default',
            child: Row(
              children: [
                Icon(Icons.star_outline, size: 20,
                    color: AppColors.primary),
                SizedBox(width: 8),
                Text('Set as Default Group'),
              ],
            ),
          ),
        if (isDefault)
          const PopupMenuItem(
            value: 'clear_default',
            child: Row(
              children: [
                Icon(Icons.star_border, size: 20,
                    color: AppColors.textSecondary),
                SizedBox(width: 8),
                Text('Clear Default Group'),
              ],
            ),
          ),
        if (!isOwner)
          const PopupMenuItem(
            value: 'leave',
            child: Row(
              children: [
                Icon(Icons.exit_to_app, size: 20,
                    color: AppColors.warning),
                SizedBox(width: 8),
                Text('Leave Group'),
              ],
            ),
          ),
        if (isOwner)
          const PopupMenuItem(
            value: 'delete',
            child: Row(
              children: [
                Icon(Icons.delete_outline, size: 20,
                    color: AppColors.error),
                SizedBox(width: 8),
                Text('Delete Group',
                    style: TextStyle(color: AppColors.error)),
              ],
            ),
          ),
      ],
    );
  }
}

// ====== Pending Approval Section (Batch F) ======

class _PendingApprovalSection extends ConsumerWidget {
  const _PendingApprovalSection({required this.groupId});
  final String groupId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pendingAsync = ref.watch(pendingGroupExpensesProvider(groupId));
    return pendingAsync.when(
      data: (pending) {
        if (pending.isEmpty) return const SizedBox.shrink();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('PENDING APPROVAL (${pending.length})',
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600,
                    color: AppColors.warning, letterSpacing: 1)),
            const SizedBox(height: 12),
            ...pending.map((e) => _PendingExpenseTile(expense: e)),
            const SizedBox(height: 24),
          ],
        );
      },
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
    );
  }
}

class _PendingExpenseTile extends ConsumerWidget {
  const _PendingExpenseTile({required this.expense});
  final ExpenseModel expense;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final formatter = NumberFormat.currency(symbol: '\$', decimalDigits: 2);
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.warning.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.warning.withValues(alpha: 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(expense.vendor,
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
              ),
              Text(formatter.format(expense.amount),
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
            ],
          ),
          const SizedBox(height: 4),
          Text('${expense.category} • ${DateFormat('MMM d').format(expense.date.toDate())}',
              style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () => _reject(context, ref),
                  style: OutlinedButton.styleFrom(
                    side: const BorderSide(color: AppColors.error),
                    foregroundColor: AppColors.error,
                  ),
                  child: const Text('Reject'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: ElevatedButton(
                  onPressed: () => _approve(context, ref),
                  style: ElevatedButton.styleFrom(backgroundColor: AppColors.success),
                  child: const Text('Approve'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _approve(BuildContext context, WidgetRef ref) async {
    try {
      final user = ref.read(currentUserProvider);
      if (user == null) return;
      await ref.read(expenseRepositoryProvider).approveExpense(
          expenseId: expense.id, userId: user.uid);
      HapticFeedback.mediumImpact();
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Expense approved'),
              backgroundColor: AppColors.success, behavior: SnackBarBehavior.floating),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed: $e'),
              backgroundColor: AppColors.error),
        );
      }
    }
  }

  Future<void> _reject(BuildContext context, WidgetRef ref) async {
    final reason = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => _RejectReasonSheet(),
    );
    if (reason == null) return;
    try {
      final user = ref.read(currentUserProvider);
      if (user == null) return;
      await ref.read(expenseRepositoryProvider).rejectExpense(
          expenseId: expense.id, userId: user.uid, reason: reason.isEmpty ? null : reason);
      HapticFeedback.mediumImpact();
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Expense rejected'),
              backgroundColor: AppColors.warning, behavior: SnackBarBehavior.floating),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed: $e'), backgroundColor: AppColors.error),
        );
      }
    }
  }
}

class _RejectReasonSheet extends StatefulWidget {
  @override
  State<_RejectReasonSheet> createState() => _RejectReasonSheetState();
}

class _RejectReasonSheetState extends State<_RejectReasonSheet> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 24, right: 24, top: 24,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('Reject Expense',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
          const SizedBox(height: 12),
          TextField(
            controller: _controller,
            decoration: const InputDecoration(hintText: 'Reason (optional)'),
            maxLines: 2,
          ),
          const SizedBox(height: 16),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, _controller.text.trim()),
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.error),
            child: const Text('Reject'),
          ),
        ],
      ),
    );
  }
}

// ====== Recent Activity Section (Batch E) ======

class _RecentActivitySection extends ConsumerWidget {
  const _RecentActivitySection({required this.groupId});
  final String groupId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final activitiesAsync = ref.watch(groupActivitiesProvider(groupId));
    return activitiesAsync.when(
      data: (activities) {
        if (activities.isEmpty) return const SizedBox.shrink();
        final recent = activities.take(10).toList();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 24),
            const Text('RECENT ACTIVITY',
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600,
                    color: AppColors.textSecondary, letterSpacing: 1)),
            const SizedBox(height: 12),
            ...recent.map((a) => _ActivityTile(activity: a)),
          ],
        );
      },
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
    );
  }
}

class _ActivityTile extends StatelessWidget {
  const _ActivityTile({required this.activity});
  final GroupActivityModel activity;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          Text(activity.icon, style: const TextStyle(fontSize: 20)),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              activity.displayText,
              style: const TextStyle(fontSize: 13, color: AppColors.textPrimary),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          Text(activity.timeAgo,
              style: const TextStyle(fontSize: 11, color: AppColors.textSecondary)),
        ],
      ),
    );
  }
}

// ====== Group Income Section (Batch G) ======

class _GroupIncomeSection extends ConsumerWidget {
  const _GroupIncomeSection({
    required this.groupId,
    required this.isOwnerOrAdmin,
  });
  final String groupId;
  final bool isOwnerOrAdmin;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sourcesAsync = ref.watch(groupIncomeSourcesProvider(groupId));
    final totalMonthly = ref.watch(totalGroupMonthlyIncomeProvider(groupId));
    final formatter = NumberFormat.currency(symbol: '\$', decimalDigits: 0);

    return sourcesAsync.when(
      data: (sources) {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Expanded(
                  child: Text('GROUP INCOME',
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600,
                          color: AppColors.textSecondary, letterSpacing: 1)),
                ),
                if (sources.isNotEmpty)
                  Text('${formatter.format(totalMonthly)}/mo',
                      style: const TextStyle(fontSize: 12,
                          fontWeight: FontWeight.w600, color: AppColors.success)),
                if (isOwnerOrAdmin) ...[
                  const SizedBox(width: 8),
                  GestureDetector(
                    onTap: () => _showAddIncomeSheet(context, ref),
                    child: const Icon(Icons.add_circle_outline,
                        size: 20, color: AppColors.primary),
                  ),
                ],
              ],
            ),
            const SizedBox(height: 12),
            if (sources.isEmpty)
              Padding(
                padding: const EdgeInsets.only(bottom: 24),
                child: Text('No income sources yet',
                    style: TextStyle(fontSize: 13,
                        color: AppColors.textSecondary)),
              )
            else ...[
              ...sources.map((s) => _GroupIncomeTile(source: s)),
              const SizedBox(height: 24),
            ],
          ],
        );
      },
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
    );
  }

  void _showAddIncomeSheet(BuildContext context, WidgetRef ref) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (_) => _AddGroupIncomeSheet(ref: ref, groupId: groupId),
    );
  }
}

class _GroupIncomeTile extends StatelessWidget {
  const _GroupIncomeTile({required this.source});
  final GroupIncomeSourceModel source;

  @override
  Widget build(BuildContext context) {
    final formatter = NumberFormat.currency(symbol: '\$', decimalDigits: 0);
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Container(
            width: 36, height: 36,
            decoration: BoxDecoration(
              color: AppColors.success.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Center(
              child: Icon(Icons.trending_up, size: 18, color: AppColors.success),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(source.name,
                    style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                Text('${source.category} • ${source.frequencyLabel}',
                    style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
              ],
            ),
          ),
          Text(formatter.format(source.amount),
              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700,
                  color: AppColors.success)),
        ],
      ),
    );
  }
}

class _AddGroupIncomeSheet extends StatefulWidget {
  const _AddGroupIncomeSheet({required this.ref, required this.groupId});
  final WidgetRef ref;
  final String groupId;

  @override
  State<_AddGroupIncomeSheet> createState() => _AddGroupIncomeSheetState();
}

class _AddGroupIncomeSheetState extends State<_AddGroupIncomeSheet> {
  final _nameController = TextEditingController();
  final _amountController = TextEditingController();
  String _category = 'salary';
  String _frequency = 'monthly';
  bool _isRecurring = true;
  bool _taxable = true;
  bool _saving = false;

  static const _categories = [
    'salary', 'freelance', 'bonus', 'investment',
    'rental', 'side_hustle', 'gift', 'other',
  ];
  static const _frequencies = ['monthly', 'biweekly', 'weekly', 'yearly', 'once'];

  @override
  void dispose() {
    _nameController.dispose();
    _amountController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final name = _nameController.text.trim();
    final amountText = _amountController.text.trim();
    if (name.isEmpty || amountText.isEmpty) return;
    final amount = double.tryParse(amountText);
    if (amount == null || amount <= 0) return;

    setState(() => _saving = true);
    try {
      final user = widget.ref.read(currentUserProvider);
      if (user == null) return;
      await widget.ref.read(groupIncomeRepositoryProvider).createGroupIncomeSource(
        groupId: widget.groupId,
        addedBy: user.uid,
        name: name,
        category: _category,
        amount: amount,
        frequency: _frequency,
        isRecurring: _isRecurring,
        taxable: _taxable,
      );
      HapticFeedback.mediumImpact();
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Income source added'),
              backgroundColor: AppColors.success, behavior: SnackBarBehavior.floating),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed: $e'), backgroundColor: AppColors.error),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 24, right: 24, top: 24,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('Add Group Income',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600)),
          const SizedBox(height: 20),
          TextField(
            controller: _nameController,
            decoration: const InputDecoration(
              hintText: 'Income name',
              prefixIcon: Icon(Icons.label_outline),
            ),
            textCapitalization: TextCapitalization.words,
            textInputAction: TextInputAction.next,
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _amountController,
            decoration: const InputDecoration(
              hintText: 'Amount',
              prefixIcon: Icon(Icons.attach_money),
            ),
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            textInputAction: TextInputAction.next,
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _category,
            decoration: const InputDecoration(
              labelText: 'Category',
              prefixIcon: Icon(Icons.category_outlined),
            ),
            items: _categories
                .map((c) => DropdownMenuItem(value: c,
                    child: Text(c[0].toUpperCase() + c.substring(1).replaceAll('_', ' '))))
                .toList(),
            onChanged: (v) { if (v != null) setState(() => _category = v); },
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _frequency,
            decoration: const InputDecoration(
              labelText: 'Frequency',
              prefixIcon: Icon(Icons.repeat),
            ),
            items: _frequencies
                .map((f) => DropdownMenuItem(value: f,
                    child: Text(f[0].toUpperCase() + f.substring(1))))
                .toList(),
            onChanged: (v) { if (v != null) setState(() => _frequency = v); },
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: SwitchListTile(
                  title: const Text('Recurring', style: TextStyle(fontSize: 14)),
                  value: _isRecurring,
                  onChanged: (v) => setState(() => _isRecurring = v),
                  contentPadding: EdgeInsets.zero,
                  dense: true,
                ),
              ),
              Expanded(
                child: SwitchListTile(
                  title: const Text('Taxable', style: TextStyle(fontSize: 14)),
                  value: _taxable,
                  onChanged: (v) => setState(() => _taxable = v),
                  contentPadding: EdgeInsets.zero,
                  dense: true,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          ElevatedButton(
            onPressed: _saving ? null : _save,
            child: _saving
                ? const SizedBox(height: 20, width: 20,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Text('Add Income Source'),
          ),
        ],
      ),
    );
  }
}

// ====== Group Savings Section (Batch G) ======

class _GroupSavingsSection extends ConsumerWidget {
  const _GroupSavingsSection({
    required this.groupId,
    required this.isOwnerOrAdmin,
  });
  final String groupId;
  final bool isOwnerOrAdmin;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final goalsAsync = ref.watch(groupSavingsGoalsProvider(groupId));
    final totalSaved = ref.watch(groupTotalSavedProvider(groupId));
    final totalTarget = ref.watch(groupTotalTargetProvider(groupId));
    final formatter = NumberFormat.currency(symbol: '\$', decimalDigits: 0);

    return goalsAsync.when(
      data: (goals) {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Expanded(
                  child: Text('GROUP SAVINGS',
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600,
                          color: AppColors.textSecondary, letterSpacing: 1)),
                ),
                if (goals.isNotEmpty)
                  Text('${formatter.format(totalSaved)} / ${formatter.format(totalTarget)}',
                      style: const TextStyle(fontSize: 12,
                          fontWeight: FontWeight.w600, color: AppColors.primary)),
                if (isOwnerOrAdmin) ...[
                  const SizedBox(width: 8),
                  GestureDetector(
                    onTap: () => _showAddSavingsSheet(context, ref),
                    child: const Icon(Icons.add_circle_outline,
                        size: 20, color: AppColors.primary),
                  ),
                ],
              ],
            ),
            const SizedBox(height: 12),
            if (goals.isEmpty)
              Padding(
                padding: const EdgeInsets.only(bottom: 24),
                child: Text('No savings goals yet',
                    style: TextStyle(fontSize: 13,
                        color: AppColors.textSecondary)),
              )
            else ...[
              ...goals.map((g) => _GroupSavingsGoalCard(goal: g)),
              const SizedBox(height: 24),
            ],
          ],
        );
      },
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
    );
  }

  void _showAddSavingsSheet(BuildContext context, WidgetRef ref) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (_) => _AddGroupSavingsSheet(ref: ref, groupId: groupId),
    );
  }
}

class _GroupSavingsGoalCard extends StatelessWidget {
  const _GroupSavingsGoalCard({required this.goal});
  final GroupSavingsGoalModel goal;

  @override
  Widget build(BuildContext context) {
    final formatter = NumberFormat.currency(symbol: '\$', decimalDigits: 0);
    final progress = goal.computedProgress;
    final emoji = goal.emoji ?? goal.defaultEmoji;

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(emoji, style: const TextStyle(fontSize: 22)),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(goal.name,
                        style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                    Text('${formatter.format(goal.currentAmount)} of ${formatter.format(goal.targetAmount)}',
                        style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                  ],
                ),
              ),
              Text('${progress.toStringAsFixed(0)}%',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700,
                      color: progress >= 100 ? AppColors.success : AppColors.primary)),
            ],
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: progress / 100,
              backgroundColor: AppColors.divider,
              color: progress >= 100 ? AppColors.success : AppColors.primary,
              minHeight: 6,
            ),
          ),
          if (goal.monthlyContribution > 0) ...[
            const SizedBox(height: 6),
            Text('${formatter.format(goal.monthlyContribution)}/mo contribution',
                style: const TextStyle(fontSize: 11, color: AppColors.textSecondary)),
          ],
        ],
      ),
    );
  }
}

class _AddGroupSavingsSheet extends StatefulWidget {
  const _AddGroupSavingsSheet({required this.ref, required this.groupId});
  final WidgetRef ref;
  final String groupId;

  @override
  State<_AddGroupSavingsSheet> createState() => _AddGroupSavingsSheetState();
}

class _AddGroupSavingsSheetState extends State<_AddGroupSavingsSheet> {
  final _nameController = TextEditingController();
  final _targetController = TextEditingController();
  final _contributionController = TextEditingController();
  String _category = 'custom';
  String _priority = 'medium';
  bool _saving = false;

  static const _categories = [
    'emergency_fund', 'travel', 'education', 'health',
    'house_down_payment', 'car', 'wedding', 'retirement',
    'investment', 'custom',
  ];
  static const _priorities = ['low', 'medium', 'high', 'critical'];

  @override
  void dispose() {
    _nameController.dispose();
    _targetController.dispose();
    _contributionController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final name = _nameController.text.trim();
    final targetText = _targetController.text.trim();
    final contribText = _contributionController.text.trim();
    if (name.isEmpty || targetText.isEmpty) return;
    final target = double.tryParse(targetText);
    if (target == null || target <= 0) return;
    final contribution = double.tryParse(contribText) ?? 0;

    setState(() => _saving = true);
    try {
      final user = widget.ref.read(currentUserProvider);
      if (user == null) return;
      await widget.ref.read(groupSavingsRepositoryProvider).createGroupSavingsGoal(
        groupId: widget.groupId,
        createdBy: user.uid,
        name: name,
        category: _category,
        targetAmount: target,
        monthlyContribution: contribution,
        priority: _priority,
      );
      HapticFeedback.mediumImpact();
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Savings goal created'),
              backgroundColor: AppColors.success, behavior: SnackBarBehavior.floating),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed: $e'), backgroundColor: AppColors.error),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 24, right: 24, top: 24,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('Add Savings Goal',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600)),
          const SizedBox(height: 20),
          TextField(
            controller: _nameController,
            decoration: const InputDecoration(
              hintText: 'Goal name',
              prefixIcon: Icon(Icons.flag_outlined),
            ),
            textCapitalization: TextCapitalization.words,
            textInputAction: TextInputAction.next,
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _targetController,
            decoration: const InputDecoration(
              hintText: 'Target amount',
              prefixIcon: Icon(Icons.attach_money),
            ),
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            textInputAction: TextInputAction.next,
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _contributionController,
            decoration: const InputDecoration(
              hintText: 'Monthly contribution (optional)',
              prefixIcon: Icon(Icons.savings_outlined),
            ),
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            textInputAction: TextInputAction.next,
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _category,
            decoration: const InputDecoration(
              labelText: 'Category',
              prefixIcon: Icon(Icons.category_outlined),
            ),
            isExpanded: true,
            items: _categories
                .map((c) => DropdownMenuItem(value: c,
                    child: Text(c[0].toUpperCase() + c.substring(1).replaceAll('_', ' '),
                        overflow: TextOverflow.ellipsis)))
                .toList(),
            onChanged: (v) { if (v != null) setState(() => _category = v); },
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _priority,
            decoration: const InputDecoration(
              labelText: 'Priority',
              prefixIcon: Icon(Icons.priority_high),
            ),
            items: _priorities
                .map((p) => DropdownMenuItem(value: p,
                    child: Text(p[0].toUpperCase() + p.substring(1))))
                .toList(),
            onChanged: (v) { if (v != null) setState(() => _priority = v); },
          ),
          const SizedBox(height: 16),
          ElevatedButton(
            onPressed: _saving ? null : _save,
            child: _saving
                ? const SizedBox(height: 20, width: 20,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Text('Create Goal'),
          ),
        ],
      ),
    );
  }
}
