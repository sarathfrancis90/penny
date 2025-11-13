import { useState } from "react";
import { Timestamp } from "firebase/firestore";
import { useAuth } from "./useAuth";

interface CreateConversationData {
  title: string;
  firstMessage: string;
  firstMessageRole?: "user" | "assistant" | "system";
}

interface UpdateConversationData {
  title?: string;
  summary?: string;
  isPinned?: boolean;
  status?: "active" | "archived";
}

interface UseConversationHistoryResult {
  creating: boolean;
  updating: boolean;
  deleting: boolean;
  createConversation: (data: CreateConversationData) => Promise<string | null>;
  updateConversation: (conversationId: string, data: UpdateConversationData) => Promise<boolean>;
  deleteConversation: (conversationId: string) => Promise<boolean>;
  archiveConversation: (conversationId: string) => Promise<boolean>;
  pinConversation: (conversationId: string, isPinned: boolean) => Promise<boolean>;
}

/**
 * Hook to manage conversation CRUD operations
 * 
 * Features:
 * - Create new conversation
 * - Update conversation metadata
 * - Delete conversation (and all messages)
 * - Archive/unarchive conversation
 * - Pin/unpin conversation
 */
export function useConversationHistory(): UseConversationHistoryResult {
  const { user } = useAuth();
  const userId = user?.uid;

  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  /**
   * Create a new conversation with first message
   */
  const createConversation = async (
    data: CreateConversationData
  ): Promise<string | null> => {
    if (!userId) {
      console.error("User not authenticated");
      return null;
    }

    setCreating(true);
    try {
      const response = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          title: data.title,
          firstMessage: data.firstMessage,
          firstMessageRole: data.firstMessageRole || "user",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create conversation");
      }

      const result = await response.json();
      return result.conversationId;
    } catch (error) {
      console.error("Error creating conversation:", error);
      return null;
    } finally {
      setCreating(false);
    }
  };

  /**
   * Update conversation metadata
   */
  const updateConversation = async (
    conversationId: string,
    data: UpdateConversationData
  ): Promise<boolean> => {
    if (!userId) {
      console.error("User not authenticated");
      return false;
    }

    setUpdating(true);
    try {
      const response = await fetch(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          ...data,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update conversation");
      }

      return true;
    } catch (error) {
      console.error("Error updating conversation:", error);
      return false;
    } finally {
      setUpdating(false);
    }
  };

  /**
   * Delete conversation and all messages
   */
  const deleteConversation = async (conversationId: string): Promise<boolean> => {
    if (!userId) {
      console.error("User not authenticated");
      return false;
    }

    setDeleting(true);
    try {
      const response = await fetch(
        `/api/conversations/${conversationId}?userId=${userId}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete conversation");
      }

      return true;
    } catch (error) {
      console.error("Error deleting conversation:", error);
      return false;
    } finally {
      setDeleting(false);
    }
  };

  /**
   * Archive a conversation
   */
  const archiveConversation = async (conversationId: string): Promise<boolean> => {
    return updateConversation(conversationId, { status: "archived" });
  };

  /**
   * Pin/unpin a conversation
   */
  const pinConversation = async (
    conversationId: string,
    isPinned: boolean
  ): Promise<boolean> => {
    return updateConversation(conversationId, { isPinned });
  };

  return {
    creating,
    updating,
    deleting,
    createConversation,
    updateConversation,
    deleteConversation,
    archiveConversation,
    pinConversation,
  };
}

