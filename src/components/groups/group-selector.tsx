"use client";

import { useGroups } from "@/hooks/useGroups";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { User, Users } from "lucide-react";

interface GroupSelectorProps {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}

export function GroupSelector({ value, onChange, disabled }: GroupSelectorProps) {
  const { groups, loading } = useGroups();

  const handleValueChange = (newValue: string) => {
    if (newValue === "personal") {
      onChange(null);
    } else {
      onChange(newValue);
    }
  };

  const selectedGroup = groups.find((g) => g.id === value);

  return (
    <Select
      value={value || "personal"}
      onValueChange={handleValueChange}
      disabled={disabled || loading}
    >
      <SelectTrigger className="w-full">
        <SelectValue>
          {value ? (
            <div className="flex items-center gap-2">
              <span className="text-lg">{selectedGroup?.icon || "👥"}</span>
              <span>{selectedGroup?.name || "Loading..."}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <User className="h-4 w-4" />
              <span>Personal Expense</span>
            </div>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Personal</SelectLabel>
          <SelectItem value="personal">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4" />
              <span>Personal Expense</span>
            </div>
          </SelectItem>
        </SelectGroup>

        {groups.length > 0 && (
          <SelectGroup>
            <SelectLabel className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Group Expenses
            </SelectLabel>
            {groups.map((group) => (
              <SelectItem key={group.id} value={group.id}>
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: group.color }}
                  />
                  <span className="text-base">{group.icon}</span>
                  <span>{group.name}</span>
                  <span className="text-xs text-muted-foreground">
                    ({group.memberCount} {group.memberCount === 1 ? "member" : "members"})
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  );
}

