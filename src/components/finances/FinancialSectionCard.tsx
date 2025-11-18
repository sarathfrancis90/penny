'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { GradientButton } from '@/components/ui/gradient-button';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FinancialSectionCardProps {
  title: string;
  icon: React.ReactNode;
  summary: string;
  details?: string;
  onManage: () => void;
  manageLabel?: string;
  children?: React.ReactNode;
  defaultExpanded?: boolean;
  isEmpty?: boolean;
  emptyState?: React.ReactNode;
}

export function FinancialSectionCard({
  title,
  icon,
  summary,
  details,
  onManage,
  manageLabel = 'Manage',
  children,
  defaultExpanded = false,
  isEmpty = false,
  emptyState,
}: FinancialSectionCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <Card className="glass border-2 border-violet-200/50 dark:border-violet-800/30 overflow-hidden transition-all duration-300 hover:shadow-lg">
      {/* Header - Always Visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          'w-full p-4 flex items-center gap-4 text-left transition-colors',
          'hover:bg-accent/30 active:bg-accent/50',
          'min-h-[80px]', // Mobile-friendly tap target
          isExpanded && 'bg-gradient-to-r from-violet-50/50 to-fuchsia-50/50 dark:from-violet-950/20 dark:to-fuchsia-950/20'
        )}
      >
        {/* Icon */}
        <div className="flex-shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shadow-lg">
          <div className="text-white">{icon}</div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold mb-1">{title}</h3>
          <p className="text-sm text-muted-foreground truncate">
            {summary}
          </p>
          {details && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {details}
            </p>
          )}
        </div>

        {/* Expand Icon */}
        <div className="flex-shrink-0">
          {isExpanded ? (
            <ChevronUp className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <CardContent className="pt-4 pb-6 border-t border-border animate-in slide-in-from-top-2 duration-300">
          {isEmpty && emptyState ? (
            <div className="py-8">
              {emptyState}
            </div>
          ) : (
            <>
              {children && (
                <div className="mb-4">
                  {children}
                </div>
              )}
              
              {/* Manage Button */}
              <div className="flex justify-center pt-2">
                <GradientButton
                  onClick={(e) => {
                    e.stopPropagation();
                    onManage();
                  }}
                  variant="primary"
                  className="w-full sm:w-auto"
                >
                  {manageLabel}
                </GradientButton>
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}

