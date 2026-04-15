import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:shimmer/shimmer.dart';
import 'package:penny_mobile/core/constants/app_colors.dart';
import 'package:penny_mobile/data/models/budget_model.dart';
import 'package:penny_mobile/presentation/providers/guest_provider.dart';
import 'package:penny_mobile/presentation/providers/income_providers.dart';
import 'package:penny_mobile/presentation/providers/budget_providers.dart';
import 'package:penny_mobile/presentation/providers/savings_providers.dart';
import 'package:penny_mobile/presentation/widgets/guest_sign_up_prompt.dart';

class FinancesScreen extends ConsumerWidget {
  const FinancesScreen({super.key});

  static final _currencyFormat =
      NumberFormat.currency(symbol: '\$', decimalDigits: 0);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isGuest = ref.watch(guestModeProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Finances')),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(incomeSourcesProvider);
          ref.invalidate(budgetsProvider);
          ref.invalidate(savingsGoalsProvider);
          HapticFeedback.lightImpact();
        },
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          children: [
            const SizedBox(height: 8),
            if (isGuest)
              _GuestLockedSection(
                title: 'Income',
                icon: Icons.account_balance_outlined,
                iconColor: AppColors.success,
                description: 'Track your salary, freelance income, and side hustles.',
              )
            else
              _IncomeSection(currencyFormat: _currencyFormat),
            const SizedBox(height: 12),
            _BudgetsSection(currencyFormat: _currencyFormat),
            const SizedBox(height: 12),
            if (isGuest)
              _GuestLockedSection(
                title: 'Savings',
                icon: Icons.savings_outlined,
                iconColor: AppColors.primary,
                description: 'Set savings goals and track your progress toward them.',
              )
            else
              _SavingsSection(currencyFormat: _currencyFormat),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }
}

// =============================================================================
// Income Section
// =============================================================================

class _IncomeSection extends ConsumerWidget {
  const _IncomeSection({required this.currencyFormat});

  final NumberFormat currencyFormat;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final incomesAsync = ref.watch(incomeSourcesProvider);
    final activeSources = ref.watch(activeIncomeSourcesProvider);
    final totalMonthly = ref.watch(totalMonthlyIncomeProvider);

    return incomesAsync.when(
      loading: () => _FinanceSectionCard(
        title: 'Income',
        icon: Icons.account_balance_outlined,
        iconColor: AppColors.success,
        summary: '',
        details: '',
        isEmpty: false,
        isLoading: true,
        emptyLabel: '',
        onManage: () {},
        manageLabel: 'Manage Income',
      ),
      error: (_, _) => _FinanceSectionCard(
        title: 'Income',
        icon: Icons.account_balance_outlined,
        iconColor: AppColors.success,
        summary: 'Error loading',
        details: 'Tap to retry',
        isEmpty: true,
        emptyLabel: 'Could not load income sources',
        onManage: () => ref.invalidate(incomeSourcesProvider),
        manageLabel: 'Retry',
      ),
      data: (sources) {
        final isEmpty = sources.isEmpty;

        return _FinanceSectionCard(
          title: 'Income',
          icon: Icons.account_balance_outlined,
          iconColor: AppColors.success,
          summary:
              isEmpty ? '' : '${currencyFormat.format(totalMonthly)}/mo',
          details: isEmpty
              ? ''
              : '${activeSources.length} active source${activeSources.length == 1 ? '' : 's'}',
          isEmpty: isEmpty,
          emptyLabel: 'No income sources yet',
          onManage: () {
            if (ref.read(guestModeProvider)) { showGuestSignUpPrompt(context); return; }
            context.push('/income');
          },
          manageLabel: isEmpty ? 'Add Income' : 'Manage Income',
          overflowCount:
              activeSources.length > 3 ? activeSources.length - 3 : 0,
          children: activeSources.take(3).map((source) {
            return _PreviewRow(
              leading: Text(
                source.name,
                style: TextStyle(
                  fontSize: 14,
                  color: Theme.of(context).colorScheme.onSurface,
                ),
                overflow: TextOverflow.ellipsis,
              ),
              trailing: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    source.frequencyLabel,
                    style: TextStyle(
                      fontSize: 12,
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    currencyFormat.format(source.amount),
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: Theme.of(context).colorScheme.onSurface,
                    ),
                  ),
                ],
              ),
            );
          }).toList(),
        );
      },
    );
  }
}

// =============================================================================
// Budgets Section
// =============================================================================

class _BudgetsSection extends ConsumerWidget {
  const _BudgetsSection({required this.currencyFormat});

  final NumberFormat currencyFormat;

