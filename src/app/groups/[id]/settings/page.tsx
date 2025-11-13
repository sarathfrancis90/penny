"use client";

import { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AppLayout } from "@/components/app-layout";
import { useGroups } from "@/hooks/useGroups";
import { useGroupMembers } from "@/hooks/useGroupMembers";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
import {
  Loader2,
  ArrowLeft,
  Save,
  Archive,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import { expenseCategories } from "@/lib/categories";
import { useAuth } from "@/hooks/useAuth";

interface GroupSettingsPageProps {
  params: Promise<{
    id: string;
  }>;
}

const currencies = ["CAD", "USD", "EUR", "GBP", "AUD", "INR", "JPY"];
const budgetPeriods = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

export default function GroupSettingsPage({ params }: GroupSettingsPageProps) {
  const { id: groupId } = use(params);
  const router = useRouter();
  const { user } = useAuth();
  const { groups, loading: groupsLoading } = useGroups();
  const { myMembership, loading: membersLoading } = useGroupMembers(groupId);

  const group = groups.find((g) => g.id === groupId);
  const loading = groupsLoading || membersLoading;

  // Form state
  const [name, setName] = useState(group?.name || "");
  const [description, setDescription] = useState(group?.description || "");
  const [icon, setIcon] = useState(group?.icon || "👥");
  const [color, setColor] = useState(group?.color || "#6366f1");
  const [defaultCategory, setDefaultCategory] = useState(group?.settings.defaultCategory || "");
  const [currency, setCurrency] = useState(group?.settings.currency || "CAD");
  const [requireApproval, setRequireApproval] = useState<boolean>(group?.settings.requireApproval ?? false);
  const [allowMemberInvites, setAllowMemberInvites] = useState<boolean>(group?.settings.allowMemberInvites ?? true);
  const [budget, setBudget] = useState(group?.settings.budget?.toString() || "");
  const [budgetPeriod, setBudgetPeriod] = useState<"monthly" | "quarterly" | "yearly">(
    group?.settings.budgetPeriod || "monthly"
  );

  const [saving, setSaving] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  // Update form when group loads
  useEffect(() => {
    if (group) {
      setName(group.name);
      setDescription(group.description || "");
      setIcon(group.icon || "👥");
      setColor(group.color || "#6366f1");
      setDefaultCategory(group.settings.defaultCategory || "");
      setCurrency(group.settings.currency || "CAD");
      setRequireApproval(group.settings.requireApproval);
      setAllowMemberInvites(group.settings.allowMemberInvites);
      setBudget(group.settings.budget?.toString() || "");
      setBudgetPeriod(group.settings.budgetPeriod || "monthly");
    }
  }, [group]);

  const isOwner = myMembership?.role === "owner";
  const isAdmin = myMembership?.role === "admin";
  const canEditSettings = isOwner;
  const canEditExpenseSettings = isOwner || isAdmin;

  if (loading) {
    return (
      <AppLayout>
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
        </div>
      </AppLayout>
    );
  }

  if (!group) {
    return (
      <AppLayout>
        <div className="container mx-auto px-4 py-8 max-w-2xl">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">Group Not Found</h1>
            <Link href="/groups">
              <Button>Back to Groups</Button>
            </Link>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!canEditSettings && !canEditExpenseSettings) {
    return (
      <AppLayout>
        <div className="container mx-auto px-4 py-8 max-w-2xl">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">Permission Denied</h1>
            <p className="text-muted-foreground mb-4">
              You don&apos;t have permission to edit group settings.
            </p>
            <Link href={`/groups/${groupId}`}>
              <Button>Back to Group</Button>
            </Link>
          </div>
        </div>
      </AppLayout>
    );
  }

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Group name is required");
      return;
    }

    if (!user) {
      toast.error("You must be logged in to update group settings");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch(`/api/groups/${groupId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.uid,
          name: name.trim(),
          description: description.trim() || undefined,
          icon: icon || undefined,
          color: color || undefined,
          settings: {
            defaultCategory: defaultCategory || undefined,
            currency,
            requireApproval,
            allowMemberInvites,
            budget: budget ? parseFloat(budget) : undefined,
            budgetPeriod,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update group");
      }

      toast.success("Group settings updated successfully!");
      
      // Small delay to show the toast before navigating
      setTimeout(() => {
        router.push(`/groups/${groupId}`);
      }, 1000);
    } catch (error) {
      console.error("Error updating group:", error);
      toast.error(error instanceof Error ? error.message : "Failed to update group");
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!user) {
      toast.error("You must be logged in to archive a group");
      return;
    }

    setActionLoading(true);
    try {
      const response = await fetch(`/api/groups/${groupId}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.uid }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to archive group");
      }

      toast.success("Group archived successfully!");
      
      // Small delay to show the toast before navigating
      setTimeout(() => {
        router.push("/groups");
      }, 1000);
    } catch (error) {
      console.error("Error archiving group:", error);
      toast.error(error instanceof Error ? error.message : "Failed to archive group");
      setActionLoading(false);
      setArchiveDialogOpen(false);
    }
  };

  const handleDelete = async () => {
    if (deleteConfirmation !== group.name) {
      toast.error("Please type the group name to confirm deletion");
      return;
    }

    if (!user) {
      toast.error("You must be logged in to delete a group");
      return;
    }

    setActionLoading(true);
    try {
      const response = await fetch(`/api/groups/${groupId}?userId=${user.uid}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete group");
      }

      toast.success("Group deleted successfully!");
      
      // Small delay to show the toast before navigating
      setTimeout(() => {
        router.push("/groups");
      }, 1000);
    } catch (error) {
      console.error("Error deleting group:", error);
      toast.error(error instanceof Error ? error.message : "Failed to delete group");
      setActionLoading(false);
      setDeleteDialogOpen(false);
    }
  };

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-8 max-w-3xl space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href={`/groups/${groupId}`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-3xl font-bold gradient-text">Group Settings</h1>
            <p className="text-muted-foreground">Manage your group preferences</p>
          </div>
          <Button
            onClick={handleSave}
            disabled={saving || !canEditSettings}
            className="bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600"
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Changes
              </>
            )}
          </Button>
        </div>

        {/* Basic Information */}
        <Card className="glass">
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>Update your group&apos;s name, description, and appearance</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Group Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter group name"
                maxLength={50}
                disabled={!canEditSettings}
              />
              <p className="text-xs text-muted-foreground">
                {name.length}/50 characters
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this group for?"
                maxLength={200}
                rows={3}
                disabled={!canEditSettings}
              />
              <p className="text-xs text-muted-foreground">
                {description.length}/200 characters
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="icon">Icon (Emoji)</Label>
                <div className="space-y-2">
                  <Input
                    id="icon"
                    value={icon}
                    onChange={(e) => setIcon(e.target.value)}
                    placeholder="👥"
                    maxLength={2}
                    disabled={!canEditSettings}
                    className="text-3xl text-center"
                  />
                  <p className="text-xs text-muted-foreground">
                    Tap the field above, then use your device&apos;s emoji keyboard to select an emoji
                  </p>
                  {/* Quick emoji presets */}
                  <div className="flex flex-wrap gap-2">
                    {["👥", "🏠", "💼", "🎉", "✈️", "🍔", "🏃", "📚", "💰", "🎯"].map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setIcon(emoji)}
                        disabled={!canEditSettings}
                        className="text-2xl p-2 hover:bg-accent rounded-lg transition-colors disabled:opacity-50"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="color">Color</Label>
                <div className="flex gap-2">
                  <Input
                    id="color"
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    disabled={!canEditSettings}
                    className="w-20 h-10"
                  />
                  <Input
                    type="text"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    disabled={!canEditSettings}
                    placeholder="#6366f1"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Expense Settings */}
        <Card className="glass">
          <CardHeader>
            <CardTitle>Expense Settings</CardTitle>
            <CardDescription>Configure how expenses are managed in this group</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="defaultCategory">Default Category</Label>
              <Select
                value={defaultCategory || "none"}
                onValueChange={(value) => setDefaultCategory(value === "none" ? "" : value)}
                disabled={!canEditExpenseSettings}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select default category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {expenseCategories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Select
                value={currency}
                onValueChange={setCurrency}
                disabled={!canEditExpenseSettings}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map((curr) => (
                    <SelectItem key={curr} value={curr}>
                      {curr}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between py-2">
              <div className="space-y-0.5">
                <Label>Require Expense Approval</Label>
                <p className="text-sm text-muted-foreground">
                  Admins must approve expenses before they count
                </p>
              </div>
              <Switch
                checked={requireApproval}
                onCheckedChange={setRequireApproval}
                disabled={!canEditExpenseSettings}
              />
            </div>
          </CardContent>
        </Card>

        {/* Budget Settings */}
        <Card className="glass">
          <CardHeader>
            <CardTitle>Budget Settings</CardTitle>
            <CardDescription>Set spending limits for this group</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="budget">Budget Amount</Label>
                <Input
                  id="budget"
                  type="number"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  disabled={!canEditExpenseSettings}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="budgetPeriod">Period</Label>
                <Select
                  value={budgetPeriod}
                  onValueChange={(value: "monthly" | "quarterly" | "yearly") => setBudgetPeriod(value)}
                  disabled={!canEditExpenseSettings}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {budgetPeriods.map((period) => (
                      <SelectItem key={period.value} value={period.value}>
                        {period.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Leave empty to disable budget tracking
            </p>
          </CardContent>
        </Card>

        {/* Member Permissions */}
        <Card className="glass">
          <CardHeader>
            <CardTitle>Member Permissions</CardTitle>
            <CardDescription>Control what members can do in this group</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between py-2">
              <div className="space-y-0.5">
                <Label>Allow Members to Invite Others</Label>
                <p className="text-sm text-muted-foreground">
                  Let regular members send invitations
                </p>
              </div>
              <Switch
                checked={allowMemberInvites}
                onCheckedChange={setAllowMemberInvites}
                disabled={!canEditExpenseSettings}
              />
            </div>
          </CardContent>
        </Card>

        {/* Danger Zone - Only for Owner */}
        {isOwner && (
          <Card className="glass border-red-500/50">
            <CardHeader>
              <CardTitle className="text-red-500 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Danger Zone
              </CardTitle>
              <CardDescription>Irreversible actions - proceed with caution</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between py-2">
                <div className="space-y-0.5">
                  <Label>Archive Group</Label>
                  <p className="text-sm text-muted-foreground">
                    Make this group read-only. Can be restored later.
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => setArchiveDialogOpen(true)}
                  className="border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white"
                >
                  <Archive className="mr-2 h-4 w-4" />
                  Archive
                </Button>
              </div>

              <div className="flex items-center justify-between py-2">
                <div className="space-y-0.5">
                  <Label>Delete Group</Label>
                  <p className="text-sm text-muted-foreground">
                    Permanently delete this group and all its data
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => setDeleteDialogOpen(true)}
                  className="border-red-500 text-red-500 hover:bg-red-500 hover:text-white"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Archive Confirmation Dialog */}
        <AlertDialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Archive Group?</AlertDialogTitle>
              <AlertDialogDescription>
                This will make the group read-only. Members can view but not add new expenses.
                You can restore it later from the archived groups list.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleArchive}
                disabled={actionLoading}
                className="bg-orange-500 hover:bg-orange-600"
              >
                {actionLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Archiving...
                  </>
                ) : (
                  "Archive Group"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-red-500 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Delete Group Permanently?
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-4">
                <p>
                  This action <strong>cannot be undone</strong>. This will permanently delete:
                </p>
                <ul className="list-disc list-inside space-y-1">
                  <li>{group.stats.memberCount} member(s) will lose access</li>
                  <li>{group.stats.expenseCount} expense(s) will become personal</li>
                  <li>All group activity history will be lost</li>
                </ul>
                <div className="space-y-2">
                  <Label htmlFor="deleteConfirm">
                    Type <strong>{group.name}</strong> to confirm:
                  </Label>
                  <Input
                    id="deleteConfirm"
                    value={deleteConfirmation}
                    onChange={(e) => setDeleteConfirmation(e.target.value)}
                    placeholder="Type group name"
                  />
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setDeleteConfirmation("")}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={actionLoading || deleteConfirmation !== group.name}
                className="bg-red-500 hover:bg-red-600"
              >
                {actionLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  "Delete Permanently"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}

