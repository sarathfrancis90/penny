import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:go_router/go_router.dart';
import 'package:penny_mobile/data/models/expense_model.dart';
import 'package:penny_mobile/presentation/providers/expense_providers.dart';

/// The time shortcut in a search query ("today", "yesterday", "last week",
/// "last month", "this month") as a date range, plus the query without it.
///
/// [start] is inclusive and [end] exclusive, so "yesterday" covers exactly
/// yesterday and does not also return today's expenses. Both are null when
/// the query has no shortcut. [lowerQuery] must already be lower-cased.
({DateTime? start, DateTime? end, String term}) expenseSearchDateRange(
  String lowerQuery,
  DateTime now,
) {
  final today = DateTime(now.year, now.month, now.day);
  final tomorrow = DateTime(now.year, now.month, now.day + 1);
  String without(String shortcut) => lowerQuery.replaceAll(shortcut, '').trim();

  if (lowerQuery.contains('today')) {
    return (start: today, end: tomorrow, term: without('today'));
  }
  if (lowerQuery.contains('yesterday')) {
    return (
      start: DateTime(now.year, now.month, now.day - 1),
      end: today,
      term: without('yesterday'),
    );
  }
  if (lowerQuery.contains('last week')) {
    return (
      start: now.subtract(const Duration(days: 7)),
      end: tomorrow,
      term: without('last week'),
    );
  }
  if (lowerQuery.contains('last month')) {
    return (
      start: DateTime(now.year, now.month - 1, now.day),
      end: tomorrow,
      term: without('last month'),
    );
  }
  if (lowerQuery.contains('this month')) {
    return (
      start: DateTime(now.year, now.month, 1),
      end: DateTime(now.year, now.month + 1, 1),
      term: without('this month'),
    );
  }
  return (start: null, end: null, term: lowerQuery);
}

/// Natural language search across expenses.
/// Supports queries like "coffee last week", "uber march", "over $50".
class ExpenseSearchScreen extends ConsumerStatefulWidget {
  const ExpenseSearchScreen({super.key});

  @override
  ConsumerState<ExpenseSearchScreen> createState() =>
      _ExpenseSearchScreenState();
}

class _ExpenseSearchScreenState extends ConsumerState<ExpenseSearchScreen> {
  final _controller = TextEditingController();
  final _focusNode = FocusNode();
  List<ExpenseModel> _results = [];
  bool _hasSearched = false;

  @override
  void initState() {
    super.initState();
    // Auto-focus search field
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _focusNode.requestFocus();
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _search(String query) {
    if (query.trim().isEmpty) {
      setState(() {
        _results = [];
        _hasSearched = false;
      });
      return;
    }

    final allExpenses = ref.read(allExpensesProvider).valueOrNull ?? [];
    final lower = query.toLowerCase().trim();
    final now = DateTime.now();

    // Parse natural language time filters
    final range = expenseSearchDateRange(lower, now);
    final startDate = range.start;
    final endDate = range.end;
    String? searchTerm = range.term;

    // Parse amount filter: "over $50", "under $100"
    double? minAmount;
    double? maxAmount;
    final overMatch = RegExp(r'over\s*\$?(\d+\.?\d*)').firstMatch(lower);
    final underMatch = RegExp(r'under\s*\$?(\d+\.?\d*)').firstMatch(lower);
    if (overMatch != null) {
      minAmount = double.tryParse(overMatch.group(1)!);
      searchTerm = searchTerm.replaceAll(overMatch.group(0)!, '').trim();
    }
    if (underMatch != null) {
      maxAmount = double.tryParse(underMatch.group(1)!);
      searchTerm = searchTerm.replaceAll(underMatch.group(0)!, '').trim();
    }

    // Filter expenses
    var filtered = allExpenses.where((e) {
      // Date filter
      final date = e.date.toDate();
      if (startDate != null && date.isBefore(startDate)) return false;
      if (endDate != null && !date.isBefore(endDate)) return false;
      // Amount filters
      if (minAmount != null && e.amount < minAmount) return false;
      if (maxAmount != null && e.amount > maxAmount) return false;
      // Text search on vendor, category, description
      if (searchTerm != null && searchTerm.isNotEmpty) {
        final vendorMatch = e.vendor.toLowerCase().contains(searchTerm);
        final categoryMatch = e.category.toLowerCase().contains(searchTerm);
        final descMatch = (e.description ?? '').toLowerCase().contains(
          searchTerm,
        );
        if (!vendorMatch && !categoryMatch && !descMatch) return false;
      }
      return true;
    }).toList();

    // Sort by date descending
    filtered.sort((a, b) => b.date.toDate().compareTo(a.date.toDate()));

    setState(() {
      _results = filtered;
      _hasSearched = true;
    });
  }

  void _refreshActiveSearch() {
    final query = _controller.text;
    if (!_hasSearched || query.trim().isEmpty) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _search(query);
    });
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(allExpensesProvider, (_, _) => _refreshActiveSearch());

