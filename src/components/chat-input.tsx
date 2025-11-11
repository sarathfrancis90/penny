"use client";

import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImageIcon, Send, Loader2, X, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  onSendMessage: (message: string, image?: File) => void;
  isProcessing?: boolean;
}

interface ChatFormData {
  message: string;
}

export function ChatInput({ onSendMessage, isProcessing }: ChatInputProps) {
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { register, handleSubmit, reset, watch } = useForm<ChatFormData>({
    defaultValues: {
      message: "",
    },
  });

  const messageValue = watch("message");

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const onSubmit = (data: ChatFormData) => {
    if (!data.message.trim() && !selectedImage) return;

    onSendMessage(data.message.trim(), selectedImage || undefined);
    reset();
    removeImage();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(onSubmit)();
    }
  };

  const canSend = (messageValue?.trim() || selectedImage) && !isProcessing;

  return (
    <div className="border-t border-slate-200/50 dark:border-slate-800/50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl supports-[backdrop-filter]:bg-white/60 dark:supports-[backdrop-filter]:bg-slate-900/60 transition-all duration-300">
      <div className="max-w-4xl mx-auto p-4">
        {/* Image Preview with Beautiful Animation */}
        {imagePreview && (
          <div className="mb-4 animate-in slide-in-from-bottom-4 duration-300">
            <div className="relative inline-block group">
              <div className="relative h-24 w-24 rounded-xl overflow-hidden shadow-lg ring-2 ring-violet-500/50 transition-all duration-300 hover:scale-105 hover:shadow-violet-500/50">
                <Image
                  src={imagePreview}
                  alt="Preview"
                  fill
                  sizes="96px"
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              </div>
              <button
                onClick={removeImage}
                disabled={isProcessing}
                className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-red-500 hover:bg-red-600 text-white shadow-lg transition-all duration-200 hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Input Form with Modern Styling */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className={cn(
            "flex items-end gap-3 p-3 rounded-2xl transition-all duration-300",
            isFocused 
              ? "bg-gradient-to-r from-violet-50 to-fuchsia-50 dark:from-violet-950/30 dark:to-fuchsia-950/30 shadow-lg ring-2 ring-violet-500/50" 
              : "glass"
          )}>
            {/* Image Upload Button */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              disabled={isProcessing}
              className="hidden"
              aria-label="Upload receipt image"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              className={cn(
                "shrink-0 h-11 w-11 rounded-xl transition-all duration-300",
                selectedImage 
                  ? "bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 hover:bg-violet-200 dark:hover:bg-violet-900/50" 
                  : "hover:bg-slate-100 dark:hover:bg-slate-800 hover:scale-110"
              )}
              title="Upload receipt"
            >
              <ImageIcon className={cn(
                "h-5 w-5 transition-transform duration-300",
                selectedImage && "scale-110"
              )} />
            </Button>

            {/* Text Input with Enhanced Styling */}
            <div className="flex-1 relative">
              <Input
                {...register("message")}
                onKeyDown={handleKeyDown}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder={isProcessing ? "AI is thinking..." : "Describe your expense or upload a receipt..."}
                disabled={isProcessing}
                className={cn(
                  "border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-base placeholder:text-muted-foreground/60 h-11 transition-all duration-300",
                  isProcessing && "opacity-60"
                )}
              />
              {messageValue && messageValue.length > 0 && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground animate-in fade-in-50">
                  {messageValue.length}
                </div>
              )}
            </div>

            {/* Send Button with Gradient */}
            <Button
              type="submit"
              disabled={!canSend}
              size="icon"
              className={cn(
                "shrink-0 h-11 w-11 rounded-xl transition-all duration-300 shadow-lg",
                canSend
                  ? "bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 text-white shadow-violet-500/50 hover:scale-110 hover:shadow-violet-500/70"
                  : "bg-slate-200 dark:bg-slate-800"
              )}
              title="Send message"
            >
              {isProcessing ? (
                <Loader2 className="h-5 w-5 text-white animate-spin" />
              ) : (
                <Send className={cn(
                  "h-5 w-5 text-white transition-transform duration-300",
                  canSend && "group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                )} />
              )}
            </Button>
          </div>

          {/* Helper Text */}
          {isProcessing && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground animate-pulse">
              <Sparkles className="h-4 w-4 text-violet-500" />
              <span>Analyzing with AI...</span>
            </div>
          )}
        </form>

        {/* Quick Tips */}
        {!isProcessing && !messageValue && !selectedImage && (
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2 animate-in fade-in-50 slide-in-from-bottom-2 duration-700">
            <span className="text-xs text-muted-foreground">Try:</span>
            {["📸 Upload receipt", "💬 Describe expense", "✨ Ask Penny"].map((tip, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  if (i === 0) fileInputRef.current?.click();
                }}
                className="text-xs px-3 py-1.5 rounded-full glass hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-all duration-200 hover:scale-105"
              >
                {tip}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
