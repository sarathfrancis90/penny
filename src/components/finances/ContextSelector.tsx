'use client';

import { useState } from 'react';
import { useGroups } from '@/hooks/useGroups';
import {
  BottomSheet,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetTitle,
  BottomSheetDescription,
} from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { Check, ChevronDown, Users, User } from 'lucide-react';
import { cn } from '@/lib/utils';

export type FinancialContext = {
  type: 'personal' | 'group';
  groupId?: string;
  groupName?: string;
};

interface ContextSelectorProps {
  selected: FinancialContext;
  onSelect: (context: FinancialContext) => void;
}

export function ContextSelector({ selected, onSelect }: ContextSelectorProps) {
  const [open, setOpen] = useState(false);
  const { groups, loading } = useGroups();

  const handleSelect = (context: FinancialContext) => {
    onSelect(context);
    setOpen(false);
  };

  const displayText =
    selected.type === 'personal'
      ? 'Personal'
      : selected.groupName || 'Group';

  const displayIcon =
    selected.type === 'personal' ? (
      <User className="h-4 w-4" />
    ) : (
      <Users className="h-4 w-4" />
    );

  return (
    <BottomSheet open={open} onOpenChange={setOpen}>
      {/* Trigger Button - Mobile Optimized */}
      <Button
        variant="outline"
        className="h-11 gap-2 px-4 border-2 hover:bg-accent/50 transition-colors"
        onClick={() => setOpen(true)}
      >
        {displayIcon}
        <span className="font-medium">{displayText}</span>
        <ChevronDown className="h-4 w-4 ml-1 opacity-50" />
      </Button>

      {/* Bottom Sheet Content */}
      <BottomSheetContent>
        <BottomSheetHeader>
          <BottomSheetTitle>Choose Context</BottomSheetTitle>
          <BottomSheetDescription>
            Select what you want to manage
          </BottomSheetDescription>
        </BottomSheetHeader>

        <div className="px-6 pb-6 space-y-2">
          {/* Personal Option */}
          <button
            onClick={() =>
              handleSelect({ type: 'personal' })
            }
            className={cn(
              'w-full flex items-center gap-4 p-4 rounded-lg border-2 transition-all',
              'hover:bg-accent/50 active:scale-[0.98]',
              'min-h-[72px]', // Mobile-friendly tap target
              selected.type === 'personal'
                ? 'border-primary bg-primary/5'
                : 'border-border'
            )}
          >
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-semibold">Personal</p>
              <p className="text-sm text-muted-foreground">
                Your individual finances
              </p>
            </div>
            {selected.type === 'personal' && (
              <Check className="h-5 w-5 text-primary flex-shrink-0" />
            )}
          </button>

          {/* Group Options */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : groups.length > 0 ? (
            <>
              <div className="pt-4 pb-2">
                <p className="text-sm font-medium text-muted-foreground px-1">
                  Your Groups
                </p>
              </div>
              {groups.map((group) => {
                const isSelected =
                  selected.type === 'group' &&
                  selected.groupId === group.id;
                const memberCount = group.memberCount;

                return (
                  <button
                    key={group.id}
                    onClick={() =>
                      handleSelect({
                        type: 'group',
                        groupId: group.id,
                        groupName: group.name,
                      })
                    }
                    className={cn(
                      'w-full flex items-center gap-4 p-4 rounded-lg border-2 transition-all',
                      'hover:bg-accent/50 active:scale-[0.98]',
                      'min-h-[72px]', // Mobile-friendly tap target
                      isSelected
                        ? 'border-primary bg-primary/5'
                        : 'border-border'
                    )}
                  >
                    <div
                      className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
                      style={{
                        backgroundColor: `${group.color}20`,
                      }}
                    >
                      <Users
                        className="h-5 w-5"
                        style={{ color: group.color }}
                      />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="font-semibold">{group.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {memberCount} member{memberCount !== 1 ? 's' : ''}
                      </p>
                    </div>
                    {isSelected && (
                      <Check className="h-5 w-5 text-primary flex-shrink-0" />
                    )}
                  </button>
                );
              })}
            </>
          ) : (
            <div className="text-center py-8">
              <Users className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
              <p className="text-sm text-muted-foreground">
                No groups yet. Create one to get started!
              </p>
            </div>
          )}
        </div>
      </BottomSheetContent>
    </BottomSheet>
  );
}

