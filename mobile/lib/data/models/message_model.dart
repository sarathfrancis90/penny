import 'package:cloud_firestore/cloud_firestore.dart';

class MessageModel {
  MessageModel({
    required this.id,
    required this.conversationId,
    required this.role,
    required this.content,
    required this.timestamp,
    required this.status,
    this.attachments,
    this.expenseData,
    this.metadata,
  });

  final String id;
  final String conversationId;
  final String role; // 'user' | 'assistant' | 'system'
  final String content;
  final Timestamp timestamp;
  final String status; // 'sending' | 'sent' | 'error'
  final List<MessageAttachment>? attachments;
  final MessageExpenseData? expenseData;
  final Map<String, dynamic>? metadata;

  factory MessageModel.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data()! as Map<String, dynamic>;
    return MessageModel(
      id: doc.id,
      conversationId: data['conversationId'] as String? ?? '',
      role: data['role'] as String,
      content: data['content'] as String,
      timestamp: data['timestamp'] as Timestamp,
      status: data['status'] as String? ?? 'sent',
      attachments: (data['attachments'] as List<dynamic>?)
          ?.map((e) => MessageAttachment.fromMap(e as Map<String, dynamic>))
          .toList(),
      expenseData: data['expenseData'] != null
          ? MessageExpenseData.fromMap(
              data['expenseData'] as Map<String, dynamic>)
          : null,
      metadata: data['metadata'] as Map<String, dynamic>?,
    );
  }

  Map<String, dynamic> toFirestore() {
    return {
      'conversationId': conversationId,
      'role': role,
      'content': content,
      'timestamp': timestamp,
      'status': status,
      if (attachments != null)
        'attachments': attachments!.map((a) => a.toMap()).toList(),
      if (expenseData != null) 'expenseData': expenseData!.toMap(),
      if (metadata != null) 'metadata': metadata,
    };
  }
}

class MessageAttachment {
  MessageAttachment({
    required this.type,
    required this.url,
    required this.fileName,
    required this.mimeType,
  });

  final String type; // 'image' | 'file'
  final String url;
  final String fileName;
  final String mimeType;

  factory MessageAttachment.fromMap(Map<String, dynamic> map) {
    return MessageAttachment(
      type: map['type'] as String,
      url: map['url'] as String,
      fileName: map['fileName'] as String? ?? '',
      mimeType: map['mimeType'] as String? ?? '',
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'type': type,
      'url': url,
      'fileName': fileName,
      'mimeType': mimeType,
    };
  }
}

class MessageExpenseData {
  MessageExpenseData({
    required this.expenseId,
    required this.vendor,
    required this.amount,
    required this.category,
    required this.confirmed,
  });

  final String expenseId;
  final String vendor;
  final double amount;
  final String category;
  final bool confirmed;

  factory MessageExpenseData.fromMap(Map<String, dynamic> map) {
    return MessageExpenseData(
      expenseId: map['expenseId'] as String? ?? '',
      vendor: map['vendor'] as String? ?? '',
      amount: (map['amount'] as num?)?.toDouble() ?? 0,
      category: map['category'] as String? ?? '',
      confirmed: map['confirmed'] as bool? ?? false,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'expenseId': expenseId,
      'vendor': vendor,
      'amount': amount,
      'category': category,
      'confirmed': confirmed,
    };
  }
}
