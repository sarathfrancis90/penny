"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useGroups } from "@/hooks/useGroups";
import { useGroupMembers } from "@/hooks/useGroupMembers";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, Crown, Shield, User, Eye, UserX, Loader2 } from "lucide-react";
import { GroupRole } from "@/lib/types";

interface MembersPageProps {
  params: Promise<{ id: string }>;
}

export default function MembersPage({ params }: MembersPageProps) {
  const { id: groupId } = use(params);
  const router = useRouter();
  const { user } = useAuth();
  const { groups, loading: groupsLoading } = useGroups();
  const { members, loading: membersLoading, error } = useGroupMembers(groupId);

  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [removingRole, setRemovingRole] = useState<string>("");
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const group = groups.find((g) => g.id === groupId);
  const currentUserMembership = members.find((m) => m.userId === user?.uid);

  // Permission checks
  const isOwner = currentUserMembership?.role === "owner";
  const isAdmin = currentUserMembership?.role === "admin";
  const canManageRoles = isOwner || isAdmin; // Only owners and admins can manage roles
  const canRemoveMembers = currentUserMembership?.permissions.canRemoveMembers || false;

  const handleRoleChange = async (memberId: string, newRole: GroupRole) => {
    if (!user) return;

    setUpdatingRoleId(memberId);
    setActionLoading(true);

    try {
      const response = await fetch(
        `/api/groups/${groupId}/members/${memberId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newRole }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to update role");
      }

      console.log("Role updated successfully");
    } catch (err) {
      console.error("Error updating role:", err);
      alert(err instanceof Error ? err.message : "Failed to update member role");
    } finally {
      setUpdatingRoleId(null);
      setActionLoading(false);
    }
  };

  const handleRemoveMember = async () => {
    if (!removingMemberId) return;

    setActionLoading(true);

    try {
      const response = await fetch(
        `/api/groups/${groupId}/members/${removingMemberId}?action=remove`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to remove member");
      }

      console.log("Member removed successfully");
      setRemovingMemberId(null);
      setRemovingRole("");
    } catch (err) {
      console.error("Error removing member:", err);
      alert(err instanceof Error ? err.message : "Failed to remove member");
    } finally {
      setActionLoading(false);
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "owner":
        return <Crown className="h-4 w-4 text-yellow-500" />;
      case "admin":
        return <Shield className="h-4 w-4 text-blue-500" />;
      case "member":
        return <User className="h-4 w-4 text-green-500" />;
      case "viewer":
        return <Eye className="h-4 w-4 text-gray-500" />;
      default:
        return <User className="h-4 w-4" />;
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "owner":
        return "default";
      case "admin":
        return "secondary";
      case "member":
        return "outline";
      case "viewer":
        return "outline";
      default:
        return "outline";
    }
  };

  const canModifyRole = (targetRole: string) => {
    if (!canManageRoles) return false;
    if (targetRole === "owner") return isOwner; // Only owner can modify owner
    if (targetRole === "admin") return isOwner; // Only owner can modify admin
    return true; // Admins can modify members and viewers
  };

  const canRemove = (targetRole: string) => {
    if (!canRemoveMembers) return false;
    if (targetRole === "owner") return false; // Can't remove owner
    if (targetRole === "admin") return isOwner; // Only owner can remove admin
    return true;
  };

  if (groupsLoading || membersLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
        </div>
      </AppLayout>
    );
  }

  if (!group) {
    return (
      <AppLayout>
        <div className="max-w-2xl mx-auto p-6">
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground">Group not found</p>
              <div className="flex justify-center mt-4">
                <Button asChild variant="outline">
                  <Link href="/groups">Back to Groups</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout>
        <div className="max-w-2xl mx-auto p-6">
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-destructive">{error}</p>
              <div className="flex justify-center mt-4">
                <Button onClick={() => router.back()} variant="outline">
                  Go Back
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link href={`/groups/${groupId}`}>
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div>
              <h1 className="text-3xl font-bold gradient-text">Member Management</h1>
              <p className="text-muted-foreground mt-1">
                Manage roles and permissions for {group.name}
              </p>
            </div>
          </div>
        </div>

        {/* Members List */}
        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Members ({members.length})
            </CardTitle>
            <CardDescription>
              View and manage member roles and permissions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg border border-border/50 hover:border-violet-500/50 transition-all gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white font-semibold shrink-0">
                        {member.userEmail.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold truncate">{member.userEmail}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge
                            variant={getRoleBadgeVariant(member.role)}
                            className="text-xs flex items-center gap-1"
                          >
                            {getRoleIcon(member.role)}
                            {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                          </Badge>
                          {member.userId === user?.uid && (
                            <Badge variant="outline" className="text-xs">
                              You
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Permissions Summary */}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {member.permissions.canAddExpenses && (
                        <Badge variant="secondary" className="text-xs">
                          Add Expenses
                        </Badge>
                      )}
                      {member.permissions.canEditAllExpenses && (
                        <Badge variant="secondary" className="text-xs">
                          Edit All Expenses
                        </Badge>
                      )}
                      {member.permissions.canInviteMembers && (
                        <Badge variant="secondary" className="text-xs">
                          Invite Members
                        </Badge>
                      )}
                      {member.permissions.canManageSettings && (
                        <Badge variant="secondary" className="text-xs">
                          Manage Settings
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  {member.userId !== user?.uid && (
                    <div className="flex items-center gap-2 shrink-0">
                      {/* Role Selector */}
                      {canModifyRole(member.role) && (
                        <Select
                          value={member.role}
                          onValueChange={(value) =>
                            handleRoleChange(member.id!, value as GroupRole)
                          }
                          disabled={updatingRoleId === member.id || actionLoading}
                        >
                          <SelectTrigger className="w-[140px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="viewer">
                              <div className="flex items-center gap-2">
                                <Eye className="h-4 w-4" />
                                Viewer
                              </div>
                            </SelectItem>
                            <SelectItem value="member">
                              <div className="flex items-center gap-2">
                                <User className="h-4 w-4" />
                                Member
                              </div>
                            </SelectItem>
                            <SelectItem value="admin">
                              <div className="flex items-center gap-2">
                                <Shield className="h-4 w-4" />
                                Admin
                              </div>
                            </SelectItem>
                            {isOwner && (
                              <SelectItem value="owner">
                                <div className="flex items-center gap-2">
                                  <Crown className="h-4 w-4" />
                                  Owner
                                </div>
                              </SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      )}

                      {/* Remove Button */}
                      {canRemove(member.role) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setRemovingMemberId(member.id!);
                            setRemovingRole(member.role);
                          }}
                          disabled={actionLoading}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <UserX className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {members.length === 0 && (
              <p className="text-center text-muted-foreground py-8">
                No members found
              </p>
            )}
          </CardContent>
        </Card>

        {/* Role Descriptions */}
        <Card className="glass">
          <CardHeader>
            <CardTitle>Role Descriptions</CardTitle>
            <CardDescription>
              Understanding permissions for each role
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="p-4 rounded-lg border">
                <div className="flex items-center gap-2 mb-2">
                  <Crown className="h-5 w-5 text-yellow-500" />
                  <h3 className="font-semibold">Owner</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Full control over the group, including settings, members, and deletion.
                  Can transfer ownership.
                </p>
              </div>

              <div className="p-4 rounded-lg border">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="h-5 w-5 text-blue-500" />
                  <h3 className="font-semibold">Admin</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Can manage members, invite users, and modify expenses. Cannot change settings or delete group.
                </p>
              </div>

              <div className="p-4 rounded-lg border">
                <div className="flex items-center gap-2 mb-2">
                  <User className="h-5 w-5 text-green-500" />
                  <h3 className="font-semibold">Member</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Can add and edit their own expenses. Can view all group expenses and members.
                </p>
              </div>

              <div className="p-4 rounded-lg border">
                <div className="flex items-center gap-2 mb-2">
                  <Eye className="h-5 w-5 text-gray-500" />
                  <h3 className="font-semibold">Viewer</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Can only view group expenses and members. Cannot add or edit anything.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Remove Member Confirmation Dialog */}
        <AlertDialog
          open={!!removingMemberId}
          onOpenChange={() => {
            setRemovingMemberId(null);
            setRemovingRole("");
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove Member?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to remove this {removingRole} from the group?
                <br />
                <br />
                They will lose access to all group expenses and will need to be re-invited to rejoin.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={actionLoading}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleRemoveMember}
                disabled={actionLoading}
                className="bg-red-500 hover:bg-red-600"
              >
                {actionLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Removing...
                  </>
                ) : (
                  "Remove Member"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}

