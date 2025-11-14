"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X, Download, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ReceiptImageViewerProps {
  imageUrl: string | null | undefined;
  alt?: string;
  className?: string;
  showFullscreenOption?: boolean;
}

export function ReceiptImageViewer({
  imageUrl,
  alt = "Receipt",
  className,
  showFullscreenOption = true,
}: ReceiptImageViewerProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [zoom, setZoom] = useState(1);

  // Reset loading state when URL changes
  useEffect(() => {
    if (imageUrl) {
      setIsLoading(true);
      setHasError(false);
    }
  }, [imageUrl]);

  const handleImageLoad = () => {
    setIsLoading(false);
  };

  const handleImageError = () => {
    setIsLoading(false);
    setHasError(true);
  };

  const handleDownload = async () => {
    if (!imageUrl) return;

    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `receipt-${Date.now()}.webp`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading receipt:', error);
    }
  };

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 0.25, 3));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 0.25, 0.5));
  };

  const handleResetZoom = () => {
    setZoom(1);
  };

  if (!imageUrl) {
    return (
      <div className="w-full aspect-[3/4] bg-muted rounded-lg flex items-center justify-center">
        <p className="text-sm text-muted-foreground">No receipt image</p>
      </div>
    );
  }

  return (
    <>
      {/* Thumbnail View */}
      <div className={cn("relative group", className)}>
        {/* Loading Skeleton */}
        {isLoading && (
          <div className="absolute inset-0 bg-muted rounded-lg animate-pulse flex items-center justify-center">
            <div className="text-sm text-muted-foreground">Loading...</div>
          </div>
        )}

        {/* Error State */}
        {hasError && (
          <div className="w-full aspect-[3/4] bg-muted rounded-lg flex items-center justify-center">
            <div className="text-center p-4">
              <p className="text-sm text-muted-foreground">Failed to load image</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setHasError(false);
                  setIsLoading(true);
                }}
                className="mt-2"
              >
                Retry
              </Button>
            </div>
          </div>
        )}

        {/* Image with lazy loading */}
        {!hasError && (
          <img
            src={imageUrl}
            alt={alt}
            loading="lazy"
            onLoad={handleImageLoad}
            onError={handleImageError}
            className={cn(
              "w-full rounded-lg object-cover cursor-pointer transition-all duration-300",
              isLoading && "opacity-0",
              !isLoading && "opacity-100 hover:shadow-lg hover:scale-[1.02]"
            )}
            style={{ aspectRatio: "3/4" }}
            onClick={() => showFullscreenOption && setIsFullscreen(true)}
          />
        )}

        {/* Overlay on hover (desktop only) */}
        {!hasError && !isLoading && showFullscreenOption && (
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-lg flex items-center justify-center">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsFullscreen(true)}
              className="gap-2"
            >
              <Maximize2 className="h-4 w-4" />
              <span className="hidden sm:inline">View Full Size</span>
            </Button>
          </div>
        )}
      </div>

      {/* Fullscreen Dialog */}
      <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 bg-black/95">
          {/* Header Controls */}
          <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleZoomOut}
                className="text-white hover:bg-white/20"
                disabled={zoom <= 0.5}
              >
                <ZoomOut className="h-5 w-5" />
              </Button>
              <span className="text-white text-sm font-medium min-w-[60px] text-center">
                {Math.round(zoom * 100)}%
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleZoomIn}
                className="text-white hover:bg-white/20"
                disabled={zoom >= 3}
              >
                <ZoomIn className="h-5 w-5" />
              </Button>
              {zoom !== 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleResetZoom}
                  className="text-white hover:bg-white/20"
                >
                  Reset
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleDownload}
                className="text-white hover:bg-white/20"
              >
                <Download className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsFullscreen(false)}
                className="text-white hover:bg-white/20"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Image Container */}
          <div className="w-full h-full flex items-center justify-center overflow-auto p-16">
            <img
              src={imageUrl}
              alt={alt}
              className="max-w-full max-h-full object-contain transition-transform duration-300"
              style={{ transform: `scale(${zoom})` }}
            />
          </div>

          {/* Mobile: Bottom Controls */}
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent sm:hidden">
            <div className="flex justify-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleDownload}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                Download
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

