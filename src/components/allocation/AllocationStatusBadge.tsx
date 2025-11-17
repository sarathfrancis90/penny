'use client';

import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/incomeCalculations';
import { cn } from '@/lib/utils';

interface AllocationStatusBadgeProps {
  unallocated: number;
  isOverAllocated: boolean;
  totalIncome: number;
  showDetails?: boolean;
  className?: string;
}

export function AllocationStatusBadge({
  unallocated,
  isOverAllocated,
  totalIncome,
  showDetails = true,
  className,
}: AllocationStatusBadgeProps) {
  if (totalIncome === 0) {
    return (
      <Badge variant="outline" className={cn("gap-2", className)}>
        <Info className="h-3 w-3" />
        No income sources
      </Badge>
    );
  }

  if (isOverAllocated) {
    return (
      <Badge variant="destructive" className={cn("gap-2", className)}>
        <AlertTriangle className="h-3 w-3" />
        {showDetails && <>Over-allocated by {formatCurrency(Math.abs(unallocated), 'USD')}</>}
        {!showDetails && <>Over-allocated</>}
      </Badge>
    );
  }

  if (unallocated === 0) {
    return (
      <Badge 
        variant="outline" 
        className={cn("gap-2 border-green-500 text-green-700 dark:text-green-400", className)}
      >
        <CheckCircle className="h-3 w-3" />
        Fully allocated
      </Badge>
    );
  }

  return (
    <Badge 
      variant="outline" 
      className={cn("gap-2 border-blue-500 text-blue-700 dark:text-blue-400", className)}
    >
      <CheckCircle className="h-3 w-3" />
      {showDetails && <>{formatCurrency(unallocated, 'USD')} available</>}
      {!showDetails && <>Available</>}
    </Badge>
  );
}

