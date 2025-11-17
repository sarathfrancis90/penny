"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/app-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Bell, BellOff, Loader2, Save, Moon, Sparkles } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, Timestamp } from "firebase/firestore";
import type { NotificationType, NotificationFrequency } from "@/lib/types/notifications";

// Notification type categories for better organization
const NOTIFICATION_CATEGORIES = {
  group: {
    title: "👥 Group Notifications",
    description: "Get notified about group activity and changes",
    types: [
      { type: "group_expense_added" as NotificationType, label: "New Expense Added", description: "When someone adds an expense to a group" },
      { type: "group_invitation" as NotificationType, label: "Group Invitations", description: "When you're invited to join a group" },
      { type: "group_member_joined" as NotificationType, label: "Member Joined", description: "When a new member joins your group" },
      { type: "group_member_left" as NotificationType, label: "Member Left", description: "When a member leaves your group" },
      { type: "group_role_changed" as NotificationType, label: "Role Changed", description: "When your role in a group changes" },
      { type: "group_settings_changed" as NotificationType, label: "Settings Changed", description: "When group settings are changed" },
    ]
  },
  budget: {
    title: "💰 Budget Notifications",
    description: "Stay on top of your spending limits",
    types: [
      { type: "budget_warning" as NotificationType, label: "Budget Warning (75%)", description: "When you've used 75% of a budget" },
      { type: "budget_critical" as NotificationType, label: "Budget Critical (90%)", description: "When you've used 90% of a budget" },
      { type: "budget_exceeded" as NotificationType, label: "Budget Exceeded", description: "When you exceed a budget limit" },
      { type: "budget_reset" as NotificationType, label: "Budget Reset", description: "Monthly budget reset notifications" },
    ]
  },
  system: {
    title: "📊 System Notifications",
    description: "Summaries and reminders",
    types: [
      { type: "weekly_summary" as NotificationType, label: "Weekly Summary", description: "Your weekly spending summary" },
      { type: "monthly_summary" as NotificationType, label: "Monthly Summary", description: "Your monthly spending summary" },
      { type: "receipts_uncategorized" as NotificationType, label: "Uncategorized Receipts", description: "Reminders to categorize receipts" },
    ]
  },
};

type NotificationPreferenceValue = {
  inApp: boolean;
  push: boolean;
  frequency: NotificationFrequency;
};

