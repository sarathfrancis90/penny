"use client";

import { useState } from "react";
import { useGroupMembers } from "@/hooks/useGroupMembers";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, UserPlus, Mail, Shield } from "lucide-react";
import { GroupRole } from "@/lib/types";

interface InviteMemberDialogProps {
  groupId: string;
  children?: React.ReactNode;
}

export function InviteMemberDialog({ groupId, children }: InviteMemberDialogProps) {
  const { inviteMember } = useGroupMembers(groupId);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<GroupRole>("member");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!email.trim()) {
      setError("Email is required");
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError("Please enter a valid email address");
      return;
    }

    setLoading(true);

    try {
      await inviteMember(email.trim().toLowerCase(), role);
      setSuccess("Invitation sent successfully!");
      setEmail("");
      setRole("member");
      
      // Close dialog after 1.5 seconds
      setTimeout(() => {
        setOpen(false);
        setSuccess("");
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send invitation");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      // Reset form when closing
      setEmail("");
      setRole("member");
      setError("");
      setSuccess("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {children || (
          <Button className="bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600">
            <UserPlus className="mr-2 h-4 w-4" />
            Invite Member
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-violet-500" />
              Invite Member to Group
            </DialogTitle>
            <DialogDescription>
              Send an invitation to join this group. They&apos;ll receive a notification and can accept or decline.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {error && (
              <div className="text-sm text-red-500 bg-red-50 dark:bg-red-950 p-3 rounded-md">
                {error}
              </div>
            )}

            {success && (
              <div className="text-sm text-green-500 bg-green-50 dark:bg-green-950 p-3 rounded-md">
                {success}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                Email Address *
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g., teammate@example.com"
                disabled={loading}
                required
              />
              <p className="text-xs text-muted-foreground">
                The person must have a Penny account with this email
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="role" className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                Role *
              </Label>
              <Select value={role} onValueChange={(value) => setRole(value as GroupRole)} disabled={loading}>
                <SelectTrigger id="role">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">
                    <div className="flex flex-col items-start">
                      <span className="font-semibold">Admin</span>
                      <span className="text-xs text-muted-foreground">
                        Can manage members and expenses
                      </span>
                    </div>
                  </SelectItem>
                  <SelectItem value="member">
                    <div className="flex flex-col items-start">
                      <span className="font-semibold">Member</span>
                      <span className="text-xs text-muted-foreground">
                        Can add and edit own expenses
                      </span>
                    </div>
                  </SelectItem>
                  <SelectItem value="viewer">
                    <div className="flex flex-col items-start">
                      <span className="font-semibold">Viewer</span>
                      <span className="text-xs text-muted-foreground">
                        Can only view expenses
                      </span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !email.trim()}
              className="bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Mail className="mr-2 h-4 w-4" />
                  Send Invitation
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

