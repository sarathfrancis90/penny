import 'package:flutter/material.dart';
import 'package:lottie/lottie.dart';

/// A short "saved" confirmation shown over the app.
///
/// It is a toast, not a dialog: it ignores touches, so the screen behind it
/// stays usable while it is showing, and it goes away by itself. It lives in
/// the root overlay, so a sheet or page can close right after showing it.
class SuccessOverlay {
  SuccessOverlay._();

  static OverlayEntry? _current;

  /// Shows the confirmation and returns immediately.
  static void show(
    BuildContext context, {
    required String title,
    required String subtitle,
    Duration duration = const Duration(milliseconds: 1500),
  }) {
    final overlay = Overlay.maybeOf(context, rootOverlay: true);
    if (overlay == null) return;

    // Only one at a time: a new confirmation replaces the previous one.
    _remove(_current);

    late final OverlayEntry entry;
    entry = OverlayEntry(
      builder: (_) => _SuccessToast(
        title: title,
        subtitle: subtitle,
        duration: duration,
        onDone: () => _remove(entry),
      ),
    );
    _current = entry;
    overlay.insert(entry);
  }

  /// Removes any confirmation still showing, e.g. when the signed-in user
  /// changes, so one person's last save is never shown to the next.
  static void dismissAll() => _remove(_current);

  static void _remove(OverlayEntry? entry) {
    if (entry == null) return;
    if (identical(_current, entry)) _current = null;
    if (entry.mounted) entry.remove();
    entry.dispose();
  }
}

class _SuccessToast extends StatefulWidget {
  const _SuccessToast({
    required this.title,
    required this.subtitle,
    required this.duration,
    required this.onDone,
  });

  final String title;
  final String subtitle;
  final Duration duration;
  final VoidCallback onDone;

  @override
  State<_SuccessToast> createState() => _SuccessToastState();
}

class _SuccessToastState extends State<_SuccessToast>
    with SingleTickerProviderStateMixin {
  static const _fade = Duration(milliseconds: 200);

  late final AnimationController _controller;
  late final Animation<double> _opacity;
  late final Animation<double> _scale;

  @override
  void initState() {
    super.initState();
    final total = widget.duration + _fade;
    _controller = AnimationController(vsync: this, duration: total);
    final fadeShare = _fade.inMicroseconds / total.inMicroseconds;
    final holdUntil = widget.duration.inMicroseconds / total.inMicroseconds;
    _opacity = TweenSequence<double>([
      TweenSequenceItem(tween: Tween(begin: 0, end: 1), weight: fadeShare),
      TweenSequenceItem(tween: ConstantTween(1), weight: holdUntil - fadeShare),
      TweenSequenceItem(tween: Tween(begin: 1, end: 0), weight: 1 - holdUntil),
    ]).animate(_controller);
    _scale = Tween<double>(begin: 0.9, end: 1).animate(
      CurvedAnimation(
        parent: _controller,
        curve: Interval(0, fadeShare, curve: Curves.easeOut),
      ),
    );
    _controller.forward().whenCompleteOrCancel(() {
      if (mounted) widget.onDone();
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Announced by screen readers; ignores touches so the screen stays usable.
    return IgnorePointer(
      child: Semantics(
        liveRegion: true,
        label: '${widget.title}. ${widget.subtitle}',
        excludeSemantics: true,
        child: SafeArea(
          child: Align(
            alignment: const Alignment(0, -0.35),
            child: FadeTransition(
              opacity: _opacity,
              child: ScaleTransition(
                scale: _scale,
                child: Material(
                  color: Colors.black.withValues(alpha: 0.82),
                  borderRadius: BorderRadius.circular(20),
                  elevation: 6,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(28, 16, 28, 20),
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 280),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Lottie.asset(
                            'assets/lottie/success_check.json',
                            width: 72,
                            height: 72,
                            repeat: false,
                          ),
                          const SizedBox(height: 8),
                          Text(
                            widget.title,
                            style: const TextStyle(
                              fontSize: 17,
                              fontWeight: FontWeight.w700,
                              color: Colors.white,
                            ),
                            textAlign: TextAlign.center,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                          const SizedBox(height: 4),
                          Text(
                            widget.subtitle,
                            style: TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w500,
                              color: Colors.white.withValues(alpha: 0.85),
                            ),
                            textAlign: TextAlign.center,
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
