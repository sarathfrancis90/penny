"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar as CalendarIcon, DollarSign, Store, Tag, CheckCircle2, XCircle } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { expenseCategories } from "@/lib/categories";
import { format } from "date-fns";

interface ExpenseConfirmationCardProps {
  vendor: string;
  amount: number;
  date: string;
  category: string;
  description?: string;
  confidence?: number;
  onConfirm: (editedData: {
    vendor: string;
    amount: number;
    date: string;
    category: string;
    description?: string;
  }) => void;
  onCancel: () => void;
  isProcessing?: boolean;
}

export function ExpenseConfirmationCard({
  vendor: initialVendor,
  amount: initialAmount,
  date: initialDate,
  category: initialCategory,
  description: initialDescription,
  confidence,
  onConfirm,
  onCancel,
  isProcessing = false,
}: ExpenseConfirmationCardProps) {
  // State for editable fields
  const [vendor, setVendor] = useState(initialVendor);
  const [amount, setAmount] = useState(initialAmount.toString());
  const [date, setDate] = useState<Date>(() => {
    // If no date or invalid date, use today's date
    if (!initialDate || initialDate === "") {
      return new Date();
    }
    const parsedDate = new Date(initialDate);
    return isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
  });
  const [category, setCategory] = useState(initialCategory);
  const [description, setDescription] = useState(initialDescription || "");
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  // Update state when props change
  useEffect(() => {
    setVendor(initialVendor);
    setAmount(initialAmount.toString());
    if (initialDate && initialDate !== "") {
      const parsedDate = new Date(initialDate);
      if (!isNaN(parsedDate.getTime())) {
        setDate(parsedDate);
      }
    }
    setCategory(initialCategory);
    setDescription(initialDescription || "");
  }, [initialVendor, initialAmount, initialDate, initialCategory, initialDescription]);

  const handleConfirm = () => {
    // Parse amount and validate
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      alert("Please enter a valid amount");
      return;
    }

    if (!vendor.trim()) {
      alert("Please enter a vendor name");
      return;
    }

    if (!category) {
      alert("Please select a category");
      return;
    }

    // Format date as YYYY-MM-DD
    const formattedDate = format(date, "yyyy-MM-dd");

    onConfirm({
      vendor: vendor.trim(),
      amount: parsedAmount,
      date: formattedDate,
      category,
      description: description.trim() || undefined,
    });
  };

  return (
    <Card className="w-full max-w-md border-2 border-primary/20 shadow-md">
      <CardContent className="pt-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between">
          <h3 className="font-semibold text-lg">Expense Details</h3>
          {confidence !== undefined && confidence < 0.8 && (
            <span className="text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 px-2 py-1 rounded-full">
              Low confidence
            </span>
          )}
        </div>

        {/* Vendor - Editable */}
        <div className="space-y-2">
          <Label htmlFor="vendor" className="text-xs text-muted-foreground flex items-center gap-2">
            <Store className="h-4 w-4 text-primary" />
            Vendor
          </Label>
          <Input
            id="vendor"
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            placeholder="Enter vendor name"
            className="font-medium"
            disabled={isProcessing}
          />
        </div>

        {/* Amount - Editable */}
        <div className="space-y-2">
          <Label htmlFor="amount" className="text-xs text-muted-foreground flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-green-600 dark:text-green-400" />
            Amount (CAD)
          </Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="pl-7 font-semibold text-green-600 dark:text-green-400"
              disabled={isProcessing}
            />
          </div>
        </div>

        {/* Date - Editable with Date Picker */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            Date
          </Label>
          <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-medium",
                  !date && "text-muted-foreground"
                )}
                disabled={isProcessing}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {date ? format(date, "MMMM d, yyyy") : <span>Pick a date</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={date}
                onSelect={(newDate) => {
                  if (newDate) {
                    setDate(newDate);
                    setIsCalendarOpen(false);
                  }
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Category - Editable Dropdown */}
        <div className="space-y-2">
          <Label htmlFor="category" className="text-xs text-muted-foreground flex items-center gap-2">
            <Tag className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            Category
          </Label>
          <Select value={category} onValueChange={setCategory} disabled={isProcessing}>
            <SelectTrigger id="category" className="font-medium">
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

        {/* Description - Editable */}
        <div className="space-y-2 pt-2 border-t">
          <Label htmlFor="description" className="text-xs text-muted-foreground">
            Description (Optional)
          </Label>
          <Input
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add a note about this expense"
            className="text-sm"
            disabled={isProcessing}
          />
        </div>
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
          onClick={handleConfirm}
          disabled={isProcessing}
        >
          <CheckCircle2 className="h-4 w-4 mr-2" />
          {isProcessing ? "Saving..." : "Confirm & Save"}
        </Button>
      </CardFooter>
    </Card>
  );
}
