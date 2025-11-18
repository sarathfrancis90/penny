"use client";

import { useState } from "react";
import { useGroups } from "@/hooks/useGroups";
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
import { GradientButton } from "@/components/ui/gradient-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Users, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const GROUP_COLORS = [
  { name: "Violet", value: "#8B5CF6" },
  { name: "Blue", value: "#3B82F6" },
  { name: "Green", value: "#10B981" },
  { name: "Orange", value: "#F59E0B" },
  { name: "Pink", value: "#EC4899" },
  { name: "Red", value: "#EF4444" },
];

const GROUP_ICONS = ["👥", "💼", "🏠", "✈️", "🎉", "🍽️", "🚗", "💰"];

export function CreateGroupDialog() {
  const { createGroup } = useGroups();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedColor, setSelectedColor] = useState(GROUP_COLORS[0].value);
  const [selectedIcon, setSelectedIcon] = useState(GROUP_ICONS[0]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Group name is required");
      return;
    }

    setLoading(true);

    try {
      await createGroup({
        name: name.trim(),
        description: description.trim(),
        color: selectedColor,
        icon: selectedIcon,
        settings: {
          requireApproval: false,
          allowMemberInvites: true,
          currency: "CAD",
        },
      });

      // Reset form
      setName("");
      setDescription("");
      setSelectedColor(GROUP_COLORS[0].value);
      setSelectedIcon(GROUP_ICONS[0]);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create group");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <GradientButton variant="primary">
          <Plus className="mr-2 h-4 w-4" />
          New Group
        </GradientButton>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-violet-500" />
              Create New Group
            </DialogTitle>
            <DialogDescription>
              Create a group to track shared expenses with friends, family, or colleagues.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {error && (
              <div className="text-sm text-red-500 bg-red-50 dark:bg-red-950 p-3 rounded-md">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">Group Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Family Vacation, Team Lunch"
                maxLength={100}
                disabled={loading}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g., Trip to Hawaii 2025"
                maxLength={200}
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label>Color Theme</Label>
              <div className="flex gap-2 flex-wrap">
                {GROUP_COLORS.map((color) => (
                  <button
                    key={color.value}
                    type="button"
                    onClick={() => setSelectedColor(color.value)}
                    disabled={loading}
                    className={cn(
                      "w-10 h-10 rounded-full border-2 transition-all",
                      selectedColor === color.value
                        ? "border-foreground scale-110 shadow-lg"
                        : "border-transparent hover:scale-105"
                    )}
                    style={{ backgroundColor: color.value }}
                    aria-label={color.name}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Icon</Label>
              <div className="flex gap-2 flex-wrap">
                {GROUP_ICONS.map((icon) => (
                  <button
                    key={icon}
                    type="button"
                    onClick={() => setSelectedIcon(icon)}
                    disabled={loading}
                    className={cn(
                      "w-12 h-12 text-2xl rounded-lg border-2 transition-all hover:scale-105",
                      selectedIcon === icon
                        ? "border-primary bg-primary/10 scale-110"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    {icon}
                  </button>
                ))}
              </div>
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
            <GradientButton
              type="submit"
              disabled={loading || !name.trim()}
              variant="primary"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Group"
              )}
            </GradientButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

