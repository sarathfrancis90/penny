"use client";

import { Expense } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  DollarSign,
  Store,
  Calendar,
  Tag,
  FileText,
  Users,
  Clock,
  Edit,
  Trash2,
} from "lucide-react";
import { format } from "date-fns";

interface ViewExpenseModalProps {
  expense: Expense | null;
  open: boolean;
  onClose: () => void;
  onEdit: (expense: Expense) => void;
  onDelete: (expenseId: string) => void;
}

export function ViewExpenseModal({
  expense,
  open,
  onClose,
  onEdit,
  onDelete,
}: ViewExpenseModalProps) {
  if (!expense) return null;

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

  const expenseDate = parseLocalDate(expense.date);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">Expense Details</DialogTitle>
          <DialogDescription>
            View complete information about this expense
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Amount - Large and Prominent */}
          <div className="flex items-center justify-center p-6 bg-gradient-to-br from-violet-50 to-fuchsia-50 dark:from-violet-950 dark:to-fuchsia-950 rounded-2xl border-2 border-violet-200 dark:border-violet-800">
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <DollarSign className="h-8 w-8 text-violet-600 dark:text-violet-400" />
                <span className="text-5xl font-bold gradient-text">
                  ${expense.amount.toFixed(2)}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">Total Amount</p>
            </div>
          </div>

          <Separator />

          {/* Vendor */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Store className="h-4 w-4" />
              <span>Vendor</span>
            </div>
            <p className="text-lg font-semibold pl-6">{expense.vendor}</p>
          </div>

          {/* Date */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>Date</span>
            </div>
            <p className="text-lg pl-6">
              {format(expenseDate, "EEEE, MMMM d, yyyy")}
            </p>
          </div>

          {/* Category */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Tag className="h-4 w-4" />
              <span>Category</span>
            </div>
            <div className="pl-6">
              <Badge variant="secondary" className="text-base px-4 py-1">
                {expense.category}
              </Badge>
            </div>
          </div>

          {/* Description */}
          {expense.description && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <FileText className="h-4 w-4" />
                <span>Description</span>
              </div>
              <p className="text-base pl-6 text-muted-foreground leading-relaxed">
                {expense.description}
              </p>
            </div>
          )}

          {/* Group Info */}
          {expense.groupId && (
            <>
              <Separator />
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                  <Users className="h-4 w-4" />
                  <span>Group Expense</span>
                </div>
                <div className="pl-6">
                  <Badge variant="outline" className="text-sm">
                    {expense.expenseType === "group" ? "Shared Expense" : "Personal Expense"}
                  </Badge>
                </div>
              </div>
            </>
          )}

          {/* Metadata - Created/Updated */}
          {(expense.createdAt || expense.updatedAt) && (
            <>
              <Separator />
              <div className="space-y-3 pl-6">
                {expense.createdAt && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>
                      Created {format(parseLocalDate(expense.createdAt), "MMM d, yyyy 'at' h:mm a")}
                    </span>
                  </div>
                )}
                {expense.updatedAt && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>
                      Updated {format(parseLocalDate(expense.updatedAt), "MMM d, yyyy 'at' h:mm a")}
                    </span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            className="w-full sm:w-auto order-3 sm:order-1"
          >
            Close
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              onDelete(expense.id!);
              onClose();
            }}
            className="w-full sm:w-auto order-2"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
          <Button
            onClick={() => {
              onEdit(expense);
              onClose();
            }}
            className="w-full sm:w-auto order-1 sm:order-3 bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600"
          >
            <Edit className="mr-2 h-4 w-4" />
            Edit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

