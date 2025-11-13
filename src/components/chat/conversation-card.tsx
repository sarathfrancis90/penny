"use client";

import { Conversation } from "@/lib/types";
import { formatDistanceToNow } from "date-fns";
import { MessageSquare, Pin, Trash2, Archive } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConversationCardProps {
  conversation: Conversation;
  isActive?: boolean;
  isSelected?: boolean;
  showCheckbox?: boolean;
  onClick?: () => void;
  onSelect?: (conversationId: string) => void;
  onPin?: (conversationId: string, isPinned: boolean) => void;
  onArchive?: (conversationId: string) => void;
  onDelete?: (conversationId: string) => void;
}

export function ConversationCard({
  conversation,
  isActive = false,
  isSelected = false,
  showCheckbox = false,
  onClick,
  onSelect,
  onPin,
  onArchive,
  onDelete,
}: ConversationCardProps) {
  const timeAgo = formatDistanceToNow(conversation.updatedAt.toDate(), {
    addSuffix: true,
  });

  const handlePin = (e: React.MouseEvent) => {
    e.stopPropagation();
    onPin?.(conversation.id, !conversation.metadata.isPinned);
  };

  const handleArchive = (e: React.MouseEvent) => {
    e.stopPropagation();
    onArchive?.(conversation.id);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete?.(conversation.id);
  };

  const handleSelect = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect?.(conversation.id);
  };

  return (
    <Card
      className={cn(
        "p-4 cursor-pointer transition-all hover:shadow-md hover:border-violet-300 dark:hover:border-violet-700 relative group",
        isActive && "border-violet-500 bg-violet-50 dark:bg-violet-950/30",
        isSelected && "border-violet-500 bg-violet-50 dark:bg-violet-950/30",
        conversation.metadata.isPinned && "border-violet-400 dark:border-violet-600"
      )}
      onClick={onClick}
    >
      {conversation.metadata.isPinned && !showCheckbox && (
        <Pin className="absolute top-3 right-3 h-3 w-3 text-violet-600 dark:text-violet-400 fill-current" />
      )}

      <div className="flex items-start gap-3">
        {/* Checkbox for multi-select */}
        {showCheckbox && (
          <div className="pt-1" onClick={handleSelect}>
            <Checkbox checked={isSelected} />
          </div>
        )}

        {/* Icon */}
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0 text-white">
          <MessageSquare className="h-5 w-5" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="font-semibold text-base line-clamp-2">{conversation.title}</h3>
            {!showCheckbox && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handlePin}>
                    <Pin className="h-4 w-4 mr-2" />
                    {conversation.metadata.isPinned ? "Unpin" : "Pin"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleArchive}>
                    <Archive className="h-4 w-4 mr-2" />
                    Archive
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleDelete} className="text-red-600 dark:text-red-400">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          <p className="text-sm text-muted-foreground line-clamp-2 mb-2 leading-relaxed">
            {conversation.lastMessagePreview}
          </p>

          <div className="flex items-center flex-wrap gap-2 text-xs text-muted-foreground">
            <span>{timeAgo}</span>
            <span>•</span>
            <span>{conversation.messageCount} {conversation.messageCount === 1 ? 'message' : 'messages'}</span>
            {conversation.totalExpensesCreated > 0 && (
              <>
                <span>•</span>
                <span className="text-green-600 dark:text-green-400 font-medium">
                  {conversation.totalExpensesCreated} {conversation.totalExpensesCreated === 1 ? 'expense' : 'expenses'}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

