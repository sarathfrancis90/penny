"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar as CalendarIcon, DollarSign, Store, Tag, CheckCircle2, XCircle, Sparkles, AlertCircle, Users } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { expenseCategories } from "@/lib/categories";
import { format } from "date-fns";
import { GroupSelector } from "@/components/groups";
import { BudgetImpactPreview } from "@/components/budgets/BudgetImpactPreview";
import { OverBudgetWarningModal } from "@/components/budgets/OverBudgetWarningModal";
import { useAuth } from "@/contexts/AuthContext";
import { usePersonalBudgets } from "@/hooks/usePersonalBudgets";
import { useGroupBudgets } from "@/hooks/useGroupBudgets";
import { useBudgetUsage } from "@/hooks/useBudgetUsage";
import { getCurrentPeriod } from "@/lib/budgetCalculations";
import { useGroups } from "@/hooks/useGroups";

// Helper function to parse date string in local timezone
const parseLocalDate = (dateString: string): Date => {
  if (!dateString || dateString === "") {
    return new Date();
  }
  const [year, month, day] = dateString.split("-").map(Number);
  if (!year || !month || !day) {
    return new Date();
  }
  const parsedDate = new Date(year, month - 1, day);
  return isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
};

interface ExpenseConfirmationCardProps {
  vendor: string;
  amount: number;
  date: string;
  category: string;
  description?: string;
  confidence?: number;
  groupId?: string | null;
  onConfirm: (editedData: {
    vendor: string;
    amount: number;
    date: string;
    category: string;
    description?: string;
    groupId?: string | null;
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
  groupId: initialGroupId,
  confidence,
  onConfirm,
  onCancel,
  isProcessing = false,
}: ExpenseConfirmationCardProps) {
  const [vendor, setVendor] = useState(initialVendor);
  const [amount, setAmount] = useState(initialAmount.toString());
  const [date, setDate] = useState<Date>(() => parseLocalDate(initialDate));
  const [category, setCategory] = useState(initialCategory);
  const [description, setDescription] = useState(initialDescription || "");
  const [groupId, setGroupId] = useState<string | null>(initialGroupId || null);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [willExceedBudget, setWillExceedBudget] = useState(false);
  const [showOverBudgetModal, setShowOverBudgetModal] = useState(false);
  const [pendingConfirmData, setPendingConfirmData] = useState<typeof editedData | null>(null);

  const { user } = useAuth();
  const { groups } = useGroups();
  const currentPeriod = getCurrentPeriod();

  // Fetch budget data for the modal
  const { budgets: personalBudgets } = usePersonalBudgets(
    groupId ? undefined : user?.uid,
    category,
    currentPeriod.month,
    currentPeriod.year
  );

  const { budgets: groupBudgets } = useGroupBudgets(
    groupId || undefined,
    category,
    currentPeriod.month,
    currentPeriod.year
  );

  const { usage: personalUsage } = useBudgetUsage(
    groupId ? undefined : user?.uid,
    "personal",
    undefined,
    currentPeriod.month,
    currentPeriod.year
  );

  const { usage: groupUsage } = useBudgetUsage(
    groupId ? user?.uid : undefined,
    "group",
    groupId || undefined,
    currentPeriod.month,
    currentPeriod.year
  );

  const relevantBudget = groupId ? groupBudgets[0] : personalBudgets[0];
  const currentUsage = groupId
    ? groupUsage.find((u) => u.category === category)
    : personalUsage.find((u) => u.category === category);
  const selectedGroup = groups?.find((g) => g.id === groupId);

  type EditedData = {
    vendor: string;
    amount: number;
    date: string;
    category: string;
    description?: string;
    groupId?: string | null;
  };

  useEffect(() => {
    setVendor(initialVendor);
    setAmount(initialAmount.toString());
    setDate(parseLocalDate(initialDate));
    setCategory(initialCategory);
    setDescription(initialDescription || "");
    setGroupId(initialGroupId || null);
  }, [initialVendor, initialAmount, initialDate, initialCategory, initialDescription, initialGroupId]);

  const validate = (): boolean => {
    const newErrors: { [key: string]: string } = {};
    
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      newErrors.amount = "Please enter a valid amount";
    }
    
    if (!vendor.trim()) {
      newErrors.vendor = "Please enter a vendor name";
    }
    
    if (!category) {
      newErrors.category = "Please select a category";
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleConfirm = () => {
    if (!validate()) return;

    const formattedDate = format(date, "yyyy-MM-dd");
    const editedData: EditedData = {
      vendor: vendor.trim(),
      amount: parseFloat(amount),
      date: formattedDate,
      category,
      description: description?.trim(),
      groupId,
    };

    // Check if this will exceed budget and show modal if needed
    if (willExceedBudget && relevantBudget && currentUsage) {
      setPendingConfirmData(editedData);
      setShowOverBudgetModal(true);
    } else {
      // No budget issue, confirm immediately
      onConfirm(editedData);
    }
  };

  const handleOverBudgetConfirm = () => {
    if (pendingConfirmData) {
      onConfirm(pendingConfirmData);
      setShowOverBudgetModal(false);
      setPendingConfirmData(null);
    }
  };

  const handleOverBudgetCancel = () => {
    setShowOverBudgetModal(false);
    setPendingConfirmData(null);
  };

  const getConfidenceColor = () => {
    if (!confidence) return "text-slate-500";
    if (confidence >= 0.8) return "text-green-500";
    if (confidence >= 0.6) return "text-yellow-500";
    return "text-red-500";
  };

  const getConfidenceText = () => {
    if (!confidence) return "Unknown";
    if (confidence >= 0.8) return "High Confidence";
    if (confidence >= 0.6) return "Medium Confidence";
    return "Low Confidence";
  };

  return (
    <Card className="animate-in slide-in-from-bottom-4 fade-in-50 duration-500 glass border-2 border-violet-200 dark:border-violet-800/30 shadow-2xl shadow-violet-500/10">
      {/* Header with Gradient */}
      <CardHeader className="border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-violet-50 to-fuchsia-50 dark:from-violet-950/30 dark:to-fuchsia-950/30 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-violet-500/30">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold gradient-text">Confirm Expense</h3>
              <p className="text-xs text-muted-foreground">Review and edit details</p>
            </div>
          </div>
          {confidence && (
            <div className="flex flex-col items-end">
              <span className={cn("text-xs font-semibold", getConfidenceColor())}>
                {getConfidenceText()}
              </span>
              <div className="flex items-center gap-2 mt-1">
                <div className="w-20 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full transition-all duration-500 rounded-full",
                      confidence >= 0.8 ? "bg-green-500" : confidence >= 0.6 ? "bg-yellow-500" : "bg-red-500"
                    )}
                    style={{ width: `${confidence * 100}%` }}
                  />
                </div>
                <span className="text-xs font-bold">{(confidence * 100).toFixed(0)}%</span>
              </div>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-5 pt-6">
        {/* Vendor Input */}
        <div className="space-y-2 group">
          <Label htmlFor="vendor" className="flex items-center gap-2 text-sm font-semibold">
            <Store className="h-4 w-4 text-violet-500" />
            Vendor
          </Label>
          <Input
            id="vendor"
            value={vendor}
            onChange={(e) => {
              setVendor(e.target.value);
              if (errors.vendor) setErrors({ ...errors, vendor: "" });
            }}
            disabled={isProcessing}
            className={cn(
              "transition-all duration-300 h-11",
              errors.vendor 
                ? "border-red-500 focus-visible:ring-red-500" 
                : "focus-visible:ring-violet-500 focus-visible:border-violet-500"
            )}
            placeholder="e.g., Staples, Amazon, etc."
          />
          {errors.vendor && (
            <p className="text-xs text-red-500 flex items-center gap-1 animate-in slide-in-from-top-1">
              <AlertCircle className="h-3 w-3" />
              {errors.vendor}
            </p>
          )}
        </div>

        {/* Amount Input */}
        <div className="space-y-2 group">
          <Label htmlFor="amount" className="flex items-center gap-2 text-sm font-semibold">
            <DollarSign className="h-4 w-4 text-green-500" />
            Amount
          </Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">
              $
            </span>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                if (errors.amount) setErrors({ ...errors, amount: "" });
              }}
              disabled={isProcessing}
              className={cn(
                "pl-7 transition-all duration-300 h-11 font-semibold text-lg",
                errors.amount 
                  ? "border-red-500 focus-visible:ring-red-500" 
                  : "focus-visible:ring-green-500 focus-visible:border-green-500"
              )}
              placeholder="0.00"
            />
          </div>
          {errors.amount && (
            <p className="text-xs text-red-500 flex items-center gap-1 animate-in slide-in-from-top-1">
              <AlertCircle className="h-3 w-3" />
              {errors.amount}
            </p>
          )}
        </div>

        {/* Date Picker */}
        <div className="space-y-2 group">
          <Label className="flex items-center gap-2 text-sm font-semibold">
            <CalendarIcon className="h-4 w-4 text-blue-500" />
            Date
          </Label>
          <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                disabled={isProcessing}
                className={cn(
                  "w-full justify-start text-left font-normal h-11 transition-all duration-300",
                  !date && "text-muted-foreground",
                  "hover:bg-blue-50 dark:hover:bg-blue-950/30 hover:border-blue-500"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4 text-blue-500" />
                {date ? format(date, "PPP") : <span>Pick a date</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 glass" align="start">
              <Calendar
                mode="single"
                selected={date}
                onSelect={(newDate) => {
                  if (newDate) {
                    setDate(newDate);
                    setIsCalendarOpen(false);
                  }
                }}
                disabled={isProcessing}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Category Select */}
        <div className="space-y-2 group">
          <Label htmlFor="category" className="flex items-center gap-2 text-sm font-semibold">
            <Tag className="h-4 w-4 text-fuchsia-500" />
            Category
          </Label>
          <Select value={category} onValueChange={setCategory} disabled={isProcessing}>
            <SelectTrigger 
              id="category"
              className={cn(
                "h-11 transition-all duration-300",
                errors.category 
                  ? "border-red-500 focus:ring-red-500" 
                  : "focus:ring-fuchsia-500 focus:border-fuchsia-500"
              )}
            >
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent className="max-h-[300px]">
              {expenseCategories.map((cat) => (
                <SelectItem key={cat} value={cat} className="cursor-pointer">
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.category && (
            <p className="text-xs text-red-500 flex items-center gap-1 animate-in slide-in-from-top-1">
              <AlertCircle className="h-3 w-3" />
              {errors.category}
            </p>
          )}
        </div>

        {/* Group Selector */}
        <div className="space-y-2 group">
          <Label className="flex items-center gap-2 text-sm font-semibold">
            <Users className="h-4 w-4 text-violet-500" />
            Assign to Group
          </Label>
          <GroupSelector 
            value={groupId}
            onChange={setGroupId}
            disabled={isProcessing}
          />
          <p className="text-xs text-muted-foreground">
            {groupId ? "This expense will be shared with the group" : "This is a personal expense"}
          </p>
        </div>

        {/* Description (Optional) */}
        <div className="space-y-2 group">
          <Label htmlFor="description" className="text-sm font-semibold text-muted-foreground">
            Description <span className="text-xs">(Optional)</span>
          </Label>
          <Input
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isProcessing}
            className="transition-all duration-300 h-11"
            placeholder="Additional notes..."
          />
        </div>

        {/* Budget Impact Preview */}
        {user && category && parseFloat(amount) > 0 && (
          <BudgetImpactPreview
            userId={user.uid}
            category={category}
            amount={parseFloat(amount)}
            groupId={groupId}
            onImpactCalculated={setWillExceedBudget}
          />
        )}
      </CardContent>

      {/* Action Buttons */}
      <CardFooter className="flex gap-3 border-t border-slate-200 dark:border-slate-800 pt-6">
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={isProcessing}
          className="flex-1 h-11 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600 dark:hover:text-red-400 hover:border-red-300 dark:hover:border-red-700 transition-all duration-300 hover:scale-105"
        >
          <XCircle className="mr-2 h-4 w-4" />
          Cancel
        </Button>
        <Button
          onClick={handleConfirm}
          disabled={isProcessing}
          className="flex-1 h-11 bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 shadow-lg shadow-violet-500/30 hover:shadow-violet-500/50 transition-all duration-300 hover:scale-105"
        >
          {isProcessing ? (
            <>
              <div className="h-4 w-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Confirm & Save
            </>
          )}
        </Button>
      </CardFooter>

      {/* Over Budget Warning Modal */}
      {relevantBudget && currentUsage && (
        <OverBudgetWarningModal
          open={showOverBudgetModal}
          onOpenChange={setShowOverBudgetModal}
          category={category}
          budgetLimit={relevantBudget.monthlyLimit}
          currentSpent={currentUsage.totalSpent}
          expenseAmount={parseFloat(amount) || 0}
          overBudgetAmount={Math.abs(currentUsage.totalSpent + parseFloat(amount) - relevantBudget.monthlyLimit)}
          groupName={selectedGroup?.name}
          onConfirm={handleOverBudgetConfirm}
          onCancel={handleOverBudgetCancel}
        />
      )}
    </Card>
  );
}
