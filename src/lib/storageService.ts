/**
 * Firebase Storage Service
 * 
 * Handles all receipt image uploads, downloads, and deletions
 * with progress tracking and error handling.
 */

import { storage } from './firebase';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject, UploadTask } from 'firebase/storage';
import { optimizeImage, generateReceiptFileName, type OptimizedImage } from './imageOptimization';

export interface UploadProgress {
  bytesTransferred: number;
  totalBytes: number;
  percentage: number;
  state: 'running' | 'paused' | 'success' | 'error';
}

export interface UploadResult {
  url: string;
  path: string;
  size: number;
  optimizationStats?: {
    originalSize: number;
    optimizedSize: number;
    compressionRatio: number;
  };
}

/**
 * Uploads a receipt image to Firebase Storage
 * - Automatically optimizes the image
 * - Provides progress tracking
 * - Returns download URL
 */
export async function uploadReceipt(
  file: File,
  userId: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<UploadResult> {
  try {
    // Step 1: Optimize the image
    const optimized: OptimizedImage = await optimizeImage(file, {
      maxWidth: 1920,
      maxHeight: 1080,
      quality: 0.85,
      format: 'webp',
    });
    
    // Step 2: Generate unique filename
    const fileName = generateReceiptFileName(userId, file.name);
    const storagePath = `receipts/${userId}/${fileName}`;
    
    // Step 3: Create storage reference
    const storageRef = ref(storage, storagePath);
    
    // Step 4: Upload with progress tracking
    const uploadTask: UploadTask = uploadBytesResumable(storageRef, optimized.blob, {
      contentType: 'image/webp',
      customMetadata: {
        originalName: file.name,
        originalSize: file.size.toString(),
        optimizedSize: optimized.blob.size.toString(),
        compressionRatio: optimized.compressionRatio.toFixed(2),
        uploadedAt: new Date().toISOString(),
      },
    });
    
    // Step 5: Track progress
    return new Promise((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          if (onProgress) {
            const progress: UploadProgress = {
              bytesTransferred: snapshot.bytesTransferred,
              totalBytes: snapshot.totalBytes,
              percentage: (snapshot.bytesTransferred / snapshot.totalBytes) * 100,
              state: snapshot.state as 'running' | 'paused',
            };
            onProgress(progress);
          }
        },
        (error) => {
          console.error('Upload error:', error);
          if (onProgress) {
            onProgress({
              bytesTransferred: 0,
              totalBytes: 0,
              percentage: 0,
              state: 'error',
            });
          }
          reject(error);
        },
        async () => {
          // Upload completed successfully
          try {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            
            if (onProgress) {
              onProgress({
                bytesTransferred: uploadTask.snapshot.totalBytes,
                totalBytes: uploadTask.snapshot.totalBytes,
                percentage: 100,
                state: 'success',
              });
            }
            
            resolve({
              url: downloadURL,
              path: storagePath,
              size: optimized.blob.size,
              optimizationStats: {
                originalSize: optimized.originalSize,
                optimizedSize: optimized.optimizedSize,
                compressionRatio: optimized.compressionRatio,
              },
            });
          } catch (error) {
            reject(error);
          }
        }
      );
    });
  } catch (error) {
    console.error('Error preparing upload:', error);
    throw new Error('Failed to prepare image for upload');
  }
}

/**
 * Deletes a receipt image from Firebase Storage
 */
export async function deleteReceipt(storagePath: string): Promise<void> {
  try {
    const storageRef = ref(storage, storagePath);
    await deleteObject(storageRef);
  } catch (error) {
    // Ignore 'object not found' errors (already deleted)
    if (error && typeof error === 'object' && 'code' in error && error.code === 'storage/object-not-found') {
      console.warn('Receipt already deleted:', storagePath);
      return;
    }
    throw error;
  }
}

/**
 * Extracts storage path from Firebase download URL
 */
export function extractStoragePath(downloadUrl: string): string | null {
  try {
    // Firebase Storage URLs follow this pattern:
    // https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{path}?alt=media&token={token}
    const url = new URL(downloadUrl);
    const pathMatch = url.pathname.match(/\/o\/(.+?)(\?|$)/);
    
    if (pathMatch && pathMatch[1]) {
      // Decode the URI component (handles special characters)
      return decodeURIComponent(pathMatch[1]);
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting storage path:', error);
    return null;
  }
}

/**
 * Uploads a conversation message attachment
 */
export async function uploadMessageAttachment(
  file: File,
  userId: string,
  conversationId: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<UploadResult> {
  try {
    // Optimize the image
    const optimized = await optimizeImage(file, {
      maxWidth: 1920,
      maxHeight: 1080,
      quality: 0.85,
      format: 'webp',
    });
    
    // Generate filename
    const fileName = generateReceiptFileName(userId, file.name);
    const storagePath = `conversations/${userId}/${conversationId}/${fileName}`;
    
    // Create storage reference
    const storageRef = ref(storage, storagePath);
    
    // Upload
    const uploadTask = uploadBytesResumable(storageRef, optimized.blob, {
      contentType: 'image/webp',
      customMetadata: {
        originalName: file.name,
        conversationId,
        uploadedAt: new Date().toISOString(),
      },
    });
    
    // Track progress and return result
    return new Promise((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          if (onProgress) {
            onProgress({
              bytesTransferred: snapshot.bytesTransferred,
              totalBytes: snapshot.totalBytes,
              percentage: (snapshot.bytesTransferred / snapshot.totalBytes) * 100,
              state: snapshot.state as 'running' | 'paused',
            });
          }
        },
        (error) => {
          reject(error);
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          resolve({
            url: downloadURL,
            path: storagePath,
            size: optimized.blob.size,
          });
        }
      );
    });
  } catch (error) {
    throw new Error('Failed to upload message attachment');
  }
}

/**
 * Batch delete multiple receipts
 */
export async function deleteMultipleReceipts(storagePaths: string[]): Promise<{
  success: number;
  failed: number;
  errors: Array<{ path: string; error: string }>;
}> {
  const results = {
    success: 0,
    failed: 0,
    errors: [] as Array<{ path: string; error: string }>,
  };
  
  for (const path of storagePaths) {
    try {
      await deleteReceipt(path);
      results.success++;
    } catch (error) {
      results.failed++;
      results.errors.push({
        path,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
  
  return results;
}

