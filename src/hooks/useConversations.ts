import { useState, useEffect } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  limit as limitQuery,
  onSnapshot,
  Query,
  DocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Conversation } from "@/lib/types";
import { useAuth } from "./useAuth";

interface UseConversationsOptions {
  limit?: number;
  includeArchived?: boolean;
}

interface UseConversationsResult {
  conversations: Conversation[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  refetch: () => void;
}

/**
 * Hook to fetch all user conversations with pagination
 * 
 * Features:
 * - Real-time updates
 * - Pagination support
 * - Filter by status (active/archived)
 * - Sorted by updatedAt (most recent first)
 */
export function useConversations(
  options: UseConversationsOptions = {}
): UseConversationsResult {
  const { limit: pageLimit = 20, includeArchived = false } = options;
  const { user } = useAuth();
  const userId = user?.uid;

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [lastVisible, setLastVisible] = useState<DocumentSnapshot | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    if (!userId) {
      setConversations([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Build base query
      let q: Query = query(
        collection(db, "conversations"),
        where("userId", "==", userId),
        orderBy("updatedAt", "desc"),
        limitQuery(pageLimit + 1) // Request one extra to check if there are more
      );

      // Filter by status if not including archived
      if (!includeArchived) {
        q = query(
          collection(db, "conversations"),
          where("userId", "==", userId),
          where("status", "==", "active"),
          orderBy("updatedAt", "desc"),
          limitQuery(pageLimit + 1)
        );
      }

      // Subscribe to real-time updates
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const fetchedConversations: Conversation[] = [];
          
          snapshot.docs.slice(0, pageLimit).forEach((doc) => {
            const data = doc.data();
            fetchedConversations.push({
              id: doc.id,
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
          });

          setConversations(fetchedConversations);
          setHasMore(snapshot.docs.length > pageLimit);
          setLastVisible(snapshot.docs[pageLimit - 1] || null);
          setLoading(false);
        },
        (err) => {
          console.error("Error fetching conversations:", err);
          setError("Failed to load conversations");
          setLoading(false);
        }
      );

      return () => unsubscribe();
    } catch (err) {
      console.error("Error setting up conversations listener:", err);
      setError("Failed to set up conversations");
      setLoading(false);
    }
  }, [userId, pageLimit, includeArchived, refreshTrigger]);

  const loadMore = () => {
    if (!userId || !lastVisible || !hasMore) return;

    // Note: Load more functionality is prepared but not yet implemented
    // For now, we load the first page only. Future enhancement: implement
    // infinite scroll with startAfter cursor-based pagination
    console.log("Load more functionality coming soon");
  };

  const refetch = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  return {
    conversations,
    loading,
    error,
    hasMore,
    loadMore,
    refetch,
  };
}

