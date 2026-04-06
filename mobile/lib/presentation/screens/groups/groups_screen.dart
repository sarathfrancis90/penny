import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:penny_mobile/core/constants/app_colors.dart';
import 'package:penny_mobile/data/models/group_model.dart';
import 'package:penny_mobile/presentation/providers/auth_provider.dart';
import 'package:penny_mobile/presentation/providers/group_providers.dart';
import 'package:penny_mobile/presentation/providers/providers.dart';
import 'package:go_router/go_router.dart';
import 'package:penny_mobile/presentation/widgets/animated_list_item.dart';
import 'package:penny_mobile/presentation/widgets/shimmer_loading.dart';
import 'package:penny_mobile/presentation/widgets/error_state.dart';

class GroupsScreen extends ConsumerWidget {
  const GroupsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final groupsAsync = ref.watch(userGroupsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Groups'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add, color: AppColors.primary),
            tooltip: 'Create group',
            onPressed: () => _showCreateGroup(context, ref),
          ),
        ],
      ),
      body: groupsAsync.when(
        data: (groups) => groups.isEmpty
            ? _EmptyState(onAdd: () => _showCreateGroup(context, ref))
            : _GroupList(groups: groups),
        loading: () => ListView(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          children: const [
            ShimmerContentCard(height: 80),
            ShimmerContentCard(height: 80),
            ShimmerContentCard(height: 80),
          ],
        ),
        error: (e, _) => ErrorState(
          message: 'Could not load groups',
          onRetry: () => ref.invalidate(userGroupsProvider),
        ),
      ),
    );
  }

  void _showCreateGroup(BuildContext context, WidgetRef ref) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (_) => _CreateGroupSheet(ref: ref),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.onAdd});
  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.group_outlined, size: 48,
                color: Theme.of(context).hintColor),
            const SizedBox(height: 12),
            Text('No groups yet',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600,
                    color: Theme.of(context).colorScheme.onSurfaceVariant)),
            const SizedBox(height: 4),
            Text('Create a group to share expenses\nwith family or team members',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 14, color: Theme.of(context).hintColor)),
            const SizedBox(height: 16),
            ElevatedButton.icon(
              onPressed: onAdd,
              icon: const Icon(Icons.add, size: 18),
              label: const Text('Create Group'),
            ),
          ],
        ),
      ),
    );
  }
}

class _GroupList extends ConsumerWidget {
  const _GroupList({required this.groups});
  final List<GroupModel> groups;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(userGroupsProvider),
      child: ListView.builder(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        itemCount: groups.length,
        itemBuilder: (context, index) => AnimatedListItem(
          index: index,
          child: _GroupCard(group: groups[index]),
        ),
      ),
    );
  }
}

class _GroupCard extends StatelessWidget {
  const _GroupCard({required this.group});
  final GroupModel group;

  @override
  Widget build(BuildContext context) {
    final formatter = NumberFormat.currency(symbol: '\$', decimalDigits: 0);
    final icon = group.icon ?? '👥';

    return Semantics(
      button: true,
      label: 'Group: ${group.name}, '
          '${group.stats.memberCount} members, '
          'total ${formatter.format(group.stats.totalAmount)}',
      child: InkWell(
        onTap: () {
          context.push('/groups/${group.id}');
        },
        borderRadius: BorderRadius.circular(12),
        child: Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Theme.of(context).cardColor,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            children: [
              // Group icon
              Hero(
                tag: 'group-icon-${group.id}',
                child: Container(
                  width: 48, height: 48,
                  decoration: BoxDecoration(
                    color: _parseColor(group.color, context),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Center(
                    child: Text(icon, style: const TextStyle(fontSize: 24)),
                  ),
                ),
              ),
              const SizedBox(width: 12),

              // Group info
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
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
                                fontSize: 16, fontWeight: FontWeight.w600)),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        Icon(Icons.people_outline, size: 14,
                            color: Theme.of(context).colorScheme.onSurfaceVariant),
                        const SizedBox(width: 4),
                        Text('${group.stats.memberCount} members',
                            style: TextStyle(
                                fontSize: 13, color: Theme.of(context).colorScheme.onSurfaceVariant)),
                        const SizedBox(width: 12),
                        Text(formatter.format(group.stats.totalAmount),
                            style: TextStyle(
                                fontSize: 13, fontWeight: FontWeight.w600,
                                color: Theme.of(context).colorScheme.onSurfaceVariant)),
                      ],
                    ),
                  ],
                ),
              ),

              Icon(Icons.chevron_right, color: Theme.of(context).hintColor),
            ],
          ),
        ),
      ),
    );
  }

  Color _parseColor(String? hex, BuildContext context) {
    if (hex == null || hex.isEmpty) return Theme.of(context).cardColor;
    try {
      return Color(int.parse(hex.replaceFirst('#', '0xFF')))
          .withValues(alpha: 0.15);
    } catch (_) {
      return Theme.of(context).cardColor;
    }
  }
}

