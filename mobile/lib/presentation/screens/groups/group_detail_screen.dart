import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:penny_mobile/core/constants/app_colors.dart';
import 'package:penny_mobile/core/constants/categories.dart';
import 'package:penny_mobile/core/network/api_endpoints.dart';
import 'package:penny_mobile/data/models/group_member_model.dart';
import 'package:penny_mobile/data/models/group_model.dart';
import 'package:penny_mobile/presentation/providers/auth_provider.dart';
import 'package:penny_mobile/presentation/providers/group_providers.dart';
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
          PopupMenuButton<String>(
            icon: const Icon(Icons.more_vert, color: AppColors.textSecondary),
            onSelected: (value) {
              if (value == 'leave') {
                _confirmLeaveGroup(context, ref, group);
              } else if (value == 'delete') {
                _confirmDeleteGroup(context, ref, group);
              }
            },
            itemBuilder: (context) => [
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
