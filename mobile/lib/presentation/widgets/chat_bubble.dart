import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:penny_mobile/core/constants/app_colors.dart';

class ChatBubble extends StatelessWidget {
  const ChatBubble({
    super.key,
    required this.content,
    required this.isUser,
    this.timestamp,
  });

  final String content;
  final bool isUser;
  final DateTime? timestamp;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final textColor = isUser ? Colors.white : theme.colorScheme.onSurface;

    return Semantics(
      label: '${isUser ? 'You' : 'Penny'}: $content',
      child: Align(
        alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
        child: Container(
          constraints: BoxConstraints(
            maxWidth: MediaQuery.of(context).size.width * 0.78,
          ),
          margin: EdgeInsets.only(
            left: isUser ? 48 : 0,
            right: isUser ? 0 : 48,
            bottom: 8,
          ),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            color: isUser
                ? AppColors.primary
                : theme.colorScheme.surfaceContainerHighest,
            borderRadius: BorderRadius.only(
              topLeft: const Radius.circular(16),
              topRight: const Radius.circular(16),
              bottomLeft: Radius.circular(isUser ? 16 : 4),
              bottomRight: Radius.circular(isUser ? 4 : 16),
            ),
          ),
          child: isUser
              // User messages: plain text (no markdown)
              ? Text(
                  content,
                  style: TextStyle(
                    fontSize: 15,
                    height: 1.4,
                    color: textColor,
                  ),
                )
              // AI messages: render markdown (bold, italic, lists, etc.)
              : MarkdownBody(
                  data: content,
                  shrinkWrap: true,
                  styleSheet: MarkdownStyleSheet(
                    p: TextStyle(fontSize: 15, height: 1.4, color: textColor),
                    strong: TextStyle(
                        fontSize: 15, fontWeight: FontWeight.w700, color: textColor),
                    em: TextStyle(
                        fontSize: 15, fontStyle: FontStyle.italic, color: textColor),
                    listBullet: TextStyle(fontSize: 15, color: textColor),
                    blockSpacing: 8,
                  ),
                ),
        ),
      ),
    );
  }
}
