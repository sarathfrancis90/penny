import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/data/models/conversation_model.dart';

void main() {
  group('ConversationMetadata.fromMap', () {
    test('reads aiTitleGenerated when present', () {
      final meta = ConversationMetadata.fromMap({
        'lastAccessedAt': Timestamp.fromMillisecondsSinceEpoch(1_700_000_000_000),
        'isPinned': true,
        'aiTitleGenerated': true,
      });

      expect(meta.aiTitleGenerated, true);
      expect(meta.isPinned, true);
    });

    test('defaults aiTitleGenerated to false when absent', () {
      final meta = ConversationMetadata.fromMap({
        'lastAccessedAt': Timestamp.fromMillisecondsSinceEpoch(1_700_000_000_000),
        'isPinned': false,
      });

      expect(meta.aiTitleGenerated, false);
    });

    test('round-trips through toMap', () {
      final original = ConversationMetadata(
        lastAccessedAt: Timestamp.fromMillisecondsSinceEpoch(1_700_000_000_000),
        isPinned: true,
        aiTitleGenerated: true,
        firstMessageTimestamp:
            Timestamp.fromMillisecondsSinceEpoch(1_690_000_000_000),
      );
      final restored = ConversationMetadata.fromMap(original.toMap());

      expect(restored.aiTitleGenerated, original.aiTitleGenerated);
      expect(restored.isPinned, original.isPinned);
      expect(restored.lastAccessedAt, original.lastAccessedAt);
      expect(restored.firstMessageTimestamp, original.firstMessageTimestamp);
    });
  });
}
