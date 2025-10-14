"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { expenseCategories, categoryGroups } from "@/lib/categories";
import { Checkbox } from "@/components/ui/checkbox";

export type CategoryFilterProps = {
  selectedCategories: string[];
  onCategoriesChange: (categories: string[]) => void;
};

export function CategoryFilter({
  selectedCategories,
  onCategoriesChange,
}: CategoryFilterProps) {
  const [open, setOpen] = React.useState(false);

  // Group selection helpers
  const isGroupSelected = (group: string) => {
    const groupCategories = categoryGroups[group as keyof typeof categoryGroups];
    return groupCategories.every(category => 
      selectedCategories.includes(category)
    );
  };

  const isGroupIndeterminate = (group: string) => {
    const groupCategories = categoryGroups[group as keyof typeof categoryGroups];
    const selectedInGroup = groupCategories.filter(category => 
      selectedCategories.includes(category)
    );
    return selectedInGroup.length > 0 && selectedInGroup.length < groupCategories.length;
  };

  const toggleGroup = (group: string) => {
    const groupCategories = categoryGroups[group as keyof typeof categoryGroups];
    
    if (isGroupSelected(group)) {
      // Deselect all categories in this group
      onCategoriesChange(
        selectedCategories.filter(cat => !groupCategories.includes(cat as never))
      );
    } else {
      // Select all categories in this group
      const newSelected = [...selectedCategories];
      groupCategories.forEach(category => {
        if (!newSelected.includes(category)) {
          newSelected.push(category);
        }
      });
      onCategoriesChange(newSelected);
    }
  };

  const toggleCategory = (category: string) => {
    if (selectedCategories.includes(category)) {
      onCategoriesChange(selectedCategories.filter(c => c !== category));
    } else {
      onCategoriesChange([...selectedCategories, category]);
    }
  };

  // Select/deselect all categories
  const selectAll = () => {
    onCategoriesChange([...expenseCategories]);
  };

  const deselectAll = () => {
    onCategoriesChange([]);
  };

  return (
    <div className="flex flex-col gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full md:w-[280px] justify-between"
          >
            {selectedCategories.length === 0
              ? "All Categories"
              : selectedCategories.length === 1
              ? "1 Category Selected"
              : `${selectedCategories.length} Categories Selected`}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full md:w-[400px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search categories..." />
            <div className="flex items-center gap-2 p-2 border-b">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={selectAll}
                className="h-8 text-xs"
              >
                Select All
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={deselectAll}
                className="h-8 text-xs"
              >
                Deselect All
              </Button>
            </div>
            <CommandEmpty>No category found.</CommandEmpty>
            <CommandGroup className="max-h-[300px] overflow-auto">
              {Object.entries(categoryGroups).map(([group, categories]) => (
                <div key={group} className="border-b last:border-b-0">
                  <div className="flex items-center p-2 bg-muted/50">
                    <Checkbox
                      checked={isGroupSelected(group)}
                      indeterminate={isGroupIndeterminate(group)}
                      onCheckedChange={() => toggleGroup(group)}
                      id={`group-${group}`}
                      className="mr-2 data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground"
                    />
                    <label
                      htmlFor={`group-${group}`}
                      className="text-sm font-medium flex-1 cursor-pointer"
                    >
                      {group}
                    </label>
                  </div>
                  <div className="pl-6">
                    {categories.map((category) => (
                      <CommandItem
                        key={category}
                        value={category}
                        onSelect={() => toggleCategory(category)}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <Checkbox
                          checked={selectedCategories.includes(category)}
                          onCheckedChange={() => toggleCategory(category)}
                          id={`category-${category}`}
                          className="mr-2"
                        />
                        <span>{category}</span>
                        {selectedCategories.includes(category) && (
                          <Check className="ml-auto h-4 w-4" />
                        )}
                      </CommandItem>
                    ))}
                  </div>
                </div>
              ))}
            </CommandGroup>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
