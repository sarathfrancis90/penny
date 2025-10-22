"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  Shield, 
  Users, 
  TrendingUp, 
  DollarSign, 
  Activity,
  Trash2,
  RefreshCw,
  LogOut,
  Loader2,
  AlertTriangle,
  Search,
  CheckCircle2,
  XCircle,
  UserCheck,
  UserX,
  Download,
} from "lucide-react";
import { Input } from "@/components/ui/input";

interface User {
  userId: string;
  email?: string;
  displayName?: string;
  photoURL?: string;
  emailVerified: boolean;
  createdAt: Date;
  lastSignInTime?: Date;
  disabled: boolean;
  expenseCount: number;
  totalAmount: number;
  lastActivity?: Date;
  lastExpenseDate?: Date;
  firstExpenseDate?: Date;
}

interface Analytics {
  summary: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    successRate: number;
    totalTokens: number;
    totalCost: string;
    avgDuration: number;
  };
  byUser: Array<{
    userId: string;
    requests: number;
    tokens: number;
    cost: number;
    successRate: number;
  }>;
  byDate: Array<{
    date: string;
    requests: number;
    tokens: number;
    cost: number;
  }>;
  byType: Record<string, number>;
}

export default function AdminConsolePage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [deleteType, setDeleteType] = useState<"expenses" | "all">("expenses");
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [totalRegistered, setTotalRegistered] = useState(0);
  const [usersWithExpenses, setUsersWithExpenses] = useState(0);

  // Check authentication
  useEffect(() => {
    checkAuth();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkAuth = async () => {
    try {
      const response = await fetch("/api/admin/auth");
      if (response.ok) {
        setIsAuthenticated(true);
        loadData();
      } else {
        router.push("/admin-console/login");
      }
    } catch {
      router.push("/admin-console/login");
    } finally {
      setIsLoading(false);
    }
  };

  const loadData = async () => {
    await Promise.all([loadUsers(), loadAnalytics()]);
  };

  const loadUsers = async () => {
    try {
      const response = await fetch("/api/admin/users");
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users || []);
        setFilteredUsers(data.users || []);
        setTotalRegistered(data.registeredUsers || 0);
        setUsersWithExpenses(data.usersWithExpenses || 0);
      }
    } catch {
      // Silent error handling
    }
  };

  // Filter users based on search query
  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setFilteredUsers(users);
      return;
    }

    const lowerQuery = query.toLowerCase();
    const filtered = users.filter((user) => 
      user.email?.toLowerCase().includes(lowerQuery) ||
      user.displayName?.toLowerCase().includes(lowerQuery) ||
      user.userId.toLowerCase().includes(lowerQuery)
    );
    setFilteredUsers(filtered);
  };

  const loadAnalytics = async () => {
    try {
      const response = await fetch("/api/admin/analytics?days=30");
      if (response.ok) {
        const data = await response.json();
        setAnalytics(data);
      }
    } catch {
      // Silent error handling
    }
  };

  const handleLogout = async () => {
    await fetch("/api/admin/auth", { method: "DELETE" });
    router.push("/admin-console/login");
  };

  const handleExportUser = async (userId: string, userEmail?: string) => {
    try {
      const response = await fetch(`/api/admin/users/${userId}/export`);
      if (response.ok) {
        const data = await response.json();
        
        // Create a blob and download
        const blob = new Blob([JSON.stringify(data.data, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `user-export-${userEmail || userId}-${new Date().toISOString().split("T")[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch {
      // Silent error handling
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;

    setIsDeleting(true);
    try {
      const response = await fetch(
        `/api/admin/users/${selectedUser}?type=${deleteType}`,
        { method: "DELETE" }
      );

      if (response.ok) {
        setShowDeleteDialog(false);
        setSelectedUser(null);
        await loadData();
        alert(`Successfully deleted ${deleteType} for user`);
      } else {
        const data = await response.json();
        alert(`Failed: ${data.error}`);
      }
    } catch (error) {
      alert("Failed to delete user data");
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
              <Shield className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Penny Admin Console</h1>
              <p className="text-xs text-muted-foreground">System Management Dashboard</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleLogout}
            className="gap-2"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </Button>
        </div>
      </header>

      <div className="container mx-auto p-4 md:p-8 max-w-7xl">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalRegistered}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {usersWithExpenses} with expenses
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">API Requests</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {analytics?.summary.totalRequests || 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Last 30 days</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Tokens</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {analytics?.summary.totalTokens.toLocaleString() || 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">AI usage</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Estimated Cost</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${analytics?.summary.totalCost || "0.00"}
              </div>
              <p className="text-xs text-muted-foreground mt-1">USD</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="users" className="space-y-4">
          <TabsList className="grid grid-cols-2 md:grid-cols-3 w-full max-w-md">
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="system">System</TabsTrigger>
          </TabsList>

          {/* Users Tab */}
          <TabsContent value="users" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>User Management</CardTitle>
                <CardDescription>
                  View and manage all users and their data. Shows ALL registered users.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* Search Bar */}
                <div className="mb-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by email, name, or user ID..."
                      value={searchQuery}
                      onChange={(e) => handleSearch(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  {searchQuery && (
                    <p className="text-sm text-muted-foreground mt-2">
                      Showing {filteredUsers.length} of {users.length} users
                    </p>
                  )}
                </div>

                <div className="rounded-md border overflow-auto max-h-[600px]">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Expenses</TableHead>
                        <TableHead className="text-right">Total Amount</TableHead>
                        <TableHead>Registered</TableHead>
                        <TableHead>Last Activity</TableHead>
                        <TableHead className="text-center">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUsers.map((user) => (
                        <TableRow key={user.userId} className={user.disabled ? "opacity-50" : ""}>
                          <TableCell>
                            <div className="flex flex-col min-w-[200px]">
                              {user.displayName && (
                                <span className="font-medium">{user.displayName}</span>
                              )}
                              {user.email ? (
                                <div className="flex items-center gap-1">
                                  <span className="text-xs text-muted-foreground">
                                    {user.email}
                                  </span>
                                  {user.emailVerified ? (
                                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                                  ) : (
                                    <XCircle className="h-3 w-3 text-amber-500" />
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground italic">
                                  No email
                                </span>
                              )}
                              <span className="text-xs font-mono text-muted-foreground">
                                {user.userId.substring(0, 12)}...
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              {user.disabled ? (
                                <span className="inline-flex items-center gap-1 text-xs text-destructive">
                                  <UserX className="h-3 w-3" />
                                  Disabled
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs text-green-600">
                                  <UserCheck className="h-3 w-3" />
                                  Active
                                </span>
                              )}
                              {user.expenseCount === 0 && (
                                <span className="text-xs text-amber-600">
                                  No expenses
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            {user.expenseCount > 0 ? (
                              <span className="font-medium">{user.expenseCount}</span>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {user.totalAmount > 0 ? (
                              <span className="font-semibold">${user.totalAmount.toFixed(2)}</span>
                            ) : (
                              <span className="text-muted-foreground">$0.00</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="text-xs">
                              {new Date(user.createdAt).toLocaleDateString()}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs">
                              {user.lastActivity
                                ? new Date(user.lastActivity).toLocaleDateString()
                                : user.lastSignInTime
                                ? new Date(user.lastSignInTime).toLocaleDateString()
                                : "Never"}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleExportUser(user.userId, user.email)}
                                className="h-8 px-2"
                              >
                                <Download className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedUser(user.userId);
                                  setDeleteType("expenses");
                                  setShowDeleteDialog(true);
                                }}
                                disabled={user.expenseCount === 0}
                                className="h-8"
                              >
                                <RefreshCw className="h-3 w-3 mr-1" />
                                Reset
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => {
                                  setSelectedUser(user.userId);
                                  setDeleteType("all");
                                  setShowDeleteDialog(true);
                                }}
                                className="h-8"
                              >
                                <Trash2 className="h-3 w-3 mr-1" />
                                Delete
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {filteredUsers.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={7} className="h-24 text-center">
                            {searchQuery ? "No users match your search" : "No users found"}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Summary Stats */}
              <Card>
                <CardHeader>
                  <CardTitle>Request Statistics</CardTitle>
                  <CardDescription>Last 30 days</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Success Rate:</span>
                    <span className="font-semibold">
                      {analytics?.summary.successRate.toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Avg Duration:</span>
                    <span className="font-semibold">
                      {analytics?.summary.avgDuration}ms
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Failed Requests:</span>
                    <span className="font-semibold text-destructive">
                      {analytics?.summary.failedRequests}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Request Types */}
              <Card>
                <CardHeader>
                  <CardTitle>Request Types</CardTitle>
                  <CardDescription>Distribution by type</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {analytics?.byType &&
                    Object.entries(analytics.byType).map(([type, count]) => (
                      <div key={type} className="flex justify-between items-center">
                        <span className="text-sm capitalize">{type}:</span>
                        <span className="font-semibold">{count}</span>
                      </div>
                    ))}
                </CardContent>
              </Card>

              {/* Top Users */}
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle>Top Users by API Usage</CardTitle>
                  <CardDescription>Users with most API requests</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User ID</TableHead>
                        <TableHead className="text-right">Requests</TableHead>
                        <TableHead className="text-right">Tokens</TableHead>
                        <TableHead className="text-right">Cost (USD)</TableHead>
                        <TableHead className="text-right">Success Rate</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analytics?.byUser.slice(0, 10).map((user) => (
                        <TableRow key={user.userId}>
                          <TableCell className="font-mono text-xs">
                            {user.userId === "anonymous"
                              ? "Anonymous"
                              : `${user.userId.substring(0, 20)}...`}
                          </TableCell>
                          <TableCell className="text-right">{user.requests}</TableCell>
                          <TableCell className="text-right">
                            {user.tokens.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">
                            ${user.cost.toFixed(6)}
                          </TableCell>
                          <TableCell className="text-right">
                            {user.successRate.toFixed(1)}%
                          </TableCell>
                        </TableRow>
                      ))}
                      {!analytics?.byUser.length && (
                        <TableRow>
                          <TableCell colSpan={5} className="h-24 text-center">
                            No analytics data available
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* System Tab */}
          <TabsContent value="system" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>System Information</CardTitle>
                <CardDescription>Application details and credentials</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <h3 className="font-semibold">Admin Credentials</h3>
                  <div className="bg-muted p-4 rounded-lg space-y-2">
                    <p className="text-sm">
                      <strong>Username:</strong> <code className="ml-2">penny_admin_2024</code>
                    </p>
                    <p className="text-sm">
                      <strong>Password:</strong> <code className="ml-2">PnY@2024#Secure$Admin!</code>
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      💡 Store these credentials securely. Change them in environment variables for production.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="font-semibold">Access URL</h3>
                  <div className="bg-muted p-4 rounded-lg">
                    <code className="text-sm">/admin-console</code>
                    <p className="text-xs text-muted-foreground mt-2">
                      This route is not linked from the main application for security.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="font-semibold">Quick Actions</h3>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => loadData()}>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Refresh Data
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              {deleteType === "all" ? "Delete All User Data" : "Reset User Expenses"}
            </DialogTitle>
            <DialogDescription className="space-y-2">
              <p className="font-semibold">Are you sure?</p>
              <p>
                {deleteType === "all"
                  ? "This will permanently delete ALL data for this user including expenses and analytics. This action cannot be undone."
                  : "This will permanently delete all expenses for this user. Analytics data will be preserved."}
              </p>
              <p className="text-xs font-mono bg-muted p-2 rounded">
                User ID: {selectedUser?.substring(0, 30)}...
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteUser}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  {deleteType === "all" ? "Delete All" : "Reset Expenses"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

