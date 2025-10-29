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

interface CostData {
  costs: {
    ai: {
      totalRequests: number;
      totalTokens: number;
      estimatedCost: number;
      model: string;
      successRate: number;
    };
    firestore: {
      estimatedReads: number;
      estimatedWrites: number;
      estimatedCost: number;
      collections: {
        expenses: number;
        analytics: number;
      };
    };
    vercel: {
      estimatedInvocations: number;
      estimatedCost: number;
    };
    total: {
      estimatedMonthlyCost: number;
      dailyAverage: number;
      projectedMonthlyCost: number;
    };
  };
  dailyBreakdown: Array<{
    date: string;
    aiCost: number;
    firestoreCost: number;
    vercelCost: number;
    total: number;
  }>;
}

interface SystemStats {
  database: {
    collections: {
      expenses: { count: number; estimatedSize: string };
      analytics: { count: number; estimatedSize: string };
    };
    totalDocuments: number;
    estimatedTotalSize: string;
  };
  users: {
    total: number;
    active24h: number;
    active7d: number;
    active30d: number;
    newLast7d: number;
    newLast30d: number;
    withExpenses: number;
    withoutExpenses: number;
  };
  performance: {
    avgResponseTime: number;
    errorRate: number;
    successRate: number;
    totalRequests: number;
  };
  activity: {
    expensesLast24h: number;
    expensesLast7d: number;
    expensesLast30d: number;
    apiCallsLast24h: number;
    apiCallsLast7d: number;
    apiCallsLast30d: number;
  };
}

interface SystemConfig {
  ai: {
    model: string;
    maxTokens: number;
    temperature: number;
    rateLimit: {
      requestsPerUser: number;
      timeWindowMinutes: number;
    };
  };
  features: {
    imageAnalysis: boolean;
    offlineMode: boolean;
    aiAssistant: boolean;
    exportData: boolean;
  };
  costs: {
    monthlyBudget: number;
    alertThreshold: number;
  };
  maintenance: {
    mode: boolean;
    message: string;
  };
}

