"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

interface AuthGuardProps {
  children: React.ReactNode;
}

const publicRoutes = ["/login", "/signup", "/forgot-password", "/reset-password"];

export function AuthGuard({ children }: AuthGuardProps) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading) {
      const isPublicRoute = publicRoutes.includes(pathname);

      console.log("🔍 [AuthGuard]", { 
        pathname, 
        hasUser: !!user, 
        isPublicRoute, 
        loading 
      });

      // Redirect to login if not authenticated and on a protected route
      if (!user && !isPublicRoute) {
        console.log("❌ [AuthGuard] Redirecting to /login");
        router.push("/login");
      }

      // Redirect to home if authenticated and on an auth page
      if (user && isPublicRoute) {
        console.log("✅ [AuthGuard] Redirecting to /");
        router.push("/");
      }
    }
  }, [user, loading, pathname, router]);

  // Show loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Show nothing while redirecting
  const isPublicRoute = publicRoutes.includes(pathname);
  if (!user && !isPublicRoute) {
    return null;
  }

  if (user && isPublicRoute) {
    return null;
  }

  return <>{children}</>;
}
