"use client";

import { BudgetStatus } from "@/lib/types";
import {
  getStatusColor,
  getStatusBgColor,
  getStatusBorderColor,
} from "@/lib/budgetCalculations";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  XCircle,
} from "lucide-react";

interface BudgetStatusBadgeProps {
  status: BudgetStatus;
  size?: "sm" | "md" | "lg";
  showIcon?: boolean;
  className?: string;
}

/**
 * Badge component for displaying budget status
 */
export function BudgetStatusBadge({
  status,
  size = "md",
  showIcon = true,
  className,
}: BudgetStatusBadgeProps) {
  const sizeClasses = {
    sm: "text-xs px-2 py-0.5",
    md: "text-sm px-3 py-1",
    lg: "text-base px-4 py-1.5",
  };

  const iconSizes = {
    sm: 12,
    md: 14,
    lg: 16,
  };

  const statusConfig = {
    safe: {
      label: "On Track",
      icon: CheckCircle2,
    },
    warning: {
      label: "Approaching",
      icon: AlertTriangle,
    },
    critical: {
      label: "Near Limit",
      icon: AlertOctagon,
    },
    over: {
      label: "Exceeded",
      icon: XCircle,
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;
  const textColor = getStatusColor(status);
  const bgColor = getStatusBgColor(status);
  const borderColor = getStatusBorderColor(status);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium border-2 transition-colors",
        sizeClasses[size],
        textColor,
        bgColor,
        borderColor,
        className
      )}
    >
      {showIcon && <Icon size={iconSizes[size]} />}
      {config.label}
    </span>
  );
}

