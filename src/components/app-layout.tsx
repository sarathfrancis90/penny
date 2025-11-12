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
  LogOut,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const { user, signOut } = useAuth();
  const { isOnline, pendingCount, isSyncing } = useOfflineSync(user?.uid);

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      {/* Header with Glass Morphism */}
      <header className="border-b border-slate-200/50 dark:border-slate-800/50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl supports-[backdrop-filter]:bg-white/60 dark:supports-[backdrop-filter]:bg-slate-900/60 sticky top-0 z-50 shadow-sm">
        <div className="flex items-center justify-between px-4 py-3 max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            {/* Logo with Animation */}
            <Link href="/" className="flex items-center gap-3 group">
              <div className="relative h-12 w-12 rounded-xl overflow-hidden transition-all duration-300 group-hover:scale-110 group-hover:rotate-6 shadow-lg shadow-violet-500/30 group-hover:shadow-violet-500/60">
                <Image 
                  src="/penny.png" 
                  alt="Penny" 
                  width={48}
                  height={48}
                  className="object-contain transition-transform group-hover:scale-110"
                  priority
                />
              </div>
              <div className="hidden sm:block">
                <h1 className="text-xl font-bold bg-gradient-to-r from-violet-600 to-fuchsia-600 dark:from-violet-400 dark:to-fuchsia-400 bg-clip-text text-transparent transition-all">
                  Penny
                </h1>
                <p className="text-[10px] text-muted-foreground -mt-1 font-medium">AI Expense Tracker</p>
              </div>
            </Link>

            {/* Navigation - Desktop with Modern Pills */}
            <nav className="hidden md:flex items-center gap-2 ml-6">
              <Button
                variant={pathname === "/" ? "default" : "ghost"}
                size="sm"
                asChild
                className={cn(
                  "transition-all duration-300 hover:scale-105",
                  pathname === "/" && "bg-gradient-to-r from-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/30"
                )}
              >
                <Link href="/">
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Chat
                  {pathname === "/" && <Sparkles className="h-3 w-3 ml-1 animate-pulse" />}
                </Link>
              </Button>
              <Button
                variant={pathname === "/dashboard" ? "default" : "ghost"}
                size="sm"
                asChild
                className={cn(
                  "transition-all duration-300 hover:scale-105",
                  pathname === "/dashboard" && "bg-gradient-to-r from-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/30"
                )}
              >
                <Link href="/dashboard">
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Dashboard
                  {pathname === "/dashboard" && <Sparkles className="h-3 w-3 ml-1 animate-pulse" />}
                </Link>
              </Button>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {/* Offline/Sync Indicator with Animations */}
            {!isOnline && (
              <div className="flex items-center gap-1.5 text-xs bg-gradient-to-r from-yellow-100 to-amber-100 dark:from-yellow-900/30 dark:to-amber-900/30 text-yellow-800 dark:text-yellow-200 px-3 py-1.5 rounded-full border border-yellow-200 dark:border-yellow-800/30 shadow-sm animate-in fade-in-50 slide-in-from-top-2">
                <WifiOff className="h-3.5 w-3.5 animate-pulse" />
                <span className="hidden sm:inline font-medium">Offline</span>
              </div>
            )}
            {isOnline && pendingCount > 0 && (
              <div className="flex items-center gap-1.5 text-xs bg-gradient-to-r from-blue-100 to-cyan-100 dark:from-blue-900/30 dark:to-cyan-900/30 text-blue-800 dark:text-blue-200 px-3 py-1.5 rounded-full border border-blue-200 dark:border-blue-800/30 shadow-sm animate-in fade-in-50 slide-in-from-top-2">
                <Cloud className={cn("h-3.5 w-3.5", isSyncing && "animate-bounce")} />
                <span className="hidden sm:inline font-medium">
                  {isSyncing ? "Syncing..." : `${pendingCount} pending`}
                </span>
              </div>
            )}

            {/* Theme Toggle - Desktop with Smooth Rotation */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              title="Toggle theme"
              className="hidden md:inline-flex relative overflow-hidden group hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-all duration-300 hover:scale-110"
            >
              <Sun className="h-5 w-5 rotate-0 scale-100 transition-all duration-500 dark:-rotate-180 dark:scale-0 text-amber-500" />
              <Moon className="absolute h-5 w-5 rotate-180 scale-0 transition-all duration-500 dark:rotate-0 dark:scale-100 text-violet-400" />
              <span className="sr-only">Toggle theme</span>
            </Button>

            {/* User Menu with Beautiful Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="relative group hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-all duration-300 hover:scale-110"
                >
                  <Menu className="h-5 w-5 transition-transform group-hover:rotate-90 duration-300" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent 
                align="end" 
                className="w-64 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-slate-200 dark:border-slate-800 shadow-2xl"
              >
                <DropdownMenuLabel>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-semibold leading-none bg-gradient-to-r from-violet-600 to-fuchsia-600 dark:from-violet-400 dark:to-fuchsia-400 bg-clip-text text-transparent">
                      My Account
                    </p>
                    <p className="text-xs leading-none text-muted-foreground truncate mt-1.5">
                      {user?.email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-gradient-to-r from-transparent via-slate-200 dark:via-slate-700 to-transparent" />
                
                {/* Mobile Navigation */}
                <div className="md:hidden">
                  <DropdownMenuItem asChild className="cursor-pointer">
                    <Link 
                      href="/" 
                      className={cn(
                        "transition-all duration-200",
                        pathname === "/" && "bg-violet-50 dark:bg-violet-950/30"
                      )}
                    >
                      <MessageSquare className="h-4 w-4 mr-2 text-violet-500" />
                      <span>Chat</span>
                      {pathname === "/" && <Sparkles className="h-3 w-3 ml-auto animate-pulse text-violet-500" />}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="cursor-pointer">
                    <Link 
                      href="/dashboard" 
                      className={cn(
                        "transition-all duration-200",
                        pathname === "/dashboard" && "bg-violet-50 dark:bg-violet-950/30"
                      )}
                    >
                      <BarChart3 className="h-4 w-4 mr-2 text-fuchsia-500" />
                      <span>Dashboard</span>
                      {pathname === "/dashboard" && <Sparkles className="h-3 w-3 ml-auto animate-pulse text-fuchsia-500" />}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-gradient-to-r from-transparent via-slate-200 dark:via-slate-700 to-transparent" />
                </div>

                <DropdownMenuItem asChild className="cursor-pointer">
                  <Link 
                    href="/profile" 
                    className={cn(
                      "transition-all duration-200 hover:bg-slate-50 dark:hover:bg-slate-800",
                      pathname === "/profile" && "bg-violet-50 dark:bg-violet-950/30"
                    )}
                  >
                    <User className="h-4 w-4 mr-2 text-blue-500" />
                    <span>Profile & Settings</span>
                  </Link>
                </DropdownMenuItem>

                {/* Theme Toggle - Mobile */}
                <div className="md:hidden">
                  <DropdownMenuItem onClick={toggleTheme} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-all duration-200">
                    {theme === "dark" ? (
                      <>
                        <Sun className="h-4 w-4 mr-2 text-amber-500" />
                        <span>Light Mode</span>
                      </>
                    ) : (
                      <>
                        <Moon className="h-4 w-4 mr-2 text-violet-500" />
                        <span>Dark Mode</span>
                      </>
                    )}
                  </DropdownMenuItem>
                </div>

                <DropdownMenuSeparator className="bg-gradient-to-r from-transparent via-slate-200 dark:via-slate-700 to-transparent" />

                {/* Logout Button - Easy Access */}
                <DropdownMenuItem 
                  onClick={handleLogout}
                  className="cursor-pointer text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 focus:bg-red-50 dark:focus:bg-red-950/30 font-medium transition-all duration-200"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  <span>Log Out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Main Content with Smooth Transitions */}
      <main className="flex-1 overflow-auto">
        <div className="animate-in fade-in-50 slide-in-from-bottom-4 duration-500">
          {children}
        </div>
      </main>
    </div>
  );
}