    final formatter = NumberFormat.currency(symbol: '\$', decimalDigits: 2);

    return Scaffold(
      appBar: AppBar(
        title: TextField(
          controller: _controller,
          focusNode: _focusNode,
          decoration: const InputDecoration(
            hintText: 'Search expenses...',
            border: InputBorder.none,
            enabledBorder: InputBorder.none,
            focusedBorder: InputBorder.none,
            fillColor: Colors.transparent,
            contentPadding: EdgeInsets.zero,
          ),
          style: const TextStyle(fontSize: 16),
          onChanged: _search,
          textInputAction: TextInputAction.search,
        ),
        actions: [
          if (_controller.text.isNotEmpty)
            IconButton(
              icon: const Icon(Icons.clear),
              onPressed: () {
                _controller.clear();
                _search('');
              },
            ),
        ],
      ),
      body: !_hasSearched
          ? _SearchHints(
              onTap: (q) {
                _controller.text = q;
                _search(q);
              },
            )
          : _results.isEmpty
          ? Center(
              child: Text(
                'No expenses found',
                style: TextStyle(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
            )
          : ListView.builder(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: _results.length + 1,
              itemBuilder: (context, index) {
                if (index == 0) {
                  return Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    child: Text(
                      '${_results.length} result${_results.length == 1 ? '' : 's'}',
                      style: TextStyle(
                        fontSize: 13,
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                    ),
                  );
                }
                final e = _results[index - 1];
                return ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: CircleAvatar(
                    backgroundColor: Theme.of(context).cardColor,
                    child: Text(
                      formatter.format(e.amount).substring(0, 1),
                      style: const TextStyle(fontSize: 14),
                    ),
                  ),
                  title: Text(
                    e.vendor,
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                  subtitle: Text(
                    '${e.category} • ${DateFormat('MMM d').format(e.date.toDate())}',
                    style: TextStyle(
                      fontSize: 12,
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                  ),
                  trailing: Text(
                    formatter.format(e.amount),
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                  onTap: () {
                    context.push('/expenses/detail', extra: e);
                  },
                );
              },
            ),
    );
  }
}

class _SearchHints extends StatelessWidget {
  const _SearchHints({required this.onTap});
  final ValueChanged<String> onTap;

  @override
  Widget build(BuildContext context) {
    final hints = [
      'coffee this month',
      'uber last week',
      'over \$50',
      'groceries',
      'office supplies today',
      'under \$20',
    ];

    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.search, size: 36, color: Theme.of(context).hintColor),
          const SizedBox(height: 12),
          const Text(
            'Search your expenses',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 4),
          Text(
            'Try natural language queries:',
            style: TextStyle(
              fontSize: 14,
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 16),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: hints.map((h) {
              return ActionChip(label: Text(h), onPressed: () => onTap(h));
            }).toList(),
          ),
        ],
      ),
    );
  }
}
