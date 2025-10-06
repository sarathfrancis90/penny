"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Calendar, DollarSign, Store, Tag, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ExpenseConfirmationCardProps {
  vendor: string;
  amount: number;
  date: string;
  category: string;
  description?: string;
  confidence?: number;
  onConfirm: () => void;
  onCancel: () => void;
  isProcessing?: boolean;
}

export function ExpenseConfirmationCard({
  vendor,
  amount,
  date,
  category,
  description,
  confidence,
  onConfirm,
  onCancel,
  isProcessing = false,
}: ExpenseConfirmationCardProps) {
  // Format date for display
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-CA", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return dateString;
    }
  };

  return (
    <Card className="w-full max-w-md border-2 border-primary/20 shadow-md">
      <CardContent className="pt-6 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <h3 className="font-semibold text-lg">Expense Details</h3>
          {confidence !== undefined && confidence < 0.8 && (
            <span className="text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 px-2 py-1 rounded-full">
              Low confidence
            </span>
          )}
        </div>

        {/* Vendor */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Store className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">Vendor</p>
            <p className="font-medium truncate">{vendor}</p>
          </div>
        </div>

        {/* Amount */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
            <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">Amount</p>
            <p className="font-semibold text-xl text-green-600 dark:text-green-400">
              ${amount.toFixed(2)} CAD
            </p>
          </div>
        </div>

        {/* Date */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
            <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">Date</p>
            <p className="font-medium">{formatDate(date)}</p>
          </div>
        </div>

        {/* Category */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
            <Tag className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">Category</p>
            <p className="font-medium text-sm">{category}</p>
          </div>
        </div>

        {/* Description (if available) */}
        {description && (
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground mb-1">Description</p>
            <p className="text-sm">{description}</p>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex gap-2 pt-0">
        <Button
          variant="outline"
          className="flex-1"
          onClick={onCancel}
          disabled={isProcessing}
        >
          <XCircle className="h-4 w-4 mr-2" />
          Cancel
        </Button>
        <Button
          className={cn(
            "flex-1",
            "bg-green-600 hover:bg-green-700 text-white"
          )}
          onClick={onConfirm}
          disabled={isProcessing}
        >
          <CheckCircle2 className="h-4 w-4 mr-2" />
          {isProcessing ? "Saving..." : "Confirm & Save"}
        </Button>
      </CardFooter>
    </Card>
  );
}
