"use client";

import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImageIcon, Send, Loader2 } from "lucide-react";
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
    <div className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="max-w-3xl mx-auto p-4">
        {/* Image Preview */}
        {imagePreview && (
          <div className="mb-3 relative inline-block">
            <div className="relative h-20 w-20">
              <Image
                src={imagePreview}
                alt="Preview"
                fill
                sizes="80px"
                className="object-cover rounded-lg border"
              />
            </div>
            <button
              type="button"
              onClick={removeImage}
              className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-xs hover:bg-destructive/90"
            >
              ×
            </button>
          </div>
        )}

        {/* Input Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="flex gap-2">
          {/* File Upload Button */}
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            className="shrink-0"
          >
            <ImageIcon className="h-5 w-5" />
            <span className="sr-only">Upload receipt</span>
          </Button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageSelect}
            className="hidden"
          />

          {/* Text Input */}
          <Input
            {...register("message")}
            placeholder="Describe an expense or upload a receipt..."
            disabled={isProcessing}
            onKeyDown={handleKeyDown}
            className="flex-1"
          />

          {/* Send Button */}
          <Button
            type="submit"
            size="icon"
            disabled={!canSend}
            className={cn(
              "shrink-0 transition-all",
              canSend && "bg-primary hover:bg-primary/90"
            )}
          >
            {isProcessing ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
            <span className="sr-only">Send message</span>
          </Button>
        </form>

        {/* Helper Text */}
        <p className="text-xs text-muted-foreground mt-2 text-center">
          Upload a receipt image or type an expense description
        </p>
      </div>
    </div>
  );
}
