import { useState, useEffect, useCallback } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "./useAuth";
import { Group, GroupMember } from "@/lib/types";

export interface GroupWithRole extends Group {
  myRole: string;
  memberCount: number;
}

export function useGroups() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<GroupWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Real-time listener for user's groups
  useEffect(() => {
    if (!user) {
      setGroups([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // Listen to user's group memberships
    const membershipsQuery = query(
      collection(db, "groupMembers"),
      where("userId", "==", user.uid),
      where("status", "==", "active")
    );

    const unsubscribeMemberships = onSnapshot(
      membershipsQuery,
      async (snapshot) => {
        try {
          const memberships = snapshot.docs.map((doc) => doc.data() as GroupMember);
          const groupIds = memberships.map((m) => m.groupId);

          if (groupIds.length === 0) {
            setGroups([]);
            setLoading(false);
            return;
          }

          // Listen to groups
          const groupsQuery = query(
            collection(db, "groups"),
            where("__name__", "in", groupIds)
          );

          const unsubscribeGroups = onSnapshot(groupsQuery, (groupsSnapshot) => {
            const groupsData = groupsSnapshot.docs.map((doc) => {
              const groupData = doc.data() as Group;
              const membership = memberships.find((m) => m.groupId === doc.id);

              return {
                ...groupData,
                id: doc.id,
                myRole: membership?.role || "viewer",
                memberCount: groupData.stats?.memberCount || 0,
              };
            });

            setGroups(groupsData);
            setLoading(false);
          });

          return () => unsubscribeGroups();
        } catch (err) {
          console.error("Error fetching groups:", err);
          setError(err instanceof Error ? err.message : "Failed to fetch groups");
          setLoading(false);
        }
      },
      (err) => {
        console.error("Error listening to memberships:", err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribeMemberships();
  }, [user]);

  // Create a new group
  const createGroup = useCallback(
    async (data: {
      name: string;
      description?: string;
      color?: string;
      icon?: string;
      settings?: {
        requireApproval?: boolean;
        allowMemberInvites?: boolean;
        currency?: string;
        defaultCategory?: string;
        budget?: number;
        budgetPeriod?: "monthly" | "quarterly" | "yearly";
      };
    }) => {
      if (!user) {
        throw new Error("Must be logged in to create a group");
      }

      try {
        const response = await fetch("/api/groups", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...data,
            userId: user.uid,
            userEmail: user.email,
            userName: user.displayName || user.email,
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Failed to create group");
        }

        return result.group;
      } catch (err) {
        console.error("Error creating group:", err);
        throw err;
      }
    },
    [user]
  );

  // Update a group
  const updateGroup = useCallback(
    async (
      groupId: string,
      updates: {
        name?: string;
        description?: string;
        color?: string;
        icon?: string;
        settings?: Partial<Group["settings"]>;
      }
    ) => {
      if (!user) {
        throw new Error("Must be logged in to update a group");
      }

      try {
        const response = await fetch(`/api/groups/${groupId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user.uid,
            ...updates,
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Failed to update group");
        }

        return result;
      } catch (err) {
        console.error("Error updating group:", err);
        throw err;
      }
    },
    [user]
  );

  // Delete (archive) a group
  const deleteGroup = useCallback(
    async (groupId: string) => {
      if (!user) {
        throw new Error("Must be logged in to delete a group");
      }

      try {
        const response = await fetch(`/api/groups/${groupId}?userId=${user.uid}`, {
          method: "DELETE",
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Failed to delete group");
        }

        return result;
      } catch (err) {
        console.error("Error deleting group:", err);
        throw err;
      }
    },
    [user]
  );

  return {
    groups,
    loading,
    error,
    createGroup,
    updateGroup,
    deleteGroup,
  };
}

