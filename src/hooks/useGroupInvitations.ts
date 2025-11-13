import { useState, useEffect, useCallback } from "react";
import { collection, query, where, onSnapshot, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "./useAuth";
import { GroupInvitation } from "@/lib/types";

export function useGroupInvitations(groupId?: string) {
  const { user } = useAuth();
  const [invitations, setInvitations] = useState<GroupInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Real-time listener for invitations
  useEffect(() => {
    if (!user) {
      setInvitations([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    let invitationsQuery;

    if (groupId) {
      // Get invitations for a specific group
      invitationsQuery = query(
        collection(db, "groupInvitations"),
        where("groupId", "==", groupId),
        orderBy("createdAt", "desc")
      );
    } else {
      // Get invitations for the current user
      invitationsQuery = query(
        collection(db, "groupInvitations"),
        where("invitedEmail", "==", user.email?.toLowerCase()),
        where("status", "==", "pending"),
        orderBy("createdAt", "desc")
      );
    }

    const unsubscribe = onSnapshot(
      invitationsQuery,
      (snapshot) => {
        const invitationsData = snapshot.docs.map((doc) => ({
          ...doc.data(),
          id: doc.id,
        })) as GroupInvitation[];

        setInvitations(invitationsData);
        setLoading(false);
      },
      (err) => {
        console.error("Error listening to invitations:", err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [groupId, user]);

  // Accept an invitation
  const acceptInvitation = useCallback(
    async (token: string) => {
      if (!user) {
        throw new Error("Must be logged in to accept invitations");
      }

      try {
        const response = await fetch("/api/groups/invitations/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            userId: user.uid,
            userEmail: user.email,
            userName: user.displayName || user.email,
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Failed to accept invitation");
        }

        return result;
      } catch (err) {
        console.error("Error accepting invitation:", err);
        throw err;
      }
    },
    [user]
  );

  // Reject an invitation
  const rejectInvitation = useCallback(
    async (invitationId: string) => {
      if (!user) {
        throw new Error("Must be logged in to reject invitations");
      }

      try {
        const response = await fetch("/api/groups/invitations/reject", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            invitationId,
            userId: user.uid,
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Failed to reject invitation");
        }

        return result;
      } catch (err) {
        console.error("Error rejecting invitation:", err);
        throw err;
      }
    },
    [user]
  );

  // Cancel an invitation (for group admins)
  const cancelInvitation = useCallback(
    async (invitationId: string) => {
      if (!user) {
        throw new Error("Must be logged in to cancel invitations");
      }

      try {
        const response = await fetch("/api/groups/invitations/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            invitationId,
            userId: user.uid,
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Failed to cancel invitation");
        }

        return result;
      } catch (err) {
        console.error("Error canceling invitation:", err);
        throw err;
      }
    },
    [user]
  );

  return {
    invitations,
    loading,
    error,
    acceptInvitation,
    rejectInvitation,
    cancelInvitation,
  };
}

