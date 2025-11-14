"use client";

import { ReceiptImageViewer } from "./ReceiptImageViewer";
import { Receipt } from "lucide-react";

interface ReceiptDisplayProps {
  receiptUrl: string | null | undefined;
  className?: string;
}

export function ReceiptDisplay({ receiptUrl, className }: ReceiptDisplayProps) {
  if (!receiptUrl) {
    return null;
  }

  return (
    <div className={className}>
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Receipt className="h-4 w-4" />
          <span>Receipt</span>
        </div>
        <div className="pl-6">
          <ReceiptImageViewer imageUrl={receiptUrl} alt="Expense Receipt" />
        </div>
      </div>
    </div>
  );
}

