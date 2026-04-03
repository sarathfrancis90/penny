import 'dart:io';

import 'package:firebase_storage/firebase_storage.dart';
import 'package:uuid/uuid.dart';

class StorageService {
  StorageService({FirebaseStorage? storage})
      : _storage = storage ?? FirebaseStorage.instance;

  final FirebaseStorage _storage;
  static const _uuid = Uuid();

  /// Upload a receipt image to Firebase Storage.
  ///
  /// Path: `receipts/{userId}/{timestamp}_{uuid}.jpg`
  ///
  /// The image should already be compressed (max 1200px, 85% quality)
  /// by the image picker before calling this method.
  ///
  /// Returns the public download URL.
  Future<String> uploadReceipt(File imageFile, String userId) async {
    final timestamp = DateTime.now().millisecondsSinceEpoch;
    final uniqueId = _uuid.v4().split('-').first; // short uuid segment
    final fileName = '${timestamp}_$uniqueId.jpg';
    final path = 'receipts/$userId/$fileName';

    final ref = _storage.ref().child(path);

    final metadata = SettableMetadata(
      contentType: 'image/jpeg',
      customMetadata: {
        'uploadedBy': userId,
        'uploadedAt': DateTime.now().toIso8601String(),
      },
    );

    await ref.putFile(imageFile, metadata);
    final downloadUrl = await ref.getDownloadURL();
    return downloadUrl;
  }

  /// Delete a receipt from Firebase Storage by its full storage path
  /// or download URL.
  Future<void> deleteReceipt(String receiptPath) async {
    try {
      final ref = receiptPath.startsWith('https')
          ? _storage.refFromURL(receiptPath)
          : _storage.ref().child(receiptPath);
      await ref.delete();
    } on FirebaseException catch (e) {
      // Ignore "object not found" — already deleted
      if (e.code != 'object-not-found') rethrow;
    }
  }
}
