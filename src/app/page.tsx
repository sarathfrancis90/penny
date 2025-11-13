"use client";

import { useState, useEffect } from "react";
import { Timestamp } from "firebase/firestore";
import { useRouter, useSearchParams } from "next/navigation";
import { MessageList } from "@/components/message-list";
import { ChatInput } from "@/components/chat-input";
import { ExpenseConfirmationCard } from "@/components/expense-confirmation-card";
import { ConversationSidebar } from "@/components/chat/conversation-sidebar";
import { ConversationDrawer } from "@/components/chat/conversation-drawer";
import { ConversationHeader } from "@/components/chat/conversation-header";
import { EmptyConversation } from "@/components/chat/empty-conversation";
import { ChatMessage } from "@/lib/types";
import { useAuth } from "@/hooks/useAuth";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { useConversations } from "@/hooks/useConversations";
import { useConversation } from "@/hooks/useConversation";
import { useConversationHistory } from "@/hooks/useConversationHistory";
import { AppLayout } from "@/components/app-layout";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface PendingExpense {
  vendor: string;
  amount: number;
  date: string;
  category: string;
  description?: string;
  confidence?: number;
}

export default function Home() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const conversationIdFromUrl = searchParams?.get("c");

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingExpense, setPendingExpense] = useState<PendingExpense | null>(null);
  const [pendingMessageId, setPendingMessageId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<string | null>(null);
  const [editTitleDialogOpen, setEditTitleDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [conversationIdToEdit, setConversationIdToEdit] = useState<string | null>(null);

  const { user } = useAuth();
  const { analyzeExpense, saveExpense } = useOfflineSync(user?.uid);

  // Conversation hooks
  const { conversations, loading: conversationsLoading, refetch: refetchConversations } = useConversations();
  const { conversation, messages: conversationMessages, updateLastAccessed } = useConversation(conversationIdFromUrl);
  const {
    updating,
    deleting,
    createConversation,
    updateConversation,
    deleteConversation,
    pinConversation,
  } = useConversationHistory();

  // Load messages from current conversation
  useEffect(() => {
    if (conversationMessages.length > 0) {
      // Convert ConversationMessage to ChatMessage format
      const chatMessages: ChatMessage[] = conversationMessages.map((msg) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        imageUrl: msg.attachments?.find((a) => a.type === "image")?.url,
        expenseData: msg.expenseData ? {
          id: msg.expenseData.expenseId,
          vendor: msg.expenseData.vendor,
          amount: msg.expenseData.amount,
          category: msg.expenseData.category,
        } as Partial<import("@/lib/types").Expense> : undefined,
        metadata: msg.metadata,
      }));
      setMessages(chatMessages);
    } else if (!conversationIdFromUrl) {
      // New conversation - clear messages
      setMessages([]);
    }
  }, [conversationMessages, conversationIdFromUrl]);

  // Update last accessed when viewing a conversation
  useEffect(() => {
    if (conversationIdFromUrl && conversation) {
      updateLastAccessed();
    }
  }, [conversationIdFromUrl, conversation, updateLastAccessed]);

  // Auto-generate conversation title from first message
  const generateTitle = (message: string): string => {
    // Extract key words and create a concise title
    const words = message.split(" ").slice(0, 6).join(" ");
    return words.length > 50 ? words.substring(0, 47) + "..." : words;
  };

  // Save message to current conversation
  const saveMessageToConversation = async (
    conversationId: string,
    role: "user" | "assistant",
    content: string,
    attachments?: { type: "image"; url: string; fileName: string; mimeType: string }[],
    expenseData?: { expenseId: string; vendor: string; amount: number; category: string; confirmed: boolean }
  ) => {
    if (!user) return;

    try {
      await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.uid,
          role,
          content,
          attachments,
          expenseData,
        }),
      });
    } catch (error) {
      console.error("Error saving message:", error);
    }
  };

  // Handlers for welcome tiles
  const handleUploadClick = () => {
    document.querySelector('[type="file"]')?.scrollIntoView({ behavior: "smooth", block: "end" });
    setTimeout(() => {
      (document.querySelector('[type="file"]') as HTMLInputElement)?.click();
    }, 300);
  };

  const handleDescribeClick = () => {
    const textInput = document.querySelector('[placeholder*="Describe"]') as HTMLInputElement;
    textInput?.scrollIntoView({ behavior: "smooth", block: "end" });
    setTimeout(() => {
      textInput?.focus();
    }, 300);
  };

  // Convert File to base64 string
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const handleSendMessage = async (message: string, image?: File) => {
    let currentConversationId = conversationIdFromUrl;

    // Create new conversation if none exists
    if (!currentConversationId && (message || image)) {
      const title = message ? generateTitle(message) : "Receipt Upload";
      const newConversationId = await createConversation({
        title,
        firstMessage: message || "📷 Uploaded a receipt",
        firstMessageRole: "user",
      });

      if (newConversationId) {
        currentConversationId = newConversationId;
        router.push(`/?c=${newConversationId}`);
        // Small delay to ensure conversation is created before adding messages
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // Create user message
    let imageUrl: string | undefined;
    let imageBase64: string | undefined;

    if (image) {
      imageUrl = URL.createObjectURL(image);
      try {
        imageBase64 = await fileToBase64(image);
      } catch (error) {
        console.error("Error converting image to base64:", error);
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

    // Note: First message is already saved by createConversation,
    // so we don't need to save the user message again

    // Add "thinking" message
    const thinkingMessage: ChatMessage = {
      id: `thinking-${Date.now()}`,
      role: "assistant",
      content: "🤔 Analyzing your expense...",
      timestamp: Timestamp.now(),
    };
    setMessages((prev) => [...prev, thinkingMessage]);

    try {
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

      // Create confirmation message
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

      // Save messages to conversation
      if (currentConversationId) {
        await saveMessageToConversation(currentConversationId, "assistant", confirmationMessage.content);
      }
    } catch (error) {
      console.error("Error analyzing expense:", error);

      setMessages((prev) => prev.filter((msg) => msg.id !== thinkingMessage.id));

      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: `Sorry, I couldn't analyze that expense. ${
          error instanceof Error ? error.message : "Please try again."
        }`,
        timestamp: Timestamp.now(),
      };
      setMessages((prev) => [...prev, errorMessage]);

      // Save error message to conversation
      if (currentConversationId) {
        await saveMessageToConversation(currentConversationId, "assistant", errorMessage.content);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmExpense = async (editedData: {
    vendor: string;
    amount: number;
    date: string;
    category: string;
    description?: string;
    groupId?: string | null;
  }) => {
    if (!pendingMessageId || !user) return;

    setIsProcessing(true);

    try {
      const result = await saveExpense({
        vendor: editedData.vendor,
        amount: editedData.amount,
        date: editedData.date,
        category: editedData.category,
        description: editedData.description,
        userId: user.uid,
        groupId: editedData.groupId,
      });

      if (!result.success) {
        throw new Error(result.error || "Failed to save expense");
      }

      console.log("Expense saved with ID:", result.id);

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === pendingMessageId ? { ...msg, status: "confirmed" } : msg
        )
      );

      const successMessage: ChatMessage = {
        id: `success-${Date.now()}`,
        role: "assistant",
        content: `✅ Expense saved! $${editedData.amount.toFixed(2)} at ${
          editedData.vendor
        } has been added to your records.`,
        timestamp: Timestamp.now(),
      };

      setMessages((prev) => [...prev, successMessage]);
      setPendingExpense(null);
      setPendingMessageId(null);

      // Save success message to conversation with expense data
      if (conversationIdFromUrl && result.id) {
        await saveMessageToConversation(
          conversationIdFromUrl,
          "assistant",
          successMessage.content,
          undefined,
          {
            expenseId: result.id,
            vendor: editedData.vendor,
            amount: editedData.amount,
            category: editedData.category,
            confirmed: true,
          }
        );
      }
    } catch (error) {
      console.error("Error saving expense:", error);

      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: `Sorry, I couldn't save that expense. ${
          error instanceof Error ? error.message : "Please try again."
        }`,
        timestamp: Timestamp.now(),
      };

      setMessages((prev) => [...prev, errorMessage]);

      // Save error message to conversation
      if (conversationIdFromUrl) {
        await saveMessageToConversation(conversationIdFromUrl, "assistant", errorMessage.content);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancelExpense = () => {
    if (!pendingMessageId) return;

    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === pendingMessageId ? { ...msg, status: "rejected" } : msg
      )
    );

    const cancelMessage: ChatMessage = {
      id: `cancel-${Date.now()}`,
      role: "assistant",
      content: "No problem! Feel free to try again with a different description or image.",
      timestamp: Timestamp.now(),
    };

    setMessages((prev) => [...prev, cancelMessage]);
    setPendingExpense(null);
    setPendingMessageId(null);

    // Save cancel message to conversation
    if (conversationIdFromUrl) {
      saveMessageToConversation(conversationIdFromUrl, "assistant", cancelMessage.content);
    }
  };

  // Conversation management handlers
  const handleNewConversation = () => {
    router.push("/");
    setMessages([]);
    setPendingExpense(null);
    setPendingMessageId(null);
  };

  const handleConversationSelect = (conversationId: string) => {
    router.push(`/?c=${conversationId}`);
  };

  const handlePin = async (conversationId: string, isPinned: boolean) => {
    await pinConversation(conversationId, isPinned);
  };

  const handleArchive = async (conversationId: string) => {
    await updateConversation(conversationId, { status: "archived" });
    refetchConversations();
  };

  const handleDelete = (conversationId: string) => {
    setConversationToDelete(conversationId);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!conversationToDelete) return;

    const success = await deleteConversation(conversationToDelete);
    if (success) {
      if (conversationToDelete === conversationIdFromUrl) {
        router.push("/");
      }
      refetchConversations();
    }
    setDeleteDialogOpen(false);
    setConversationToDelete(null);
  };

  const handleEditTitle = (conversationId: string) => {
    const conv = conversations.find((c) => c.id === conversationId);
    if (conv) {
      setNewTitle(conv.title);
      setConversationIdToEdit(conversationId);
      setEditTitleDialogOpen(true);
    }
  };

  const confirmEditTitle = async () => {
    if (!conversationIdToEdit || !newTitle.trim()) return;

    await updateConversation(conversationIdToEdit, { title: newTitle.trim() });
    setEditTitleDialogOpen(false);
    setConversationIdToEdit(null);
    setNewTitle("");
  };

  const showEmptyState = !conversationIdFromUrl && messages.length === 0;

  return (
    <AppLayout>
      <div className="fixed inset-0 top-[57px] flex md:top-[65px]">
        {/* Desktop Sidebar */}
        <div className="hidden md:block">
          <ConversationSidebar
            conversations={conversations}
            currentConversationId={conversationIdFromUrl}
            loading={conversationsLoading}
            onConversationSelect={handleConversationSelect}
            onNewConversation={handleNewConversation}
            onPin={handlePin}
            onArchive={handleArchive}
            onDelete={handleDelete}
          />
        </div>

        {/* Mobile Drawer */}
        <ConversationDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          conversations={conversations}
          currentConversationId={conversationIdFromUrl}
          loading={conversationsLoading}
          onConversationSelect={handleConversationSelect}
          onNewConversation={handleNewConversation}
          onPin={handlePin}
          onArchive={handleArchive}
          onDelete={handleDelete}
        />

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col">
          {/* Conversation Header */}
          <ConversationHeader
            conversation={conversation}
            onMenuClick={() => setDrawerOpen(true)}
            onEditTitle={handleEditTitle}
            onPin={handlePin}
            onArchive={handleArchive}
            onDelete={handleDelete}
          />

          {/* Chat Messages Area - Scrollable */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden">
            <div className="p-4 pb-24">
              {showEmptyState ? (
                <EmptyConversation
                  onUploadClick={handleUploadClick}
                  onDescribeClick={handleDescribeClick}
                />
              ) : (
                <MessageList
                  messages={messages}
                  onUploadClick={handleUploadClick}
                  onDescribeClick={handleDescribeClick}
                />
              )}

              {/* Show confirmation card if there's a pending expense */}
              {pendingExpense && (
                <div className="max-w-3xl mx-auto w-full mt-4 animate-in fade-in-50 slide-in-from-bottom-2">
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
          </div>

          {/* Chat Input - Fixed at bottom */}
          <div className="shrink-0 border-t bg-background">
            <ChatInput onSendMessage={handleSendMessage} isProcessing={isProcessing} />
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this conversation and all its messages. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Title Dialog */}
      <AlertDialog open={editTitleDialogOpen} onOpenChange={setEditTitleDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Edit Conversation Title</AlertDialogTitle>
            <AlertDialogDescription>
              <div className="mt-4">
                <Label htmlFor="title">New Title</Label>
                <Input
                  id="title"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Enter new title..."
                  className="mt-2"
                  maxLength={100}
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmEditTitle}
              disabled={updating || !newTitle.trim()}
            >
              {updating ? "Saving..." : "Save"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
