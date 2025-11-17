/**
 * NotificationPanel Component
 * 
 * Dropdown panel that displays user notifications with filters, actions, and navigation.
 * Shows recent notifications with tabs to filter by category.
 */

'use client';

import { useState } from 'react';
import { Bell, Check, Settings, Trash2, ExternalLink } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useNotifications } from '@/hooks/useNotifications';
import { useNotificationActions } from '@/hooks/useNotificationActions';
import { Notification, NotificationCategory } from '@/lib/types/notifications';
import { formatDistanceToNow } from 'date-fns';

interface NotificationPanelProps {
  userId?: string;
  onClose?: () => void;
}

export function NotificationPanel({ userId, onClose }: NotificationPanelProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'all' | NotificationCategory>('all');

  type TabValue = 'all' | NotificationCategory;
  
  const { notifications, unreadCount, loading } = useNotifications({
    userId,
    category: activeTab === 'all' ? undefined : activeTab,
    limit: 20,
  });

  const { markAsRead, deleteNotification, markAllAsRead, loading: actionLoading } = useNotificationActions();

  const handleNotificationClick = async (notification: Notification) => {
    // Mark as read
    if (!notification.read) {
      await markAsRead(notification.id);
    }

    // Navigate if there's an action URL
    if (notification.actionUrl) {
      router.push(notification.actionUrl);
      onClose?.();
    }
  };

  const handleMarkAllRead = async () => {
    if (userId) {
      await markAllAsRead(userId);
    }
  };

  const handleDelete = async (e: React.MouseEvent, notificationId: string) => {
    e.stopPropagation();
    await deleteNotification(notificationId);
  };

  // Format relative time
  const formatTime = (timestamp: { toDate: () => Date } | undefined) => {
    if (!timestamp) return '';
    try {
      return formatDistanceToNow(timestamp.toDate(), { addSuffix: true });
    } catch {
      return '';
    }
  };

  return (
    <div className="w-[400px] max-w-[calc(100vw-2rem)]">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <span className="text-xs text-muted-foreground">
              ({unreadCount} new)
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllRead}
              disabled={actionLoading}
              className="h-8"
            >
              <Check className="h-4 w-4 mr-1" />
              Mark all read
            </Button>
          )}
          <Link href="/settings/notifications">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Settings className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)} className="w-full">
        <div className="border-b px-4">
          <TabsList className="h-10 grid w-full grid-cols-4">
            <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
            <TabsTrigger value="group" className="text-xs">Groups</TabsTrigger>
            <TabsTrigger value="budget" className="text-xs">Budgets</TabsTrigger>
            <TabsTrigger value="system" className="text-xs">System</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value={activeTab} className="m-0">
          <ScrollArea className="h-[500px]">
            {loading && (
              <div className="flex items-center justify-center py-12">
                <div className="text-center space-y-2">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-500 border-t-transparent mx-auto" />
                  <p className="text-sm text-muted-foreground">Loading notifications...</p>
                </div>
              </div>
            )}

            {!loading && notifications.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 px-4">
                <Bell className="h-12 w-12 text-muted-foreground opacity-50 mb-4" />
                <p className="text-sm text-muted-foreground text-center">No notifications yet</p>
                <p className="text-xs text-muted-foreground text-center mt-1">
                  We&apos;ll notify you when something important happens
                </p>
              </div>
            )}

            {!loading && notifications.length > 0 && (
              <div className="divide-y">
                {notifications.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onClick={() => handleNotificationClick(notification)}
                    onDelete={(e) => handleDelete(e, notification.id)}
                    formatTime={formatTime}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* Footer */}
      {notifications.length > 0 && (
        <>
          <Separator />
          <div className="p-3 text-center">
            <Link href="/notifications">
              <Button variant="ghost" size="sm" className="w-full text-xs" onClick={onClose}>
                View All Notifications
                <ExternalLink className="h-3 w-3 ml-2" />
              </Button>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Individual Notification Item Component
 */
interface NotificationItemProps {
  notification: Notification;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
  formatTime: (timestamp: { toDate: () => Date } | undefined) => string;
}

function NotificationItem({ notification, onClick, onDelete, formatTime }: NotificationItemProps) {
  return (
    <div
      className={cn(
        "p-4 hover:bg-accent transition-colors cursor-pointer group relative",
        !notification.read && "bg-violet-50 dark:bg-violet-950/20"
      )}
      onClick={onClick}
    >
      <div className="flex gap-3">
        {/* Icon/Avatar */}
        <div className="flex-shrink-0">
          {notification.actorAvatar ? (
            <Avatar className="h-10 w-10">
              <AvatarImage src={notification.actorAvatar} />
              <AvatarFallback>{notification.actorName?.[0] || '?'}</AvatarFallback>
            </Avatar>
          ) : (
            <div className="h-10 w-10 rounded-full bg-violet-100 dark:bg-violet-900 flex items-center justify-center text-lg">
              {notification.icon || '🔔'}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium line-clamp-2">{notification.title}</p>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{notification.body}</p>

          {/* Actions (if any) */}
          {notification.actions && notification.actions.length > 0 && (
            <div className="flex gap-2 mt-2">
              {notification.actions.map((action) => (
                <Button
                  key={action.id}
                  size="sm"
                  variant={action.variant === 'danger' ? 'destructive' : action.variant === 'primary' ? 'default' : 'outline'}
                  className="h-7 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    // Handle action click - will be implemented in Phase 2
                  }}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          )}

          {/* Timestamp */}
          <p className="text-xs text-muted-foreground mt-2">
            {formatTime(notification.createdAt)}
          </p>
        </div>

        {/* Unread indicator & Delete button */}
        <div className="flex-shrink-0 flex flex-col items-end justify-between">
          {!notification.read && (
            <div className="h-2 w-2 rounded-full bg-violet-600" />
          )}

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
          </Button>
        </div>
      </div>
    </div>
  );
}

