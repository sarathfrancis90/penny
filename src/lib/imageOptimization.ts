/**
 * Image Optimization Utilities
 * 
 * Provides client-side image compression, resizing, and format conversion
 * to minimize storage costs and improve performance.
 */

export interface ImageOptimizationOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: 'webp' | 'jpeg' | 'png';
  maintainAspectRatio?: boolean;
}

export interface OptimizedImage {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
  originalSize: number;
  optimizedSize: number;
  compressionRatio: number;
}

const DEFAULT_OPTIONS: Required<ImageOptimizationOptions> = {
  maxWidth: 1920,
  maxHeight: 1080,
  quality: 0.85,
  format: 'webp',
  maintainAspectRatio: true,
};

/**
 * Optimizes an image file for storage
 * - Resizes to max dimensions
 * - Compresses with specified quality
 * - Converts to modern format (WebP by default)
 */
export async function optimizeImage(
  file: File,
  options: ImageOptimizationOptions = {}
): Promise<OptimizedImage> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const img = new Image();
      
      img.onload = async () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            throw new Error('Could not get canvas context');
          }
          
          // Calculate new dimensions
          let { width, height } = img;
          
          if (opts.maintainAspectRatio) {
            const aspectRatio = width / height;
            
            if (width > opts.maxWidth) {
              width = opts.maxWidth;
              height = width / aspectRatio;
            }
            
            if (height > opts.maxHeight) {
              height = opts.maxHeight;
              width = height * aspectRatio;
            }
          } else {
            width = Math.min(width, opts.maxWidth);
            height = Math.min(height, opts.maxHeight);
          }
          
          // Set canvas dimensions
          canvas.width = width;
          canvas.height = height;
          
          // Enable image smoothing for better quality
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          
          // Draw the resized image
          ctx.drawImage(img, 0, 0, width, height);
          
          // Convert to blob
          const mimeType = opts.format === 'webp' ? 'image/webp' : 
                          opts.format === 'png' ? 'image/png' : 'image/jpeg';
          
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Failed to create blob'));
                return;
              }
              
              // Create data URL for preview
              const dataUrl = canvas.toDataURL(mimeType, opts.quality);
              
              const result: OptimizedImage = {
                blob,
                dataUrl,
                width,
                height,
                originalSize: file.size,
                optimizedSize: blob.size,
                compressionRatio: ((file.size - blob.size) / file.size) * 100,
              };
              
              resolve(result);
            },
            mimeType,
            opts.quality
          );
        } catch (error) {
          reject(error);
        }
      };
      
      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };
      
      img.src = e.target?.result as string;
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    
    reader.readAsDataURL(file);
  });
}

/**
 * Validates if a file is a supported image type
 */
export function isValidImageFile(file: File): boolean {
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic'];
  return validTypes.includes(file.type.toLowerCase());
}

/**
 * Gets a human-readable file size
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Creates a thumbnail from an image file
 */
export async function createThumbnail(
  file: File,
  maxSize: number = 200
): Promise<OptimizedImage> {
  return optimizeImage(file, {
    maxWidth: maxSize,
    maxHeight: maxSize,
    quality: 0.7,
    format: 'webp',
  });
}

/**
 * Batch optimize multiple images
 */
export async function optimizeImages(
  files: File[],
  options: ImageOptimizationOptions = {},
  onProgress?: (current: number, total: number) => void
): Promise<OptimizedImage[]> {
  const results: OptimizedImage[] = [];
  
  for (let i = 0; i < files.length; i++) {
    const optimized = await optimizeImage(files[i], options);
    results.push(optimized);
    
    if (onProgress) {
      onProgress(i + 1, files.length);
    }
  }
  
  return results;
}

/**
 * Convert a blob to a File object
 */
export function blobToFile(blob: Blob, fileName: string): File {
  return new File([blob], fileName, { type: blob.type });
}

/**
 * Generate a unique filename for receipt storage
 */
export function generateReceiptFileName(userId: string, originalName: string): string {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 15);
  const extension = originalName.split('.').pop()?.toLowerCase() || 'webp';
  
  return `receipt_${timestamp}_${randomStr}.${extension}`;
}

