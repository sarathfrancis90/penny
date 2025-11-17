"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function TestNavigationPage() {
  const router = useRouter();

  const testUrls = [
    { label: "Budgets (simple)", url: "/budgets" },
    { label: "Budgets with tab", url: "/budgets?tab=group" },
    { label: "Budgets with group", url: "/budgets?tab=group&groupId=test123" },
    { label: "Dashboard", url: "/dashboard" },
    { label: "Home", url: "/" },
  ];

  const handleNavigation = (url: string) => {
    console.log("🧪 [Test Nav] Attempting navigation to:", url);
    try {
      router.push(url);
      console.log("✅ [Test Nav] router.push() called successfully");
    } catch (error) {
      console.error("❌ [Test Nav] router.push() failed:", error);
    }
  };

  const handleWindowLocation = (url: string) => {
    console.log("🧪 [Test Nav] Using window.location for:", url);
    window.location.href = url;
  };

  return (
    <div className="min-h-screen p-8 bg-gradient-to-br from-violet-50 to-fuchsia-50 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-4xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>🧪 Navigation Test Page</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="font-semibold mb-3">Test router.push()</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {testUrls.map((test) => (
                  <Button
                    key={test.url}
                    variant="outline"
                    onClick={() => handleNavigation(test.url)}
                    className="justify-start"
                  >
                    {test.label}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <h3 className="font-semibold mb-3">Test window.location</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {testUrls.map((test) => (
                  <Button
                    key={test.url}
                    variant="secondary"
                    onClick={() => handleWindowLocation(test.url)}
                    className="justify-start"
                  >
                    {test.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="bg-muted p-4 rounded-lg">
              <h3 className="font-semibold mb-2">Instructions:</h3>
              <ol className="list-decimal list-inside space-y-2 text-sm">
                <li>Open browser console (F12)</li>
                <li>Click any button above</li>
                <li>Watch console for navigation logs</li>
                <li>Check if URL changes correctly</li>
                <li>
                  Check if you land on the correct page
                </li>
              </ol>
            </div>

            <div className="bg-yellow-50 dark:bg-yellow-950 p-4 rounded-lg border border-yellow-200 dark:border-yellow-800">
              <p className="text-sm">
                <strong>Note:</strong> This page is for debugging only. If budgets navigation
                works from here but not from group page, the issue is specific to the group
                page implementation.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