export default function NotificationSettingsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // User-level settings
  const [globalMute, setGlobalMute] = useState(false);
  const [quietHoursStart, setQuietHoursStart] = useState("22:00");
  const [quietHoursEnd, setQuietHoursEnd] = useState("08:00");
  
  // Notification preferences by type
  const [preferences, setPreferences] = useState<Record<NotificationType, NotificationPreferenceValue>>({} as Record<NotificationType, NotificationPreferenceValue>);

  const loadSettings = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);

      // Load user-level settings
      const settingsDoc = await getDoc(doc(db, "userNotificationSettings", user.uid));
      if (settingsDoc.exists()) {
        const settings = settingsDoc.data();
        setGlobalMute(settings.globalMute || false);
        setQuietHoursStart(settings.quietHoursStart || "22:00");
        setQuietHoursEnd(settings.quietHoursEnd || "08:00");
      }

      // Load notification preferences
      const prefsSnapshot = await getDoc(doc(db, "users", user.uid, "notificationPreferences", "default"));
      if (prefsSnapshot.exists()) {
        const prefs = prefsSnapshot.data() as Record<NotificationType, NotificationPreferenceValue>;
        setPreferences(prefs);
      } else {
        // Set defaults
        const defaults: Record<string, NotificationPreferenceValue> = {};
        Object.values(NOTIFICATION_CATEGORIES).forEach(category => {
          category.types.forEach(({ type }) => {
            defaults[type] = {
              inApp: true,
              push: true,
              frequency: "realtime" as NotificationFrequency,
            };
          });
        });
        setPreferences(defaults as Record<NotificationType, NotificationPreferenceValue>);
      }
    } catch (error) {
      console.error("Error loading notification settings:", error);
      toast.error("Failed to load notification settings");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
      return;
    }

    if (user) {
      loadSettings();
    }
  }, [user, authLoading, router, loadSettings]);

  const saveSettings = async () => {
    if (!user) return;

    try {
      setSaving(true);

      // Save user-level settings
      await setDoc(doc(db, "userNotificationSettings", user.uid), {
        userId: user.uid,
        globalMute,
        quietHoursStart,
        quietHoursEnd,
        updatedAt: Timestamp.now(),
        createdAt: Timestamp.now(),
      }, { merge: true });

      // Save notification preferences
      await setDoc(doc(db, "users", user.uid, "notificationPreferences", "default"), preferences, { merge: true });

      toast.success("Notification settings saved!");
    } catch (error) {
      console.error("Error saving notification settings:", error);
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const updatePreference = (type: NotificationType, field: "inApp" | "push" | "frequency", value: boolean | NotificationFrequency) => {
    setPreferences(prev => ({
      ...prev,
      [type]: {
        ...prev[type],
        [field]: value,
      }
    }));
  };

  if (authLoading || loading) {
    return (
      <AppLayout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center space-y-4">
            <Loader2 className="h-12 w-12 animate-spin text-violet-600 mx-auto" />
            <p className="text-muted-foreground">Loading settings...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-8 max-w-4xl space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-3xl font-bold gradient-text flex items-center gap-2">
              <Bell className="h-8 w-8" />
              Notification Settings
            </h1>
            <p className="text-muted-foreground mt-1">
              Customize how and when you receive notifications
            </p>
          </div>
          <Button 
            onClick={saveSettings} 
            disabled={saving}
            className="bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Settings
              </>
            )}
          </Button>
        </div>

        {/* Global Settings */}
        <Card className="glass border-2 border-violet-200/50 dark:border-violet-800/30 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-violet-500" />
              Global Settings
            </CardTitle>
            <CardDescription>
              General notification preferences
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Global Mute */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="global-mute" className="text-base">
                  {globalMute ? <BellOff className="inline h-4 w-4 mr-2" /> : <Bell className="inline h-4 w-4 mr-2" />}
                  Pause All Notifications
                </Label>
                <p className="text-sm text-muted-foreground">
                  Temporarily disable all notifications
                </p>
              </div>
              <Switch
                id="global-mute"
                checked={globalMute}
                onCheckedChange={setGlobalMute}
              />
            </div>

            <Separator />

            {/* Quiet Hours */}
            <div className="space-y-4">
              <div className="space-y-0.5">
                <Label className="text-base flex items-center gap-2">
                  <Moon className="h-4 w-4" />
                  Quiet Hours
                </Label>
                <p className="text-sm text-muted-foreground">
                  Don&apos;t send notifications during these hours
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="quiet-start">Start Time</Label>
                  <input
                    id="quiet-start"
                    type="time"
                    value={quietHoursStart}
                    onChange={(e) => setQuietHoursStart(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quiet-end">End Time</Label>
                  <input
                    id="quiet-end"
                    type="time"
                    value={quietHoursEnd}
                    onChange={(e) => setQuietHoursEnd(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notification Type Preferences */}
        {Object.entries(NOTIFICATION_CATEGORIES).map(([categoryKey, category]) => (
          <Card key={categoryKey} className="glass border-2 border-violet-200/50 dark:border-violet-800/30 shadow-lg">
            <CardHeader>
              <CardTitle>{category.title}</CardTitle>
              <CardDescription>{category.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {category.types.map(({ type, label, description }) => (
                <div key={type} className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 flex-1">
                      <Label className="text-base">{label}</Label>
                      <p className="text-sm text-muted-foreground">{description}</p>
                    </div>
                    <Badge variant="outline" className="ml-2">
                      {preferences[type]?.frequency || "realtime"}
                    </Badge>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pl-4">
                    <div className="flex items-center space-x-2">
                      <Switch
                        id={`${type}-inapp`}
                        checked={preferences[type]?.inApp ?? true}
                        onCheckedChange={(checked) => updatePreference(type, "inApp", checked)}
                        disabled={globalMute}
                      />
                      <Label htmlFor={`${type}-inapp`} className="text-sm font-normal">
                        In-App
                      </Label>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Switch
                        id={`${type}-push`}
                        checked={preferences[type]?.push ?? true}
                        onCheckedChange={(checked) => updatePreference(type, "push", checked)}
                        disabled={globalMute}
                      />
                      <Label htmlFor={`${type}-push`} className="text-sm font-normal">
                        Push
                      </Label>
                    </div>
                    
                    <div className="space-y-2">
                      <Select
                        value={preferences[type]?.frequency || "realtime"}
                        onValueChange={(value) => updatePreference(type, "frequency", value as NotificationFrequency)}
                        disabled={globalMute}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="realtime">Realtime</SelectItem>
                          <SelectItem value="hourly">Hourly</SelectItem>
                          <SelectItem value="daily">Daily</SelectItem>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="never">Never</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  {categoryKey !== "system" && type !== category.types[category.types.length - 1].type && (
                    <Separator className="mt-4" />
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        ))}

        {/* Save Button - Mobile */}
        <div className="md:hidden sticky bottom-4 z-10">
          <Button 
            onClick={saveSettings} 
            disabled={saving}
            className="w-full bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 shadow-lg"
            size="lg"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Settings
              </>
            )}
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}

