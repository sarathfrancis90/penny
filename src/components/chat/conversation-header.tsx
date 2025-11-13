"use client";

import { Conversation } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MessageSquare,
  MoreVertical,
  Edit,
  Archive,
  Trash2,
  Pin,
  Menu,
} from "lucide-react";

interface ConversationHeaderProps {
  conversation: Conversation | null;
  onMenuClick?: () => void; // For mobile drawer toggle
  onEditTitle?: (conversationId: string) => void;
  onPin?: (conversationId: string, isPinned: boolean) => void;
  onArchive?: (conversationId: string) => void;
  onDelete?: (conversationId: string) => void;
}

export function ConversationHeader({
  conversation,
  onMenuClick,
  onEditTitle,
  onPin,
  onArchive,
  onDelete,
}: ConversationHeaderProps) {
  if (!conversation) {
    return (
      <div className="border-b bg-background/95 backdrop-blur-sm px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={onMenuClick}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            <h1 className="text-lg font-semibold">New Conversation</h1>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="border-b bg-background/95 backdrop-blur-sm px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={onMenuClick}
        >
          <Menu className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {conversation.metadata.isPinned && (
            <Pin className="h-4 w-4 text-violet-600 dark:text-violet-400 fill-current shrink-0" />
          )}
          <MessageSquare className="h-5 w-5 text-violet-600 dark:text-violet-400 shrink-0" />
          <h1 className="text-lg font-semibold truncate">{conversation.title}</h1>
        </div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <MoreVertical className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onEditTitle?.(conversation.id)}>
            <Edit className="h-4 w-4 mr-2" />
            Edit Title
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => onPin?.(conversation.id, !conversation.metadata.isPinned)}
          >
            <Pin className="h-4 w-4 mr-2" />
            {conversation.metadata.isPinned ? "Unpin" : "Pin"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onArchive?.(conversation.id)}>
            <Archive className="h-4 w-4 mr-2" />
            Archive
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => onDelete?.(conversation.id)}
            className="text-red-600 dark:text-red-400"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

