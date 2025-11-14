"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Expense } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ViewExpenseModal } from "./view-expense-modal";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { expenseCategories } from "@/lib/categories";
import { Trash2, Calendar as CalendarIcon, Loader2, CheckSquare } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";

interface ExpenseListViewProps {
  expenses: Expense[];
  onDelete: (expenseId: string) => Promise<{ success: boolean; error?: string }>;
  onUpdate: (
    expenseId: string,
    updates: {
      vendor?: string;
      amount?: number;
      date?: string;
      category?: string;
      description?: string;
    }
  ) => Promise<{ success: boolean; error?: string }>;
}

export function ExpenseListView({ expenses, onDelete, onUpdate }: ExpenseListViewProps) {
  const [viewingExpense, setViewingExpense] = useState<Expense | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Multi-select state
  const [selectedExpenses, setSelectedExpenses] = useState<Set<string>>(new Set());
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  
  // Edit form state
  const [editVendor, setEditVendor] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editDate, setEditDate] = useState<Date>(new Date());
  const [editCategory, setEditCategory] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  // Helper to parse date in local timezone
  const parseLocalDate = (timestamp: unknown): Date => {
    if (!timestamp) return new Date();
    
    // Handle Firestore Timestamp objects
    if (typeof timestamp === 'object' && timestamp !== null && 'toDate' in timestamp) {
      return (timestamp as { toDate: () => Date }).toDate();
    }
    
    // Handle regular Date or string
    const date = new Date(timestamp as string | Date);
    return isNaN(date.getTime()) ? new Date() : date;
  };

  const handleRowClick = (expense: Expense) => {
    setViewingExpense(expense);
  };

  const handleEditClick = (expense: Expense) => {
    setEditingExpense(expense);
    setEditVendor(expense.vendor);
    setEditAmount(expense.amount.toString());
    setEditDate(parseLocalDate(expense.date));
    setEditCategory(expense.category);
    setEditDescription(expense.description || "");
  };

  const handleEditSave = async () => {
    if (!editingExpense) return;

    const parsedAmount = parseFloat(editAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    if (!editVendor.trim()) {
      toast.error("Please enter a vendor name");
      return;
    }

    if (!editCategory) {
      toast.error("Please select a category");
      return;
    }

    setIsProcessing(true);
    const formattedDate = format(editDate, "yyyy-MM-dd");

    const result = await onUpdate(editingExpense.id!, {
      vendor: editVendor.trim(),
      amount: parsedAmount,
      date: formattedDate,
      category: editCategory,
      description: editDescription.trim() || undefined,
    });

    setIsProcessing(false);

    if (result.success) {
      setEditingExpense(null);
      toast.success("Expense updated successfully");
    } else {
      toast.error(`Failed to update expense: ${result.error}`);
    }
  };

  const handleDeleteClick = async (expenseId: string) => {
    setIsProcessing(true);
    const result = await onDelete(expenseId);
    setIsProcessing(false);

    if (result.success) {
      setDeleteConfirm(null);
      toast.success("Expense deleted successfully");
    } else {
      toast.error(`Failed to delete expense: ${result.error}`);
    }
  };

  // Multi-select handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allIds = new Set(expenses.map(e => e.id!).filter(Boolean));
      setSelectedExpenses(allIds);
    } else {
      setSelectedExpenses(new Set());
    }
  };

  const handleSelectExpense = (expenseId: string, checked: boolean) => {
    const newSelection = new Set(selectedExpenses);
    if (checked) {
      newSelection.add(expenseId);
    } else {
      newSelection.delete(expenseId);
    }
    setSelectedExpenses(newSelection);
  };

  const handleBulkDelete = async () => {
    setIsBulkDeleting(true);
    let successCount = 0;
    let failCount = 0;

    for (const expenseId of Array.from(selectedExpenses)) {
      const result = await onDelete(expenseId);
      if (result.success) {
        successCount++;
      } else {
        failCount++;
      }
    }

    setIsBulkDeleting(false);
    setBulkDeleteDialogOpen(false);
    setSelectedExpenses(new Set());

    if (failCount > 0) {
      toast.error(`Deleted ${successCount} expenses. Failed to delete ${failCount} expenses.`);
    } else if (successCount > 0) {
      toast.success(`Successfully deleted ${successCount} expense${successCount !== 1 ? 's' : ''}`);
    }
  };

  const allSelected = expenses.length > 0 && selectedExpenses.size === expenses.length;
  const someSelected = selectedExpenses.size > 0 && selectedExpenses.size < expenses.length;

  return (
    <>
      {/* View Expense Modal */}
      <ViewExpenseModal
        expense={viewingExpense}
        open={!!viewingExpense}
        onClose={() => setViewingExpense(null)}
        onEdit={handleEditClick}
        onDelete={(expenseId) => setDeleteConfirm(expenseId)}
      />
      {/* Bulk Actions Bar */}
      {selectedExpenses.size > 0 && (
        <div className="mb-4 flex items-center justify-between p-4 bg-violet-50 dark:bg-violet-950/30 rounded-lg border-2 border-violet-200 dark:border-violet-800 animate-in slide-in-from-top duration-300">
          <div className="flex items-center gap-3">
            <CheckSquare className="h-5 w-5 text-violet-600" />
            <span className="font-semibold text-violet-900 dark:text-violet-100">
              {selectedExpenses.size} {selectedExpenses.size === 1 ? "expense" : "expenses"} selected
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedExpenses(new Set())}
              disabled={isBulkDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setBulkDeleteDialogOpen(true)}
              disabled={isBulkDeleting}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Selected
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-md border overflow-auto max-h-[600px]">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-20">
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={handleSelectAll}
                  aria-label="Select all"
                  className={cn(someSelected && "data-[state=checked]:bg-violet-500")}
                />
              </TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="hidden md:table-cell">Description</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {expenses.map((expense) => (
              <TableRow 
                key={expense.id} 
                className={cn(
                  "cursor-pointer transition-colors",
                  selectedExpenses.has(expense.id!) 
                    ? "bg-violet-50 dark:bg-violet-950/20" 
                    : "hover:bg-muted/50"
                )}
                onClick={() => handleRowClick(expense)}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedExpenses.has(expense.id!)}
                    onCheckedChange={(checked) => handleSelectExpense(expense.id!, checked as boolean)}
                    aria-label={`Select ${expense.vendor}`}
                  />
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {parseLocalDate(expense.date).toLocaleDateString()}
                </TableCell>
                <TableCell className="font-medium">{expense.vendor}</TableCell>
                <TableCell className="max-w-[200px] truncate">{expense.category}</TableCell>
                <TableCell className="text-right font-semibold whitespace-nowrap">
                  ${expense.amount.toFixed(2)}
                </TableCell>
                <TableCell className="max-w-[200px] truncate hidden md:table-cell">
                  {expense.description || "-"}
                </TableCell>
              </TableRow>
            ))}
            {expenses.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  No expenses found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingExpense} onOpenChange={() => setEditingExpense(null)}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl">Edit Expense</DialogTitle>
            <DialogDescription>
              Make changes to your expense details here.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Vendor */}
            <div className="space-y-2">
              <Label htmlFor="edit-vendor" className="text-sm font-semibold">Vendor</Label>
              <Input
                id="edit-vendor"
                value={editVendor}
                onChange={(e) => setEditVendor(e.target.value)}
                placeholder="Enter vendor name"
                disabled={isProcessing}
                className="text-base"
              />
            </div>

            {/* Amount - Highlighted */}
            <div className="space-y-2">
              <Label htmlFor="edit-amount" className="text-sm font-semibold">Amount (CAD)</Label>
              <div className="relative p-4 bg-gradient-to-br from-violet-50 to-fuchsia-50 dark:from-violet-950/30 dark:to-fuchsia-950/30 rounded-xl border-2 border-violet-200 dark:border-violet-800">
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold text-violet-600 dark:text-violet-400">$</span>
                  <Input
                    id="edit-amount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    placeholder="0.00"
                    className="text-2xl font-bold border-0 bg-transparent p-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/50"
                    disabled={isProcessing}
                  />
                </div>
              </div>
            </div>

            {/* Date */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Date</Label>
              <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal text-base h-11",
                      !editDate && "text-muted-foreground"
                    )}
                    disabled={isProcessing}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {editDate ? format(editDate, "MMMM d, yyyy") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={editDate}
                    onSelect={(newDate) => {
                      if (newDate) {
                        setEditDate(newDate);
                        setIsCalendarOpen(false);
                      }
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Category */}
            <div className="space-y-2">
              <Label htmlFor="edit-category" className="text-sm font-semibold">Category</Label>
              <Select
                value={editCategory}
                onValueChange={setEditCategory}
                disabled={isProcessing}
              >
                <SelectTrigger id="edit-category" className="h-11">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {expenseCategories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="edit-description" className="text-sm font-semibold">Description (Optional)</Label>
              <Input
                id="edit-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Add a note about this expense"
                disabled={isProcessing}
                className="text-base"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setEditingExpense(null)}
              disabled={isProcessing}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleEditSave} 
              disabled={isProcessing}
              className="w-full sm:w-auto bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 text-white"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-2xl">Delete Expense</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this expense? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDeleteConfirm(null)}
              disabled={isProcessing}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && handleDeleteClick(deleteConfirm)}
              disabled={isProcessing}
              className="w-full sm:w-auto"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation Dialog */}
      <Dialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-2xl">Delete Multiple Expenses?</DialogTitle>
            <DialogDescription>
              You are about to permanently delete <strong>{selectedExpenses.size}</strong> {selectedExpenses.size === 1 ? "expense" : "expenses"}. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setBulkDeleteDialogOpen(false)}
              disabled={isBulkDeleting}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleBulkDelete}
              disabled={isBulkDeleting}
              className="w-full sm:w-auto"
            >
              {isBulkDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting {selectedExpenses.size} expenses...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete {selectedExpenses.size} Expenses
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

