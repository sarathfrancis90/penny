import { useState, useEffect, useCallback } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "./useAuth";
import { GroupMember, GroupRole } from "@/lib/types";

export function useGroupMembers(groupId: string | null) {
  const { user } = useAuth();
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [myMembership, setMyMembership] = useState<GroupMember | null>(null);

  // Real-time listener for group members
  useEffect(() => {
    if (!groupId || !user) {
      setMembers([]);
      setMyMembership(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const membersQuery = query(
      collection(db, "groupMembers"),
      where("groupId", "==", groupId),
      where("status", "==", "active")
    );

    const unsubscribe = onSnapshot(
      membersQuery,
      (snapshot) => {
        const membersData = snapshot.docs.map((doc) => ({
          ...doc.data(),
          id: doc.id,
        })) as GroupMember[];

        setMembers(membersData);

        // Find current user's membership
        const myMember = membersData.find((m) => m.userId === user.uid);
        setMyMembership(myMember || null);

        setLoading(false);
      },
      (err) => {
        console.error("Error listening to group members:", err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [groupId, user]);

  // Invite a new member
  const inviteMember = useCallback(
    async (email: string, role: GroupRole) => {
      if (!groupId || !user) {
        throw new Error("Must be logged in and in a group to invite members");
      }

      try {
        const response = await fetch(`/api/groups/${groupId}/members`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user.uid,
            email: email.toLowerCase().trim(),
            role,
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Failed to invite member");
        }

        return result;
      } catch (err) {
        console.error("Error inviting member:", err);
        throw err;
      }
    },
    [groupId, user]
  );

  // Update member role
  const updateMemberRole = useCallback(
    async (memberId: string, newRole: GroupRole) => {
      if (!groupId || !user) {
        throw new Error("Must be logged in and in a group to update member roles");
      }

      try {
        const response = await fetch(`/api/groups/${groupId}/members/${memberId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user.uid,
            newRole,
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Failed to update member role");
        }

        return result;
      } catch (err) {
        console.error("Error updating member role:", err);
        throw err;
      }
    },
    [groupId, user]
  );

  // Remove a member
  const removeMember = useCallback(
    async (memberId: string) => {
      if (!groupId || !user) {
        throw new Error("Must be logged in and in a group to remove members");
      }

      try {
        const response = await fetch(
          `/api/groups/${groupId}/members/${memberId}?userId=${user.uid}&action=remove`,
          {
            method: "DELETE",
          }
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Failed to remove member");
        }

        return result;
      } catch (err) {
        console.error("Error removing member:", err);
        throw err;
      }
    },
    [groupId, user]
  );

  // Leave the group
  const leaveGroup = useCallback(async () => {
    if (!groupId || !user || !myMembership) {
      throw new Error("Must be a member to leave the group");
    }

    try {
      const response = await fetch(
        `/api/groups/${groupId}/members/${myMembership.id}?userId=${user.uid}&action=leave`,
        {
          method: "DELETE",
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to leave group");
      }

      return result;
    } catch (err) {
      console.error("Error leaving group:", err);
      throw err;
    }
  }, [groupId, user, myMembership]);

  return {
    members,
    myMembership,
    loading,
    error,
    inviteMember,
    updateMemberRole,
    removeMember,
    leaveGroup,
  };
}