  Color _barColor(BudgetStatus status) => switch (status) {
        BudgetStatus.safe => AppColors.primary,
        BudgetStatus.warning => AppColors.warning,
        BudgetStatus.critical => AppColors.error,
        BudgetStatus.over => AppColors.error,
      };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final budgetsAsync = ref.watch(budgetsProvider);
    final usage = ref.watch(budgetUsageProvider);
    final totalLimit = ref.watch(totalBudgetLimitProvider);
    final totalSpent = ref.watch(totalBudgetSpentProvider);

    return budgetsAsync.when(
      loading: () => _FinanceSectionCard(
        title: 'Budgets',
        icon: Icons.account_balance_wallet_outlined,
        iconColor: AppColors.primary,
        summary: '',
        details: '',
        isEmpty: false,
        isLoading: true,
        emptyLabel: '',
        onManage: () {},
        manageLabel: 'Manage Budgets',
        defaultExpanded: true,
      ),
      error: (_, _) => _FinanceSectionCard(
        title: 'Budgets',
        icon: Icons.account_balance_wallet_outlined,
        iconColor: AppColors.primary,
        summary: 'Error loading',
        details: 'Tap to retry',
        isEmpty: true,
        emptyLabel: 'Could not load budgets',
        onManage: () => ref.invalidate(budgetsProvider),
        manageLabel: 'Retry',
        defaultExpanded: true,
      ),
      data: (budgets) {
        final isEmpty = budgets.isEmpty;
        final isGuest = ref.read(guestModeProvider);

        return _FinanceSectionCard(
          title: 'Budgets',
          icon: Icons.account_balance_wallet_outlined,
          iconColor: AppColors.primary,
          summary: isEmpty
              ? ''
              : isGuest
                  ? 'Preview'
                  : '${currencyFormat.format(totalLimit)} allocated',
          details: isEmpty
              ? ''
              : isGuest
                  ? 'Sample budgets based on your expense categories'
                  : '${currencyFormat.format(totalSpent)} spent \u00b7 ${usage.length} categor${usage.length == 1 ? 'y' : 'ies'}',
          isEmpty: isEmpty,
          emptyLabel: 'No budgets yet',
          onManage: () {
            if (isGuest) { showGuestSignUpPrompt(context); return; }
            context.push('/budgets');
          },
          manageLabel: isGuest ? 'Sign Up to Create Budgets' : (isEmpty ? 'Create Budget' : 'Manage Budgets'),
          defaultExpanded: true,
          overflowCount: usage.length > 3 ? usage.length - 3 : 0,
          children: usage.take(3).map((u) {
            final label = _shortenCategory(u.category);
            return Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          label,
                          style: TextStyle(
                            fontSize: 14,
                            color: Theme.of(context).colorScheme.onSurface,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      Text(
                        '${currencyFormat.format(u.totalSpent)}/${currencyFormat.format(u.budgetLimit)}',
                        style: TextStyle(
                          fontSize: 12,
                          color:
                              Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(3),
                    child: LinearProgressIndicator(
                      value: (u.percentageUsed / 100).clamp(0.0, 1.0),
                      minHeight: 6,
                      backgroundColor: Theme.of(context).dividerColor,
                      valueColor:
                          AlwaysStoppedAnimation<Color>(_barColor(u.status)),
                    ),
                  ),
                ],
              ),
            );
          }).toList(),
        );
      },
    );
  }

  String _shortenCategory(String category) {
    if (category.startsWith('Home Office - ')) {
      return category.replaceFirst('Home Office - ', 'Home: ');
    }
    if (category.startsWith('Vehicle - ')) {
      return category.replaceFirst('Vehicle - ', 'Vehicle: ');
    }
    final parenIndex = category.indexOf('(');
    if (parenIndex > 0) return category.substring(0, parenIndex).trim();
    return category;
  }
}

// =============================================================================
// Savings Section
// =============================================================================

class _SavingsSection extends ConsumerWidget {
  const _SavingsSection({required this.currencyFormat});

  final NumberFormat currencyFormat;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final goalsAsync = ref.watch(savingsGoalsProvider);
    final totalSaved = ref.watch(totalSavedProvider);
    final totalTarget = ref.watch(totalTargetProvider);

