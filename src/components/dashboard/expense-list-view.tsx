"use client";

import { useState } from "react";
import { Expense } from "@/lib/types";
import { Button } from "@/components/ui/button";
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
import { Pencil, Trash2, Calendar as CalendarIcon, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

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
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
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
      alert("Please enter a valid amount");
      return;
    }

    if (!editVendor.trim()) {
      alert("Please enter a vendor name");
      return;
    }

    if (!editCategory) {
      alert("Please select a category");
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
    } else {
      alert(`Failed to update expense: ${result.error}`);
    }
  };

  const handleDeleteClick = async (expenseId: string) => {
    setIsProcessing(true);
    const result = await onDelete(expenseId);
    setIsProcessing(false);

    if (result.success) {
      setDeleteConfirm(null);
    } else {
      alert(`Failed to delete expense: ${result.error}`);
    }
  };

  return (
    <>
      <div className="rounded-md border overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10">
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {expenses.map((expense) => (
              <TableRow key={expense.id}>
                <TableCell className="whitespace-nowrap">
                  {parseLocalDate(expense.date).toLocaleDateString()}
                </TableCell>
                <TableCell className="font-medium">{expense.vendor}</TableCell>
                <TableCell className="max-w-[200px] truncate">{expense.category}</TableCell>
                <TableCell className="text-right font-semibold">
                  ${expense.amount.toFixed(2)}
                </TableCell>
                <TableCell className="max-w-[200px] truncate">
                  {expense.description || "-"}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEditClick(expense)}
                      disabled={isProcessing}
                      title="Edit expense"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteConfirm(expense.id!)}
                      disabled={isProcessing}
                      title="Delete expense"
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
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
            <DialogTitle>Edit Expense</DialogTitle>
            <DialogDescription>
              Make changes to your expense details here.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Vendor */}
            <div className="space-y-2">
              <Label htmlFor="edit-vendor">Vendor</Label>
              <Input
                id="edit-vendor"
                value={editVendor}
                onChange={(e) => setEditVendor(e.target.value)}
                placeholder="Enter vendor name"
                disabled={isProcessing}
              />
            </div>

            {/* Amount */}
            <div className="space-y-2">
              <Label htmlFor="edit-amount">Amount (CAD)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  $
                </span>
                <Input
                  id="edit-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  placeholder="0.00"
                  className="pl-7"
                  disabled={isProcessing}
                />
              </div>
            </div>

            {/* Date */}
            <div className="space-y-2">
              <Label>Date</Label>
              <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
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
              <Label htmlFor="edit-category">Category</Label>
              <Select
                value={editCategory}
                onValueChange={setEditCategory}
                disabled={isProcessing}
              >
                <SelectTrigger id="edit-category">
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
              <Label htmlFor="edit-description">Description (Optional)</Label>
              <Input
                id="edit-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Add a note about this expense"
                disabled={isProcessing}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingExpense(null)}
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button onClick={handleEditSave} disabled={isProcessing}>
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
            <DialogTitle>Delete Expense</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this expense? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteConfirm(null)}
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && handleDeleteClick(deleteConfirm)}
              disabled={isProcessing}
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
    </>
  );
}

