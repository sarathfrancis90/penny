"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/app-layout";
import { DevTools } from "@/components/dev-tools";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LogOut, Mail, Calendar, Shield } from "lucide-react";

export default function ProfilePage() {
  const router = useRouter();
  const { user, signOut } = useAuth();

  const handleSignOut = async () => {
    try {
      await signOut();
      router.push("/login");
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">Loading...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const createdDate = user.metadata.creationTime
    ? new Date(user.metadata.creationTime).toLocaleDateString("en-CA", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "Unknown";

  return (
    <AppLayout>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 overflow-auto">
        <div className="container mx-auto p-4 md:p-8 max-w-2xl">
        <h1 className="text-4xl font-bold tracking-tight mb-8">Profile</h1>

        {/* Account Information Card */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Account Information</CardTitle>
            <CardDescription>Your Penny account details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Email */}
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Mail className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="font-medium truncate">{user.email}</p>
              </div>
            </div>

            {/* User ID */}
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">User ID</p>
                <p className="font-mono text-sm truncate">{user.uid}</p>
              </div>
            </div>

            {/* Created Date */}
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
                <Calendar className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Member Since</p>
                <p className="font-medium">{createdDate}</p>
              </div>
            </div>

            {/* Email Verified Status */}
            <div className="pt-2 border-t">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Email Verified
                </span>
                <span
                  className={`text-sm font-medium ${
                    user.emailVerified
                      ? "text-green-600 dark:text-green-400"
                      : "text-yellow-600 dark:text-yellow-400"
                  }`}
                >
                  {user.emailVerified ? "Yes" : "No"}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* App Information Card */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>About Penny</CardTitle>
            <CardDescription>AI-powered expense tracking</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              Penny is designed for self-incorporated software professionals in
              Canada to track business expenses for tax purposes.
            </p>
            <p>
              Features include AI-powered receipt scanning, automatic
              categorization, offline support, and real-time expense insights.
            </p>
          </CardContent>
        </Card>

        {/* Dev Tools - Only visible in development */}
        <DevTools />

        {/* Danger Zone Card */}
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-destructive">Sign Out</CardTitle>
            <CardDescription>
              Sign out of your Penny account on this device
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button
              variant="destructive"
              onClick={handleSignOut}
              className="w-full sm:w-auto"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </CardFooter>
        </Card>

        {/* Version Info */}
        <div className="text-center mt-8 text-xs text-muted-foreground">
          <p>Penny v1.0.0</p>
          <p className="mt-1">Built with Next.js, Firebase, and Gemini AI</p>
        </div>
        </div>
      </div>
    </AppLayout>
  );
}
