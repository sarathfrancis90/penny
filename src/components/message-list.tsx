"use client";

import Image from "next/image";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Bot, User, Sparkles, Check } from "lucide-react";

interface MessageListProps {
  messages: ChatMessage[];
}

export function MessageList({ messages }: MessageListProps) {
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full min-h-[500px] text-center space-y-8 animate-in fade-in-50 slide-in-from-bottom-4 duration-700">
          <div className="relative w-40 h-40 animate-float">
            <div className="absolute inset-0 bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 rounded-full blur-3xl"></div>
            <Image 
              src="/penny_mono.png" 
              alt="Penny Logo" 
              fill
              sizes="160px"
              className="opacity-90 hover:opacity-100 transition-all duration-500 object-contain hover:scale-110"
              priority
            />
          </div>
          <div className="space-y-4 max-w-2xl px-4">
            <h2 className="text-4xl font-bold gradient-text animate-in slide-in-from-bottom-2 duration-500">
              Welcome to Penny!
            </h2>
            <p className="text-lg text-muted-foreground animate-in slide-in-from-bottom-3 duration-700">
              Your personal AI expense tracker powered by{" "}
              <span className="inline-flex items-center gap-1 font-semibold text-violet-600 dark:text-violet-400">
                <Sparkles className="h-4 w-4" />
                Gemini AI
              </span>
            </p>
            <div className="grid md:grid-cols-3 gap-4 mt-8 text-sm">
              <div className="p-4 rounded-xl glass hover:scale-105 transition-all duration-300 animate-in slide-in-from-bottom-4 duration-700">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center mx-auto mb-3">
                  <span className="text-2xl">📸</span>
                </div>
                <p className="font-semibold mb-1">Upload Receipt</p>
                <p className="text-xs text-muted-foreground">Take a photo or upload an image</p>
              </div>
              <div className="p-4 rounded-xl glass hover:scale-105 transition-all duration-300 animate-in slide-in-from-bottom-4 duration-700 delay-100">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center mx-auto mb-3">
                  <span className="text-2xl">💬</span>
                </div>
                <p className="font-semibold mb-1">Describe Expense</p>
                <p className="text-xs text-muted-foreground">Type your expense details</p>
              </div>
              <div className="p-4 rounded-xl glass hover:scale-105 transition-all duration-300 animate-in slide-in-from-bottom-4 duration-700 delay-200">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center mx-auto mb-3">
                  <span className="text-2xl">✨</span>
                </div>
                <p className="font-semibold mb-1">AI Analysis</p>
                <p className="text-xs text-muted-foreground">Get instant categorization</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        messages.map((message, index) => (
          <div
            key={message.id}
            className={cn(
              "flex gap-4 animate-in fade-in-50 slide-in-from-bottom-4 duration-500",
              message.role === "user" ? "flex-row-reverse" : "flex-row"
            )}
            style={{ animationDelay: `${index * 50}ms` }}
          >
            {/* Avatar with Beautiful Gradients */}
            <Avatar
              className={cn(
                "h-10 w-10 shrink-0 transition-all duration-300 hover:scale-110 border-2",
                message.role === "user" 
                  ? "bg-gradient-to-br from-blue-500 to-cyan-500 border-blue-300 dark:border-blue-700 shadow-lg shadow-blue-500/30" 
                  : "bg-gradient-to-br from-violet-500 to-fuchsia-500 border-violet-300 dark:border-violet-700 shadow-lg shadow-violet-500/30"
              )}
            >
              <AvatarFallback
                className={cn(
                  "text-sm font-semibold text-white",
                  message.role === "user"
                    ? "bg-gradient-to-br from-blue-500 to-cyan-500"
                    : "bg-gradient-to-br from-violet-500 to-fuchsia-500"
                )}
              >
                {message.role === "user" ? (
                  <User className="h-5 w-5" />
                ) : (
                  <Bot className="h-5 w-5" />
                )}
              </AvatarFallback>
            </Avatar>

            {/* Message Content with Enhanced Styling */}
            <div
              className={cn(
                "flex flex-col gap-2 max-w-[85%] md:max-w-[75%]",
                message.role === "user" ? "items-end" : "items-start"
              )}
            >
              {/* Message Bubble */}
              <div
                className={cn(
                  "rounded-2xl px-5 py-3 text-sm shadow-md transition-all duration-300 hover:shadow-lg",
                  message.role === "user"
                    ? "bg-gradient-to-br from-blue-500 to-cyan-500 text-white rounded-tr-sm"
                    : "glass rounded-tl-sm"
                )}
              >
                {/* Display image if present */}
                {message.imageUrl && (
                  <div className="relative w-full h-56 mb-3 rounded-xl overflow-hidden group">
                    <Image
                      src={message.imageUrl}
                      alt="Receipt"
                      fill
                      sizes="(max-width: 768px) 100vw, 500px"
                      className="object-contain transition-transform duration-300 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  </div>
                )}
                
                {/* Message text */}
                <p className="whitespace-pre-wrap break-words leading-relaxed">
                  {message.content}
                </p>

                {/* Expense data preview with modern styling */}
                {message.expenseData && (
                  <div className={cn(
                    "mt-3 pt-3 border-t text-xs space-y-2 rounded-lg p-3",
                    message.role === "user" 
                      ? "border-white/20 bg-white/10" 
                      : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50"
                  )}>
                    <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400 font-semibold mb-2">
                      <Check className="h-3.5 w-3.5" />
                      <span>Extracted Details</span>
                    </div>
                    {message.expenseData.vendor && (
                      <p className="flex justify-between">
                        <span className="opacity-75">Vendor:</span>
                        <span className="font-semibold">{message.expenseData.vendor}</span>
                      </p>
                    )}
                    {message.expenseData.amount && (
                      <p className="flex justify-between">
                        <span className="opacity-75">Amount:</span>
                        <span className="font-semibold text-green-600 dark:text-green-400">
                          ${message.expenseData.amount.toFixed(2)}
                        </span>
                      </p>
                    )}
                    {message.expenseData.category && (
                      <p className="flex justify-between">
                        <span className="opacity-75">Category:</span>
                        <span className="font-semibold">{message.expenseData.category}</span>
                      </p>
                    )}
                    {message.expenseData.date && (
                      <p className="flex justify-between">
                        <span className="opacity-75">Date:</span>
                        <span className="font-semibold">
                          {typeof message.expenseData.date === 'string' 
                            ? new Date(message.expenseData.date).toLocaleDateString()
                            : message.expenseData.date.toDate().toLocaleDateString()}
                        </span>
                      </p>
                    )}
                    {message.metadata?.confidence && (
                      <div className="mt-2 pt-2 border-t border-current/10">
                        <div className="flex justify-between items-center">
                          <span className="opacity-75">Confidence:</span>
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                              <div 
                                className={cn(
                                  "h-full transition-all duration-500 rounded-full",
                                  message.metadata.confidence >= 0.8 
                                    ? "bg-green-500" 
                                    : message.metadata.confidence >= 0.6 
                                    ? "bg-yellow-500" 
                                    : "bg-red-500"
                                )}
                                style={{ width: `${message.metadata.confidence * 100}%` }}
                              ></div>
                            </div>
                            <span className="font-semibold text-xs">
                              {(message.metadata.confidence * 100).toFixed(0)}%
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Timestamp */}
              <span className="text-xs text-muted-foreground px-2">
                {typeof message.timestamp === 'number' || typeof message.timestamp === 'string'
                  ? new Date(message.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : message.timestamp.toDate().toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
              </span>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
