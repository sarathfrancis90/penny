/**
 * NotificationBell Component
 * 
 * Displays a bell icon in the header with unread notification count badge.
 * Opens notification panel on click.
 */

'use client';

import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useUnreadNotificationCount } from '@/hooks/useNotifications';

interface NotificationBellProps {
  userId?: string;
  onClick?: () => void;
  className?: string;
}

export function NotificationBell({ userId, onClick, className }: NotificationBellProps) {
  const { unreadCount, loading } = useUnreadNotificationCount(userId);

  // Don't show if no user
  if (!userId) {
    return null;
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn("relative", className)}
      onClick={onClick}
      aria-label={`Notifications, ${unreadCount} unread`}
    >
      <Bell className="h-5 w-5" />
      
      {!loading && unreadCount > 0 && (
        <Badge 
          className="absolute -top-1 -right-1 h-5 min-w-[20px] flex items-center justify-center p-0 px-1 bg-red-500 hover:bg-red-500 text-white text-xs animate-in zoom-in-50 duration-200"
          variant="destructive"
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </Badge>
      )}
    </Button>
  );
}

