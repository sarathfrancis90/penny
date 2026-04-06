import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:shimmer/shimmer.dart';

/// Collapsible receipt thumbnail that opens a full-screen pinch-to-zoom viewer.
class ReceiptImageViewer extends StatefulWidget {
  const ReceiptImageViewer({
    super.key,
    required this.receiptUrl,
    this.heroTag,
  });

  final String? receiptUrl;
  final String? heroTag;

  @override
  State<ReceiptImageViewer> createState() => _ReceiptImageViewerState();
}

class _ReceiptImageViewerState extends State<ReceiptImageViewer> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    if (widget.receiptUrl == null) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Collapsible header
        GestureDetector(
          onTap: () => setState(() => _expanded = !_expanded),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 10),
            child: Row(
              children: [
                Icon(Icons.receipt_long_outlined,
                    size: 20, color: Theme.of(context).colorScheme.onSurfaceVariant),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Receipt',
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: Theme.of(context).colorScheme.onSurface,
                    ),
                  ),
                ),
                Icon(
                  _expanded
                      ? Icons.keyboard_arrow_up
                      : Icons.keyboard_arrow_down,
                  size: 22,
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ],
            ),
          ),
        ),

        // Expandable receipt image
        AnimatedCrossFade(
          firstChild: const SizedBox.shrink(),
          secondChild: GestureDetector(
            onTap: () => _openFullScreen(context),
            child: Hero(
              tag: widget.heroTag ?? 'receipt-${widget.receiptUrl.hashCode}',
              child: ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: CachedNetworkImage(
                  imageUrl: widget.receiptUrl!,
                  height: 200,
                  width: double.infinity,
                  fit: BoxFit.cover,
                  placeholder: (context, url) => Shimmer.fromColors(
                    baseColor: Theme.of(context).cardColor,
                    highlightColor: Colors.white,
                    child: Container(
                      height: 200,
                      decoration: BoxDecoration(
                        color: Theme.of(context).cardColor,
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                  ),
                  errorWidget: (context, url, error) => Container(
                    height: 200,
                    decoration: BoxDecoration(
                      color: Theme.of(context).cardColor,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.broken_image_outlined,
                            size: 32, color: Theme.of(context).hintColor),
                        const SizedBox(height: 8),
                        Text('Failed to load receipt',
                            style: TextStyle(
                                fontSize: 13,
                                color: Theme.of(context).colorScheme.onSurfaceVariant)),
                        const SizedBox(height: 8),
                        TextButton(
                          onPressed: () => setState(() {}),
                          child: const Text('Retry',
                              style: TextStyle(fontSize: 13)),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
          crossFadeState: _expanded
              ? CrossFadeState.showSecond
              : CrossFadeState.showFirst,
          duration: const Duration(milliseconds: 250),
        ),
      ],
    );
  }

  void _openFullScreen(BuildContext context) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => _FullScreenReceiptViewer(
          receiptUrl: widget.receiptUrl!,
          heroTag: widget.heroTag ?? 'receipt-${widget.receiptUrl.hashCode}',
        ),
      ),
    );
  }
}

class _FullScreenReceiptViewer extends StatelessWidget {
  const _FullScreenReceiptViewer({
    required this.receiptUrl,
    required this.heroTag,
  });

  final String receiptUrl;
  final String heroTag;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: Center(
        child: Hero(
          tag: heroTag,
          child: InteractiveViewer(
            minScale: 0.5,
            maxScale: 4.0,
            child: CachedNetworkImage(
              imageUrl: receiptUrl,
              fit: BoxFit.contain,
              placeholder: (context, url) => const Center(
                child: CircularProgressIndicator(color: Colors.white),
              ),
              errorWidget: (context, url, error) => const Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.broken_image_outlined,
                      size: 48, color: Colors.white54),
                  SizedBox(height: 12),
                  Text('Failed to load image',
                      style: TextStyle(color: Colors.white54)),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