    return goalsAsync.when(
      loading: () => _FinanceSectionCard(
        title: 'Savings',
        icon: Icons.savings_outlined,
        iconColor: AppColors.primary,
        summary: '',
        details: '',
        isEmpty: false,
        isLoading: true,
        emptyLabel: '',
        onManage: () {},
        manageLabel: 'Manage Savings',
      ),
      error: (_, _) => _FinanceSectionCard(
        title: 'Savings',
        icon: Icons.savings_outlined,
        iconColor: AppColors.primary,
        summary: 'Error loading',
        details: 'Tap to retry',
        isEmpty: true,
        emptyLabel: 'Could not load savings goals',
        onManage: () => ref.invalidate(savingsGoalsProvider),
        manageLabel: 'Retry',
      ),
      data: (goals) {
        final isEmpty = goals.isEmpty;
        final activeGoals =
            goals.where((g) => g.status == 'active').toList();
        final progressPercent =
            totalTarget > 0 ? (totalSaved / totalTarget * 100) : 0.0;

        return _FinanceSectionCard(
          title: 'Savings',
          icon: Icons.savings_outlined,
          iconColor: AppColors.primary,
          summary: isEmpty
              ? ''
              : '${currencyFormat.format(totalSaved)} saved',
          details: isEmpty
              ? ''
              : '${progressPercent.toStringAsFixed(0)}% progress \u00b7 ${activeGoals.length} goal${activeGoals.length == 1 ? '' : 's'}',
          isEmpty: isEmpty,
          emptyLabel: 'No savings goals yet',
          onManage: () {
            if (ref.read(guestModeProvider)) { showGuestSignUpPrompt(context); return; }
            context.push('/savings');
          },
          manageLabel: isEmpty ? 'Add Goal' : 'Manage Savings',
          overflowCount:
              activeGoals.length > 3 ? activeGoals.length - 3 : 0,
          children: activeGoals.take(3).map((goal) {
            final goalProgress = goal.targetAmount > 0
                ? (goal.currentAmount / goal.targetAmount).clamp(0.0, 1.0)
                : 0.0;
            return Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(
                        goal.emoji ?? goal.defaultEmoji,
                        style: const TextStyle(fontSize: 16),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          goal.name,
                          style: TextStyle(
                            fontSize: 14,
                            color: Theme.of(context).colorScheme.onSurface,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      Text(
                        '${currencyFormat.format(goal.currentAmount)}/${currencyFormat.format(goal.targetAmount)}',
                        style: TextStyle(
                          fontSize: 12,
                          color:
                              Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(3),
                    child: LinearProgressIndicator(
                      value: goalProgress,
                      minHeight: 6,
                      backgroundColor: Theme.of(context).dividerColor,
                      valueColor: const AlwaysStoppedAnimation<Color>(
                          AppColors.primary),
                    ),
                  ),
                ],
              ),
            );
          }).toList(),
        );
      },
    );
  }
}

// =============================================================================
// Reusable Finance Section Card
// =============================================================================

class _FinanceSectionCard extends StatefulWidget {
  const _FinanceSectionCard({
    required this.title,
    required this.icon,
    required this.iconColor,
    required this.summary,
    required this.details,
    required this.isEmpty,
    required this.emptyLabel,
    required this.onManage,
    required this.manageLabel,
    this.children = const [],
    this.overflowCount = 0,
    this.isLoading = false,
    this.defaultExpanded = false,
  });

  final String title;
  final IconData icon;
  final Color iconColor;
  final String summary;
  final String details;
  final bool isEmpty;
  final String emptyLabel;
  final VoidCallback onManage;
  final String manageLabel;
  final List<Widget> children;
  final int overflowCount;
  final bool isLoading;
  final bool defaultExpanded;

  @override
  State<_FinanceSectionCard> createState() => _FinanceSectionCardState();
}

