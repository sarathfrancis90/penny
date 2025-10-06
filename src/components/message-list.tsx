"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

interface MessageListProps {
  messages: ChatMessage[];
}

export function MessageList({ messages }: MessageListProps) {
  return (
    <ScrollArea className="flex-1 p-4">
      <div className="space-y-4 max-w-3xl mx-auto">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center space-y-6">
            <div className="relative">
              <img 
                src="/penny_mono.png" 
                alt="Penny Logo" 
                className="w-32 h-32 opacity-90 hover:opacity-100 transition-opacity duration-300"
              />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold">Welcome to Penny!</h2>
              <p className="text-muted-foreground max-w-md">
                Your personal AI expense tracker. Upload a receipt, describe an
                expense, or use the quick form to get started.
              </p>
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "flex gap-3 animate-in fade-in-50 slide-in-from-bottom-2",
                message.role === "user" ? "flex-row-reverse" : "flex-row"
              )}
            >
              {/* Avatar */}
              <Avatar
                className={cn(
                  "h-8 w-8 shrink-0",
                  message.role === "user" ? "bg-primary" : "bg-slate-200 dark:bg-slate-700"
                )}
              >
                <AvatarFallback
                  className={cn(
                    "text-sm font-semibold",
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200"
                  )}
                >
                  {message.role === "user" ? "U" : "P"}
                </AvatarFallback>
              </Avatar>

              {/* Message Content */}
              <div
                className={cn(
                  "flex flex-col gap-2 max-w-[80%] md:max-w-[70%]",
                  message.role === "user" ? "items-end" : "items-start"
                )}
              >
                <div
                  className={cn(
                    "rounded-2xl px-4 py-2.5 text-sm",
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  )}
                >
                  {/* Display image if present */}
                  {message.imageUrl && (
                    <img
                      src={message.imageUrl}
                      alt="Receipt"
                      className="rounded-lg mb-2 max-w-full h-auto"
                    />
                  )}
                  
                  {/* Message text */}
                  <p className="whitespace-pre-wrap break-words">
                    {message.content}
                  </p>

                  {/* Expense data preview if present */}
                  {message.expenseData && (
                    <div className="mt-2 pt-2 border-t border-current/10 text-xs space-y-1">
                      {message.expenseData.vendor && (
                        <p>
                          <strong>Vendor:</strong> {message.expenseData.vendor}
                        </p>
                      )}
                      {message.expenseData.amount !== undefined && (
                        <p>
                          <strong>Amount:</strong> $
                          {message.expenseData.amount.toFixed(2)}
                        </p>
                      )}
                      {message.expenseData.category && (
                        <p>
                          <strong>Category:</strong>{" "}
                          {message.expenseData.category}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Timestamp */}
                <span className="text-xs text-muted-foreground px-1">
                  {message.timestamp?.toDate
                    ? new Date(
                        message.timestamp.toDate()
                      ).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "Just now"}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </ScrollArea>
  );
}