class _CreateGroupSheet extends StatefulWidget {
  const _CreateGroupSheet({required this.ref});
  final WidgetRef ref;

  @override
  State<_CreateGroupSheet> createState() => _CreateGroupSheetState();
}

class _CreateGroupSheetState extends State<_CreateGroupSheet> {
  final _nameController = TextEditingController();
  final _descController = TextEditingController();
  String _icon = '👥';
  bool _requireApproval = false;
  bool _saving = false;

  static const _icons = ['👥', '👨‍👩‍👧‍👦', '🏢', '🏠', '✈️', '🎯', '💼', '🎉'];

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
      await widget.ref.read(groupRepositoryProvider).createGroup(
            userId: user!.uid,
            name: name,
            description: _descController.text.trim(),
            icon: _icon,
            requireApproval: _requireApproval,
            userEmail: user.email,
            userName: user.displayName,
          );
      HapticFeedback.mediumImpact();
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed: $e'),
              backgroundColor: AppColors.error),
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
          const Text('Create Group',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600)),
          const SizedBox(height: 20),

          // Icon picker
          Wrap(
            spacing: 8,
            children: _icons.map((icon) {
              final selected = icon == _icon;
              return Semantics(
                button: true,
                label: 'Group icon: $icon${selected ? ', selected' : ''}',
                child: GestureDetector(
                  onTap: () => setState(() => _icon = icon),
                  child: Container(
                    width: 44, height: 44,
                    decoration: BoxDecoration(
                      color: selected
                          ? AppColors.primary.withValues(alpha: 0.1)
                          : Theme.of(context).cardColor,
                      borderRadius: BorderRadius.circular(10),
                      border: selected
                          ? Border.all(color: AppColors.primary, width: 2)
                          : null,
                    ),
                    child: Center(
                        child: Text(icon, style: const TextStyle(fontSize: 22))),
                  ),
                ),
              );
            }).toList(),
          ),
          const SizedBox(height: 16),

          TextField(
            controller: _nameController,
            decoration: const InputDecoration(hintText: 'Group name'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _descController,
            decoration: const InputDecoration(
                hintText: 'Description (optional)'),
            maxLines: 2,
          ),
          const SizedBox(height: 12),
          SwitchListTile(
            title: const Text('Require expense approval',
                style: TextStyle(fontSize: 15)),
            subtitle: Text('Admins must approve member expenses',
                style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant)),
            value: _requireApproval,
            onChanged: (v) => setState(() => _requireApproval = v),
            activeColor: AppColors.primary,
            contentPadding: EdgeInsets.zero,
          ),
          const SizedBox(height: 12),
          ElevatedButton(
            onPressed: _saving ? null : _save,
            child: _saving
                ? const SizedBox(height: 20, width: 20,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Colors.white))
                : const Text('Create Group'),
          ),
        ],
      ),
    );
  }
}
