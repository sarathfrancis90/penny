"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useAuth } from "@/hooks/useAuth";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  BarChart3,
  Menu,
  Moon,
  Sun,
  User,
  WifiOff,
  Cloud,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();
  const { isOnline, pendingCount, isSyncing } = useOfflineSync(user?.uid);

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="flex items-center justify-between px-4 py-3 max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <div className="relative h-8 w-8">
                <Image 
                  src="/favicon-32x32.png" 
                  alt="Penny" 
                  fill
                  sizes="32px"
                  className="rounded-lg object-contain"
                  priority
                />
              </div>
              <h1 className="text-xl font-bold hidden sm:inline">Penny</h1>
            </Link>

            {/* Navigation - Desktop */}
            <nav className="hidden md:flex items-center gap-1 ml-4">
              <Button
                variant={pathname === "/" ? "secondary" : "ghost"}
                size="sm"
                asChild
              >
                <Link href="/">
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Chat
                </Link>
              </Button>
              <Button
                variant={pathname === "/dashboard" ? "secondary" : "ghost"}
                size="sm"
                asChild
              >
                <Link href="/dashboard">
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Dashboard
                </Link>
              </Button>
            </nav>
          </div>

          <div className="flex items-center gap-2">
            {/* Offline/Sync Indicator */}
            {!isOnline && (
              <div className="flex items-center gap-1 text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 px-2 py-1 rounded-full">
                <WifiOff className="h-3 w-3" />
                <span className="hidden sm:inline">Offline</span>
              </div>
            )}
            {isOnline && pendingCount > 0 && (
              <div className="flex items-center gap-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 px-2 py-1 rounded-full">
                <Cloud className="h-3 w-3 animate-pulse" />
                <span className="hidden sm:inline">
                  {isSyncing ? "Syncing..." : `${pendingCount} pending`}
                </span>
              </div>
            )}

            {/* Theme Toggle - Desktop */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              title="Toggle theme"
              className="hidden md:inline-flex"
            >
              <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              <span className="sr-only">Toggle theme</span>
            </Button>

            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">Account</p>
                    <p className="text-xs leading-none text-muted-foreground truncate">
                      {user?.email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                
                {/* Mobile Navigation */}
                <div className="md:hidden">
                  <DropdownMenuItem asChild>
                    <Link href="/" className={cn(pathname === "/" && "bg-secondary")}>
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Chat
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard" className={cn(pathname === "/dashboard" && "bg-secondary")}>
                      <BarChart3 className="h-4 w-4 mr-2" />
                      Dashboard
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </div>

                <DropdownMenuItem asChild>
                  <Link href="/profile" className={cn(pathname === "/profile" && "bg-secondary")}>
                    <User className="h-4 w-4 mr-2" />
                    Profile
                  </Link>
                </DropdownMenuItem>

                {/* Theme Toggle - Mobile */}
                <div className="md:hidden">
                  <DropdownMenuItem onClick={toggleTheme}>
                    {theme === "dark" ? (
                      <>
                        <Sun className="h-4 w-4 mr-2" />
                        Light Mode
                      </>
                    ) : (
                      <>
                        <Moon className="h-4 w-4 mr-2" />
                        Dark Mode
                      </>
                    )}
                  </DropdownMenuItem>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