export default function AdminConsolePage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [costs, setCosts] = useState<CostData | null>(null);
  const [systemStats, setSystemStats] = useState<SystemStats | null>(null);
  const [config, setConfig] = useState<SystemConfig | null>(null);
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
    await Promise.all([loadUsers(), loadAnalytics(), loadCosts(), loadSystemStats(), loadConfig()]);
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

  const loadCosts = async () => {
    try {
      const response = await fetch("/api/admin/costs?days=30");
      if (response.ok) {
        const data = await response.json();
        setCosts(data);
      }
    } catch {
      // Silent error handling
    }
  };

  const loadSystemStats = async () => {
    try {
      const response = await fetch("/api/admin/system");
      if (response.ok) {
        const data = await response.json();
        setSystemStats(data.stats);
      }
    } catch {
      // Silent error handling
    }
  };

  const loadConfig = async () => {
    try {
      const response = await fetch("/api/admin/config");
      if (response.ok) {
        const data = await response.json();
        setConfig(data.config);
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
    } catch (err) {
      console.error("Failed to delete user data:", err);
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
              <CardTitle className="text-sm font-medium">Monthly Cost</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${costs?.costs.total.projectedMonthlyCost.toFixed(2) || analytics?.summary.totalCost || "0.00"}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Projected (${costs?.costs.total.dailyAverage.toFixed(4) || "0.00"}/day)
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
              <p className="text-xs text-green-600 mt-1">
                {analytics?.summary.successRate?.toFixed(1) || "0"}% success
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Users</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {systemStats?.users.active30d || 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Last 30 days ({systemStats?.users.newLast30d || 0} new)
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="users" className="space-y-4">
          <TabsList className="grid grid-cols-2 md:grid-cols-5 w-full max-w-3xl">
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="costs">Costs</TabsTrigger>
            <TabsTrigger value="system">System</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="config">Config</TabsTrigger>
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

          {/* Costs Tab */}
          <TabsContent value="costs" className="space-y-4">
            {/* Cost Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">AI Costs</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    ${costs?.costs.ai.estimatedCost.toFixed(4) || "0.00"}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {costs?.costs.ai.totalRequests || 0} requests • {costs?.costs.ai.model || "N/A"}
                  </p>
                  <p className="text-xs text-green-600 mt-1">
                    {costs?.costs.ai.successRate.toFixed(1) || 0}% success rate
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Firestore Costs</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    ${costs?.costs.firestore.estimatedCost.toFixed(4) || "0.00"}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {costs?.costs.firestore.estimatedReads.toLocaleString() || 0} reads • {costs?.costs.firestore.estimatedWrites.toLocaleString() || 0} writes
                  </p>
                  <p className="text-xs text-blue-600 mt-1">
                    {costs?.costs.firestore.collections.expenses || 0} expenses • {costs?.costs.firestore.collections.analytics || 0} analytics
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Vercel Costs</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    ${costs?.costs.vercel.estimatedCost.toFixed(4) || "0.00"}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {costs?.costs.vercel.estimatedInvocations.toLocaleString() || 0} function calls
                  </p>
                  <p className="text-xs text-amber-600 mt-1">
                    Estimated
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Monthly Projection */}
            <Card>
              <CardHeader>
                <CardTitle>Cost Projections</CardTitle>
                <CardDescription>Estimated monthly costs based on last 30 days</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Daily Average</p>
                      <p className="text-2xl font-bold">
                        ${costs?.costs.total.dailyAverage.toFixed(4) || "0.00"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Projected Monthly</p>
                      <p className="text-2xl font-bold text-blue-600">
                        ${costs?.costs.total.projectedMonthlyCost.toFixed(2) || "0.00"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Budget Status</p>
                      <p className="text-2xl font-bold text-green-600">
                        {config?.costs.monthlyBudget 
                          ? `$${((config.costs.monthlyBudget - (costs?.costs.total.projectedMonthlyCost || 0))).toFixed(2)} remaining`
                          : "No budget set"}
                      </p>
                      {config?.costs.monthlyBudget && costs && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {((costs.costs.total.projectedMonthlyCost / config.costs.monthlyBudget) * 100).toFixed(1)}% of ${config.costs.monthlyBudget} budget
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Cost Breakdown */}
                  <div className="space-y-2 mt-6">
                    <h4 className="font-semibold text-sm">Cost Breakdown (30 days)</h4>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between p-2 bg-muted rounded">
                        <span className="text-sm">AI (Gemini)</span>
                        <div className="text-right">
                          <span className="font-semibold">${costs?.costs.ai.estimatedCost.toFixed(4) || "0.00"}</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            ({costs?.costs.ai.totalTokens.toLocaleString() || 0} tokens)
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between p-2 bg-muted rounded">
                        <span className="text-sm">Firestore</span>
                        <div className="text-right">
                          <span className="font-semibold">${costs?.costs.firestore.estimatedCost.toFixed(4) || "0.00"}</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            ({costs?.costs.firestore.collections.expenses || 0} docs)
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between p-2 bg-muted rounded">
                        <span className="text-sm">Vercel</span>
                        <div className="text-right">
                          <span className="font-semibold">${costs?.costs.vercel.estimatedCost.toFixed(4) || "0.00"}</span>
                          <span className="text-xs text-amber-600 ml-2">(estimated)</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-primary/10 rounded border-2 border-primary/20">
                        <span className="text-sm font-semibold">Total (30 days)</span>
                        <span className="text-lg font-bold">
                          ${((costs?.costs.ai.estimatedCost || 0) + 
                             (costs?.costs.firestore.estimatedCost || 0) + 
                             (costs?.costs.vercel.estimatedCost || 0)).toFixed(4)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Notes */}
                  <div className="bg-amber-50 dark:bg-amber-950/20 p-4 rounded-lg mt-4">
                    <p className="text-sm font-semibold mb-2">📝 Cost Estimation Notes</p>
                    <ul className="text-xs space-y-1 text-muted-foreground">
                      <li>• AI costs are calculated based on actual token usage</li>
                      <li>• Firestore costs are estimated (reads ≈ 5x doc count, writes ≈ 1x doc count)</li>
                      <li>• Vercel costs are rough estimates based on function invocations</li>
                      <li>• For accurate Vercel costs, integrate with Vercel API</li>
                      <li>• Storage costs and bandwidth are not included</li>
                    </ul>
                  </div>
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
            {/* Database Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Database Size</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {systemStats?.database.estimatedTotalSize || "N/A"}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {systemStats?.database.totalDocuments.toLocaleString() || 0} total documents
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Expenses Collection</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {systemStats?.database.collections.expenses.count.toLocaleString() || 0}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {systemStats?.database.collections.expenses.estimatedSize || "N/A"}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Analytics Collection</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {systemStats?.database.collections.analytics.count.toLocaleString() || 0}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {systemStats?.database.collections.analytics.estimatedSize || "N/A"}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* User Activity */}
            <Card>
              <CardHeader>
                <CardTitle>User Activity</CardTitle>
                <CardDescription>Active users and engagement metrics</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Last 24h</p>
                    <p className="text-2xl font-bold">{systemStats?.users.active24h || 0}</p>
                    <p className="text-xs text-muted-foreground">active users</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Last 7 days</p>
                    <p className="text-2xl font-bold">{systemStats?.users.active7d || 0}</p>
                    <p className="text-xs text-muted-foreground">active users</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Last 30 days</p>
                    <p className="text-2xl font-bold">{systemStats?.users.active30d || 0}</p>
                    <p className="text-xs text-muted-foreground">active users</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Engagement</p>
                    <p className="text-2xl font-bold">
                      {systemStats?.users.total 
                        ? ((systemStats.users.active30d / systemStats.users.total) * 100).toFixed(0)
                        : 0}%
                    </p>
                    <p className="text-xs text-muted-foreground">30-day rate</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">New (7d)</p>
                    <p className="text-xl font-bold text-green-600">{systemStats?.users.newLast7d || 0}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">New (30d)</p>
                    <p className="text-xl font-bold text-green-600">{systemStats?.users.newLast30d || 0}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">With Expenses</p>
                    <p className="text-xl font-bold text-blue-600">{systemStats?.users.withExpenses || 0}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Without</p>
                    <p className="text-xl font-bold text-amber-600">{systemStats?.users.withoutExpenses || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Performance Metrics */}
            <Card>
              <CardHeader>
                <CardTitle>Performance Metrics</CardTitle>
                <CardDescription>API performance and reliability (last 30 days)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Avg Response</p>
                    <p className="text-2xl font-bold">{systemStats?.performance.avgResponseTime || 0}ms</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Success Rate</p>
                    <p className="text-2xl font-bold text-green-600">
                      {systemStats?.performance.successRate.toFixed(1) || 0}%
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Error Rate</p>
                    <p className="text-2xl font-bold text-red-600">
                      {systemStats?.performance.errorRate.toFixed(1) || 0}%
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Total Requests</p>
                    <p className="text-2xl font-bold">
                      {systemStats?.performance.totalRequests.toLocaleString() || 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Activity Stats */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Expenses and API calls over time</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">Expenses</p>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">
                        Last 24h: <span className="font-semibold">{systemStats?.activity.expensesLast24h || 0}</span>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Last 7d: <span className="font-semibold">{systemStats?.activity.expensesLast7d || 0}</span>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Last 30d: <span className="font-semibold">{systemStats?.activity.expensesLast30d || 0}</span>
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">API Calls</p>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">
                        Last 24h: <span className="font-semibold">{systemStats?.activity.apiCallsLast24h || 0}</span>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Last 7d: <span className="font-semibold">{systemStats?.activity.apiCallsLast7d || 0}</span>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Last 30d: <span className="font-semibold">{systemStats?.activity.apiCallsLast30d || 0}</span>
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">Averages</p>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">
                        Expenses/day: <span className="font-semibold">
                          {systemStats ? (systemStats.activity.expensesLast30d / 30).toFixed(1) : 0}
                        </span>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        API/day: <span className="font-semibold">
                          {systemStats ? (systemStats.activity.apiCallsLast30d / 30).toFixed(1) : 0}
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Config Tab */}
          <TabsContent value="config" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>System Configuration</CardTitle>
                <CardDescription>View and manage system settings (read-only for now)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* AI Configuration */}
                <div className="space-y-3">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    AI Model Settings
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-muted p-4 rounded-lg">
                      <p className="text-sm text-muted-foreground">Current Model</p>
                      <p className="text-lg font-semibold">{config?.ai.model || "gemini-2.0-flash"}</p>
                    </div>
                    <div className="bg-muted p-4 rounded-lg">
                      <p className="text-sm text-muted-foreground">Max Tokens</p>
                      <p className="text-lg font-semibold">{config?.ai.maxTokens || 2048}</p>
                    </div>
                    <div className="bg-muted p-4 rounded-lg">
                      <p className="text-sm text-muted-foreground">Temperature</p>
                      <p className="text-lg font-semibold">{config?.ai.temperature || 0.7}</p>
                    </div>
                    <div className="bg-muted p-4 rounded-lg">
                      <p className="text-sm text-muted-foreground">Rate Limit</p>
                      <p className="text-lg font-semibold">
                        {config?.ai.rateLimit.requestsPerUser || 100} per {config?.ai.rateLimit.timeWindowMinutes || 60}min
                      </p>
                    </div>
                  </div>
                </div>

                {/* Feature Flags */}
                <div className="space-y-3">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Feature Flags
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className={`p-3 rounded-lg border-2 ${config?.features.imageAnalysis ? 'border-green-500 bg-green-50 dark:bg-green-950/20' : 'border-gray-300'}`}>
                      <p className="text-sm font-medium">Image Analysis</p>
                      <p className="text-xs text-muted-foreground">
                        {config?.features.imageAnalysis ? "✅ Enabled" : "❌ Disabled"}
                      </p>
                    </div>
                    <div className={`p-3 rounded-lg border-2 ${config?.features.offlineMode ? 'border-green-500 bg-green-50 dark:bg-green-950/20' : 'border-gray-300'}`}>
                      <p className="text-sm font-medium">Offline Mode</p>
                      <p className="text-xs text-muted-foreground">
                        {config?.features.offlineMode ? "✅ Enabled" : "❌ Disabled"}
                      </p>
                    </div>
                    <div className={`p-3 rounded-lg border-2 ${config?.features.aiAssistant ? 'border-green-500 bg-green-50 dark:bg-green-950/20' : 'border-gray-300'}`}>
                      <p className="text-sm font-medium">AI Assistant</p>
                      <p className="text-xs text-muted-foreground">
                        {config?.features.aiAssistant ? "✅ Enabled" : "❌ Disabled"}
                      </p>
                    </div>
                    <div className={`p-3 rounded-lg border-2 ${config?.features.exportData ? 'border-green-500 bg-green-50 dark:bg-green-950/20' : 'border-gray-300'}`}>
                      <p className="text-sm font-medium">Data Export</p>
                      <p className="text-xs text-muted-foreground">
                        {config?.features.exportData ? "✅ Enabled" : "❌ Disabled"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Budget Settings */}
                <div className="space-y-3">
                  <h3 className="font-semibold flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Budget & Alerts
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg border-2 border-blue-200 dark:border-blue-800">
                      <p className="text-sm text-muted-foreground">Monthly Budget</p>
                      <p className="text-2xl font-bold text-blue-600">${config?.costs.monthlyBudget || 100}</p>
                      {costs && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Current: ${costs.costs.total.projectedMonthlyCost.toFixed(2)} ({
                            ((costs.costs.total.projectedMonthlyCost / (config?.costs.monthlyBudget || 100)) * 100).toFixed(0)
                          }%)
                        </p>
                      )}
                    </div>
                    <div className="bg-amber-50 dark:bg-amber-950/20 p-4 rounded-lg border-2 border-amber-200 dark:border-amber-800">
                      <p className="text-sm text-muted-foreground">Alert Threshold</p>
                      <p className="text-2xl font-bold text-amber-600">{config?.costs.alertThreshold || 80}%</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Alert at ${((config?.costs.monthlyBudget || 100) * ((config?.costs.alertThreshold || 80) / 100)).toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Maintenance Mode */}
                <div className="space-y-3">
                  <h3 className="font-semibold flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Maintenance Mode
                  </h3>
                  <div className={`p-4 rounded-lg border-2 ${config?.maintenance.mode ? 'border-red-500 bg-red-50 dark:bg-red-950/20' : 'border-green-500 bg-green-50 dark:bg-green-950/20'}`}>
                    <p className="font-semibold">
                      {config?.maintenance.mode ? "🔴 MAINTENANCE MODE ACTIVE" : "🟢 System Operational"}
                    </p>
                    {config?.maintenance.message && (
                      <p className="text-sm text-muted-foreground mt-2">
                        Message: {config.maintenance.message}
                      </p>
                    )}
                  </div>
                </div>

                {/* System Info */}
                <div className="space-y-3 pt-4 border-t">
                  <h3 className="font-semibold">System Information</h3>
                  <div className="bg-muted p-4 rounded-lg space-y-2">
                    <p className="text-sm">
                      <strong>Admin Access:</strong> <code className="ml-2">/admin-console</code>
                    </p>
                    <p className="text-sm">
                      <strong>Default Username:</strong> <code className="ml-2">penny_admin_2024</code>
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      💡 Change credentials via environment variables in production
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-4 border-t">
                  <Button variant="outline" onClick={() => loadData()}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh All Data
                  </Button>
                  <Button variant="outline" disabled>
                    Edit Configuration
                    <span className="ml-2 text-xs">(Coming Soon)</span>
                  </Button>
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

