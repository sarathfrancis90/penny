"use client";

import { useState } from "react";
import { ReceiptImageViewer } from "./ReceiptImageViewer";
import { Receipt, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ReceiptDisplayProps {
  receiptUrl: string | null | undefined;
  className?: string;
}

export function ReceiptDisplay({ receiptUrl, className }: ReceiptDisplayProps) {
  const [isVisible, setIsVisible] = useState(false);

  if (!receiptUrl) {
    return null;
  }

  return (
    <div className={className}>
      <div className="space-y-3">
        {/* Toggle Button */}
        <Button
          variant="outline"
          onClick={() => setIsVisible(!isVisible)}
          className="w-full justify-between h-auto py-3 hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            <span className="font-semibold">
              {isVisible ? "Hide Receipt" : "Show Receipt"}
            </span>
          </div>
          {isVisible ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>

        {/* Receipt Image - Only loads when visible */}
        {isVisible && (
          <div className="pl-6 animate-in fade-in duration-300">
            <ReceiptImageViewer imageUrl={receiptUrl} alt="Expense Receipt" />
          </div>
        )}
      </div>
    </div>
  );
}

