import { useState, useEffect } from "react";
import {
  doc,
  collection,
  query,
  orderBy,
  onSnapshot,
  getDoc,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Conversation, ConversationMessage } from "@/lib/types";
import { useAuth } from "./useAuth";

interface UseConversationResult {
  conversation: Conversation | null;
  messages: ConversationMessage[];
  loading: boolean;
  error: string | null;
  updateLastAccessed: () => Promise<void>;
}

/**
 * Hook to fetch a single conversation with its messages
 * 
 * Features:
 * - Real-time updates for both conversation and messages
 * - Automatically updates lastAccessedAt
 * - Sorted messages by timestamp (oldest first)
 */
export function useConversation(
  conversationId: string | null
): UseConversationResult {
  const { user } = useAuth();
  const userId = user?.uid;

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || !conversationId) {
      setConversation(null);
      setMessages([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Subscribe to conversation document
      const conversationRef = doc(db, "conversations", conversationId);
      const unsubscribeConversation = onSnapshot(
        conversationRef,
        (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            
            // Verify this conversation belongs to the current user
            if (data.userId !== userId) {
              setError("Unauthorized access to conversation");
              setLoading(false);
              return;
            }

            setConversation({
              id: docSnap.id,
              userId: data.userId,
              title: data.title,
              summary: data.summary,
              createdAt: data.createdAt,
              updatedAt: data.updatedAt,
              lastMessagePreview: data.lastMessagePreview,
              messageCount: data.messageCount,
              status: data.status,
              totalExpensesCreated: data.totalExpensesCreated || 0,
              metadata: {
                firstMessageTimestamp: data.metadata?.firstMessageTimestamp,
                lastAccessedAt: data.metadata?.lastAccessedAt,
                isPinned: data.metadata?.isPinned || false,
              },
            });
          } else {
            setError("Conversation not found");
          }
        },
        (err) => {
          console.error("Error fetching conversation:", err);
          setError("Failed to load conversation");
        }
      );

      // Subscribe to messages subcollection
      const messagesQuery = query(
        collection(db, "conversations", conversationId, "messages"),
        orderBy("timestamp", "asc")
      );

      const unsubscribeMessages = onSnapshot(
        messagesQuery,
        (snapshot) => {
          const fetchedMessages: ConversationMessage[] = [];
          
          snapshot.forEach((doc) => {
            const data = doc.data();
            fetchedMessages.push({
              id: doc.id,
              conversationId: data.conversationId,
              role: data.role,
              content: data.content,
              timestamp: data.timestamp,
              attachments: data.attachments,
              expenseData: data.expenseData,
              metadata: data.metadata,
              status: data.status || "sent",
            });
          });

          setMessages(fetchedMessages);
          setLoading(false);
        },
        (err) => {
          console.error("Error fetching messages:", err);
          setError("Failed to load messages");
          setLoading(false);
        }
      );

      return () => {
        unsubscribeConversation();
        unsubscribeMessages();
      };
    } catch (err) {
      console.error("Error setting up conversation listener:", err);
      setError("Failed to set up conversation");
      setLoading(false);
    }
  }, [userId, conversationId]);

  const updateLastAccessed = async () => {
    if (!conversationId || !userId) return;

    try {
      const conversationRef = doc(db, "conversations", conversationId);
      await updateDoc(conversationRef, {
        "metadata.lastAccessedAt": Timestamp.now(),
      });
    } catch (err) {
      console.error("Error updating last accessed:", err);
    }
  };

  return {
    conversation,
    messages,
    loading,
    error,
    updateLastAccessed,
  };
}