class _FinanceSectionCardState extends State<_FinanceSectionCard>
    with SingleTickerProviderStateMixin {
  late bool _expanded;
  late AnimationController _chevronController;
  late Animation<double> _chevronTurns;

  @override
  void initState() {
    super.initState();
    _expanded = widget.defaultExpanded;
    _chevronController = AnimationController(
      duration: const Duration(milliseconds: 200),
      vsync: this,
    );
    _chevronTurns =
        Tween<double>(begin: 0.0, end: 0.5).animate(_chevronController);
    if (_expanded) _chevronController.value = 1.0;
  }

  @override
  void dispose() {
    _chevronController.dispose();
    super.dispose();
  }

  void _toggle() {
    setState(() {
      _expanded = !_expanded;
      if (_expanded) {
        _chevronController.forward();
      } else {
        _chevronController.reverse();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      decoration: BoxDecoration(
        color: theme.cardColor,
        borderRadius: BorderRadius.circular(16),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          // Header — always visible, tappable to expand/collapse
          InkWell(
            onTap: widget.isLoading || widget.isEmpty ? null : _toggle,
            borderRadius:
                const BorderRadius.vertical(top: Radius.circular(16)),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  // Icon in tinted circle
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      color: widget.iconColor.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(widget.icon, size: 20, color: widget.iconColor),
                  ),
                  const SizedBox(width: 12),

                  // Title + details
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Text(
                              widget.title,
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w600,
                                color: theme.colorScheme.onSurface,
                              ),
                            ),
                            if (widget.summary.isNotEmpty) ...[
                              const SizedBox(width: 8),
                              Flexible(
                                child: Text(
                                  widget.summary,
                                  style: TextStyle(
                                    fontSize: 14,
                                    fontWeight: FontWeight.w600,
                                    color: theme.colorScheme.onSurface,
                                  ),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            ],
                          ],
                        ),
                        if (widget.details.isNotEmpty) ...[
                          const SizedBox(height: 2),
                          Text(
                            widget.details,
                            style: TextStyle(
                              fontSize: 13,
                              color: theme.colorScheme.onSurfaceVariant,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),

                  // Chevron (only when there's content to expand)
                  if (!widget.isLoading && !widget.isEmpty)
                    RotationTransition(
                      turns: _chevronTurns,
                      child: Icon(
                        Icons.expand_more,
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                ],
              ),
            ),
          ),

          // Expandable content
          AnimatedSize(
            duration: const Duration(milliseconds: 200),
            curve: Curves.easeInOut,
            alignment: Alignment.topCenter,
            child: _expanded && !widget.isLoading && !widget.isEmpty
                ? _buildExpandedContent(theme)
                : widget.isLoading
                    ? _buildShimmerContent(theme)
                    : widget.isEmpty
                        ? _buildEmptyContent(theme)
                        : const SizedBox.shrink(),
          ),
        ],
      ),
    );
  }

  Widget _buildExpandedContent(ThemeData theme) {
    return Column(
      children: [
        Divider(height: 1, color: theme.dividerColor),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
          child: Column(
            children: [
              ...widget.children,
              if (widget.overflowCount > 0)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    '+${widget.overflowCount} more',
                    style: TextStyle(
                      fontSize: 13,
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  onPressed: widget.onManage,
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.primary,
                    side: const BorderSide(color: AppColors.primary),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                  child: Text(widget.manageLabel),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildEmptyContent(ThemeData theme) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      child: Column(
        children: [
          Divider(height: 1, color: theme.dividerColor),
          const SizedBox(height: 20),
          Icon(
            widget.icon,
            size: 36,
            color: theme.colorScheme.onSurfaceVariant.withValues(alpha: 0.5),
          ),
          const SizedBox(height: 8),
          Text(
            widget.emptyLabel,
            style: TextStyle(
              fontSize: 14,
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 12),
          OutlinedButton(
            onPressed: widget.onManage,
            style: OutlinedButton.styleFrom(
              foregroundColor: AppColors.primary,
              side: const BorderSide(color: AppColors.primary),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10),
              ),
            ),
            child: Text(widget.manageLabel),
          ),
        ],
      ),
    );
  }

  Widget _buildShimmerContent(ThemeData theme) {
    return Shimmer.fromColors(
      baseColor: theme.cardColor,
      highlightColor: theme.scaffoldBackgroundColor,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
        child: Column(
          children: List.generate(
            2,
            (_) => Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Row(
                children: [
                  Expanded(
                    child: Container(
                      height: 14,
                      decoration: BoxDecoration(
                        color: theme.dividerColor,
                        borderRadius: BorderRadius.circular(4),
                      ),
                    ),
                  ),
                  const SizedBox(width: 24),
                  Container(
                    height: 14,
                    width: 60,
                    decoration: BoxDecoration(
                      color: theme.dividerColor,
                      borderRadius: BorderRadius.circular(4),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// =============================================================================
// Helper Widgets
// =============================================================================

class _PreviewRow extends StatelessWidget {
  const _PreviewRow({required this.leading, required this.trailing});

  final Widget leading;
  final Widget trailing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Expanded(child: leading),
          const SizedBox(width: 8),
          trailing,
        ],
      ),
    );
  }
}

// =============================================================================
// Guest Locked Section
// =============================================================================

class _GuestLockedSection extends StatelessWidget {
  const _GuestLockedSection({
    required this.title,
    required this.icon,
    required this.iconColor,
    required this.description,
  });

  final String title;
  final IconData icon;
  final Color iconColor;
  final String description;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      decoration: BoxDecoration(
        color: theme.cardColor,
        borderRadius: BorderRadius.circular(16),
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: iconColor.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(icon, size: 20, color: iconColor),
              ),
              const SizedBox(width: 12),
              Text(title,
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: theme.colorScheme.onSurface,
                  )),
              const Spacer(),
              Icon(Icons.lock_outline, size: 16,
                  color: theme.colorScheme.onSurfaceVariant),
            ],
          ),
          const SizedBox(height: 12),
          Text(description,
              style: TextStyle(
                fontSize: 14,
                color: theme.colorScheme.onSurfaceVariant,
              )),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton(
              onPressed: () => showGuestSignUpPrompt(context),
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.primary,
                side: const BorderSide(color: AppColors.primary),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
              ),
              child: Text('Sign Up to Track $title'),
            ),
          ),
        ],
      ),
    );
  }
}
