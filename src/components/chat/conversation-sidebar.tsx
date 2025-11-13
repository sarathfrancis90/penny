"use client";

import { useState } from "react";
import { Conversation } from "@/lib/types";
import { ConversationCard } from "./conversation-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Search, Loader2, CheckSquare, Trash2, X } from "lucide-react";
import { isToday, isYesterday, isThisWeek, isThisMonth } from "date-fns";

interface ConversationSidebarProps {
  conversations: Conversation[];
  currentConversationId: string | null;
  loading: boolean;
  onConversationSelect: (conversationId: string) => void;
  onNewConversation: () => void;
  onPin: (conversationId: string, isPinned: boolean) => void;
  onArchive: (conversationId: string) => void;
  onDelete: (conversationId: string) => void;
  onBulkDelete?: (conversationIds: string[]) => void;
}

type DateGroup = "pinned" | "today" | "yesterday" | "this_week" | "this_month" | "older";

function getDateGroup(conversation: Conversation): DateGroup {
  if (conversation.metadata.isPinned) return "pinned";
  
  const date = conversation.updatedAt.toDate();
  if (isToday(date)) return "today";
  if (isYesterday(date)) return "yesterday";
  if (isThisWeek(date)) return "this_week";
  if (isThisMonth(date)) return "this_month";
  return "older";
}

const groupLabels: Record<DateGroup, string> = {
  pinned: "📌 Pinned",
  today: "Today",
  yesterday: "Yesterday",
  this_week: "This Week",
  this_month: "This Month",
  older: "Older",
};

export function ConversationSidebar({
  conversations,
  currentConversationId,
  loading,
  onConversationSelect,
  onNewConversation,
  onPin,
  onArchive,
  onDelete,
  onBulkDelete,
}: ConversationSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedConversations, setSelectedConversations] = useState<Set<string>>(new Set());

  // Filter conversations by search query
  const filteredConversations = conversations.filter((conv) =>
    conv.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    conv.lastMessagePreview.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group conversations by date
  const groupedConversations = filteredConversations.reduce((groups, conversation) => {
    const group = getDateGroup(conversation);
    if (!groups[group]) {
      groups[group] = [];
    }
    groups[group].push(conversation);
    return groups;
  }, {} as Record<DateGroup, Conversation[]>);

  // Selection handlers
  const handleSelectConversation = (conversationId: string) => {
    const newSelected = new Set(selectedConversations);
    if (newSelected.has(conversationId)) {
      newSelected.delete(conversationId);
    } else {
      newSelected.add(conversationId);
    }
    setSelectedConversations(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedConversations.size === filteredConversations.length) {
      setSelectedConversations(new Set());
    } else {
      setSelectedConversations(new Set(filteredConversations.map((c) => c.id)));
    }
  };

  const handleCancelSelection = () => {
    setSelectionMode(false);
    setSelectedConversations(new Set());
  };

  const handleBulkDelete = () => {
    if (onBulkDelete && selectedConversations.size > 0) {
      onBulkDelete(Array.from(selectedConversations));
      setSelectedConversations(new Set());
      setSelectionMode(false);
    }
  };

  const allSelected = filteredConversations.length > 0 && selectedConversations.size === filteredConversations.length;
  const someSelected = selectedConversations.size > 0 && selectedConversations.size < filteredConversations.length;

  return (
    <div className="w-80 border-r bg-background flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold gradient-text">Chat History</h2>
          <div className="flex items-center gap-2">
            {!selectionMode ? (
              <>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setSelectionMode(true)}
                  title="Select conversations"
                >
                  <CheckSquare className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="default"
                  className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700"
                  onClick={onNewConversation}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <Button
                size="icon"
                variant="ghost"
                onClick={handleCancelSelection}
                title="Cancel selection"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Selection mode header */}
        {selectionMode && (
          <div className="flex items-center gap-2 mb-3 pb-3 border-b">
            <Checkbox
              checked={allSelected}
              onCheckedChange={handleSelectAll}
              className="data-[state=indeterminate]:bg-violet-600"
              {...(someSelected ? { "data-state": "indeterminate" } : {})}
            />
            <span className="text-sm font-medium">
              {selectedConversations.size === 0
                ? "Select conversations"
                : `${selectedConversations.size} selected`}
            </span>
          </div>
        )}

        {/* Search */}
        {!selectionMode && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        )}
      </div>

      {/* Bulk Actions Bar */}
      {selectionMode && selectedConversations.size > 0 && (
        <div className="px-4 py-3 bg-violet-50 dark:bg-violet-950/30 border-b flex items-center justify-between">
          <span className="text-sm font-medium">
            {selectedConversations.size} conversation{selectedConversations.size !== 1 ? "s" : ""} selected
          </span>
          <Button
            size="sm"
            variant="destructive"
            onClick={handleBulkDelete}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
        </div>
      )}

      {/* Conversations List */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-violet-600" />
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              {searchQuery ? "No conversations found" : "No conversations yet"}
            </div>
          ) : (
            <>
              {(["pinned", "today", "yesterday", "this_week", "this_month", "older"] as DateGroup[]).map((group) => {
                const groupConversations = groupedConversations[group];
                if (!groupConversations || groupConversations.length === 0) return null;

                return (
                  <div key={group}>
                    <h3 className="text-xs font-semibold text-muted-foreground mb-2 px-1">
                      {groupLabels[group]}
                    </h3>
                    <div className="space-y-2">
                      {groupConversations.map((conversation) => (
                        <ConversationCard
                          key={conversation.id}
                          conversation={conversation}
                          isActive={conversation.id === currentConversationId && !selectionMode}
                          isSelected={selectedConversations.has(conversation.id)}
                          showCheckbox={selectionMode}
                          onClick={() => selectionMode ? handleSelectConversation(conversation.id) : onConversationSelect(conversation.id)}
                          onSelect={handleSelectConversation}
                          onPin={onPin}
                          onArchive={onArchive}
                          onDelete={onDelete}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

