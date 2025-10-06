"use client";

import { useState } from "react";
import { Timestamp } from "firebase/firestore";
import { MessageList } from "@/components/message-list";
import { ChatInput } from "@/components/chat-input";
import { ExpenseConfirmationCard } from "@/components/expense-confirmation-card";
import { ChatMessage } from "@/lib/types";
import { useAuth } from "@/hooks/useAuth";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { AppLayout } from "@/components/app-layout";

interface PendingExpense {
  vendor: string;
  amount: number;
  date: string;
  category: string;
  description?: string;
  confidence?: number;
}

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingExpense, setPendingExpense] = useState<PendingExpense | null>(null);
  const [pendingMessageId, setPendingMessageId] = useState<string | null>(null);
  const { user } = useAuth();
  const { analyzeExpense, saveExpense } = useOfflineSync(user?.uid);

  // Convert File to base64 string
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // Return full data URL (including the data:image/jpeg;base64, prefix)
        resolve(result);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const handleSendMessage = async (message: string, image?: File) => {
    // Create user message
    let imageUrl: string | undefined;
    let imageBase64: string | undefined;

    if (image) {
      imageUrl = URL.createObjectURL(image);
      try {
        imageBase64 = await fileToBase64(image);
      } catch (error) {
        console.error("Error converting image to base64:", error);
        // Add error message
        const errorMessage: ChatMessage = {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: "Sorry, I couldn't process that image. Please try again.",
          timestamp: Timestamp.now(),
        };
        setMessages((prev) => [...prev, errorMessage]);
        return;
      }
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: message || "📷 Uploaded a receipt",
      timestamp: Timestamp.now(),
      imageUrl,
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsProcessing(true);

    // Add "thinking" message
    const thinkingMessage: ChatMessage = {
      id: `thinking-${Date.now()}`,
      role: "assistant",
      content: "🤔 Analyzing your expense...",
      timestamp: Timestamp.now(),
    };
    setMessages((prev) => [...prev, thinkingMessage]);

    try {
      // Use offline sync hook to analyze expense
      const result = await analyzeExpense(message || undefined, imageBase64 || undefined);

      if (!result.success) {
        throw new Error(result.error || "Failed to analyze expense");
      }

      const expenseData = result.data;

      if (!expenseData) {
        throw new Error("No expense data returned from analysis");
      }

      // Remove thinking message
      setMessages((prev) => prev.filter((msg) => msg.id !== thinkingMessage.id));

      // Create confirmation message with special ID
      const confirmationMessageId = `confirmation-${Date.now()}`;
      const confirmationMessage: ChatMessage = {
        id: confirmationMessageId,
        role: "assistant",
        content: "I've extracted the following details. Please confirm:",
        timestamp: Timestamp.now(),
        status: "pending",
      };

      setMessages((prev) => [...prev, confirmationMessage]);
      setPendingExpense(expenseData);
      setPendingMessageId(confirmationMessageId);

    } catch (error) {
      console.error("Error analyzing expense:", error);

      // Remove thinking message
      setMessages((prev) => prev.filter((msg) => msg.id !== thinkingMessage.id));

      // Add error message
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: `Sorry, I couldn't analyze that expense. ${
          error instanceof Error ? error.message : "Please try again."
        }`,
        timestamp: Timestamp.now(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmExpense = async () => {
    if (!pendingExpense || !pendingMessageId || !user) return;

    setIsProcessing(true);

    try {
      // Use offline sync hook to save expense
      const result = await saveExpense({
        vendor: pendingExpense.vendor,
        amount: pendingExpense.amount,
        date: pendingExpense.date,
        category: pendingExpense.category,
        description: pendingExpense.description,
        userId: user.uid,
      });

      if (!result.success) {
        throw new Error(result.error || "Failed to save expense");
      }

      console.log("Expense saved with ID:", result.id);

      // Update message status to confirmed
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === pendingMessageId ? { ...msg, status: "confirmed" } : msg
        )
      );

      // Add success message
      const successMessage: ChatMessage = {
        id: `success-${Date.now()}`,
        role: "assistant",
        content: `✅ Expense saved! $${pendingExpense.amount.toFixed(2)} at ${
          pendingExpense.vendor
        } has been added to your records.`,
        timestamp: Timestamp.now(),
      };

      setMessages((prev) => [...prev, successMessage]);
      setPendingExpense(null);
      setPendingMessageId(null);

    } catch (error) {
      console.error("Error saving expense:", error);

      // Add error message
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: `Sorry, I couldn't save that expense. ${
          error instanceof Error ? error.message : "Please try again."
        }`,
        timestamp: Timestamp.now(),
      };

      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancelExpense = () => {
    if (!pendingMessageId) return;

    // Update message status to rejected
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === pendingMessageId ? { ...msg, status: "rejected" } : msg
      )
    );

    // Add cancellation message
    const cancelMessage: ChatMessage = {
      id: `cancel-${Date.now()}`,
      role: "assistant",
      content: "No problem! Feel free to try again with a different description or image.",
      timestamp: Timestamp.now(),
    };

    setMessages((prev) => [...prev, cancelMessage]);
    setPendingExpense(null);
    setPendingMessageId(null);
  };

  return (
    <AppLayout>
      <div className="h-full flex flex-col">
        {/* Chat Messages Area */}
        <div className="flex-1 overflow-hidden">
          <MessageList messages={messages} />
          
          {/* Show confirmation card if there's a pending expense */}
          {pendingExpense && (
            <div className="p-4 max-w-3xl mx-auto w-full animate-in fade-in-50 slide-in-from-bottom-2">
              <ExpenseConfirmationCard
                vendor={pendingExpense.vendor}
                amount={pendingExpense.amount}
                date={pendingExpense.date}
                category={pendingExpense.category}
                description={pendingExpense.description}
                confidence={pendingExpense.confidence}
                onConfirm={handleConfirmExpense}
                onCancel={handleCancelExpense}
                isProcessing={isProcessing}
              />
            </div>
          )}
        </div>

        {/* Chat Input - Fixed at bottom */}
        <div className="shrink-0">
          <ChatInput onSendMessage={handleSendMessage} isProcessing={isProcessing} />
        </div>
      </div>
    </AppLayout>
  );
}