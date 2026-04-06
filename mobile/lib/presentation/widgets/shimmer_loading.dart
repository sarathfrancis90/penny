import 'package:flutter/material.dart';
import 'package:shimmer/shimmer.dart';

/// Reusable shimmer/skeleton loading components for Penny Mobile.
///
/// Usage:
///   - [ShimmerListTile] — mimics an expense/income list tile
///   - [ShimmerCard] — mimics a summary card (rounded rectangle)
///   - [ShimmerLoadingList] — shows multiple [ShimmerListTile]s vertically

/// A shimmer placeholder that mimics a list tile with an icon circle,
/// two text lines, and an amount on the right.
class ShimmerListTile extends StatelessWidget {
  const ShimmerListTile({super.key});

  @override
  Widget build(BuildContext context) {
    return Shimmer.fromColors(
      baseColor: Theme.of(context).cardColor,
      highlightColor: Colors.white,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Row(
          children: [
            // Icon circle
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: Theme.of(context).cardColor,
                borderRadius: BorderRadius.circular(10),
              ),
            ),
            const SizedBox(width: 12),

            // Two text lines
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    height: 14,
                    width: double.infinity,
                    decoration: BoxDecoration(
                      color: Theme.of(context).cardColor,
                      borderRadius: BorderRadius.circular(4),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Container(
                    height: 12,
                    width: 120,
                    decoration: BoxDecoration(
                      color: Theme.of(context).cardColor,
                      borderRadius: BorderRadius.circular(4),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),

            // Amount placeholder
            Container(
              height: 14,
              width: 60,
              decoration: BoxDecoration(
                color: Theme.of(context).cardColor,
                borderRadius: BorderRadius.circular(4),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// A shimmer placeholder that mimics a summary card (rounded rectangle).
///
/// [height] defaults to 140, matching the typical total-spending or
/// portfolio summary card.
class ShimmerCard extends StatelessWidget {
  const ShimmerCard({super.key, this.height = 140});

  final double height;

  @override
  Widget build(BuildContext context) {
    return Shimmer.fromColors(
      baseColor: Theme.of(context).cardColor,
      highlightColor: Colors.white,
      child: Container(
        height: height,
        width: double.infinity,
        decoration: BoxDecoration(
          color: Theme.of(context).cardColor,
          borderRadius: BorderRadius.circular(16),
        ),
      ),
    );
  }
}

/// A shimmer placeholder that mimics a smaller content card, such as
/// a budget category card or a group card.
///
/// [height] defaults to 100.
class ShimmerContentCard extends StatelessWidget {
  const ShimmerContentCard({super.key, this.height = 100});

  final double height;

  @override
  Widget build(BuildContext context) {
    return Shimmer.fromColors(
      baseColor: Theme.of(context).cardColor,
      highlightColor: Colors.white,
      child: Container(
        height: height,
        width: double.infinity,
        margin: const EdgeInsets.only(bottom: 12),
        decoration: BoxDecoration(
          color: Theme.of(context).cardColor,
          borderRadius: BorderRadius.circular(12),
        ),
      ),
    );
  }
}

/// Shows [itemCount] shimmer list tiles stacked vertically inside a
/// scrollable list.  Defaults to 5 items.
class ShimmerLoadingList extends StatelessWidget {
  const ShimmerLoadingList({super.key, this.itemCount = 5});

  final int itemCount;

  @override
  Widget build(BuildContext context) {
    return ListView(
      physics: const NeverScrollableScrollPhysics(),
      shrinkWrap: true,
      padding: const EdgeInsets.symmetric(horizontal: 16),
      children: List.generate(itemCount, (_) => const ShimmerListTile()),
    );
  }
}

/// A full-page shimmer layout combining a [ShimmerCard] at the top with
/// a [ShimmerLoadingList] below it. Used for screens that show a summary
/// card followed by a list (dashboard, income, etc.).
class ShimmerCardAndList extends StatelessWidget {
  const ShimmerCardAndList({super.key, this.listItemCount = 5});

  final int listItemCount;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      children: [
        const SizedBox(height: 8),
        const ShimmerCard(),
        const SizedBox(height: 24),
        ...List.generate(listItemCount, (_) => const ShimmerListTile()),
      ],
    );
  }
}

/// A full-page shimmer layout combining a [ShimmerCard] at the top with
/// several [ShimmerContentCard]s below it. Used for screens that show a
/// summary card followed by content cards (budgets, savings, etc.).
class ShimmerCardAndCards extends StatelessWidget {
  const ShimmerCardAndCards({
    super.key,
    this.cardCount = 3,
    this.contentCardHeight = 100,
  });

  final int cardCount;
  final double contentCardHeight;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      children: [
        const SizedBox(height: 8),
        const ShimmerCard(),
        const SizedBox(height: 24),
        ...List.generate(
          cardCount,
          (_) => ShimmerContentCard(height: contentCardHeight),
        ),
      ],
    );
  }
}
