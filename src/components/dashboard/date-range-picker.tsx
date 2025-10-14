"use client";

import * as React from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { DateRange } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type DateRangePickerProps = {
  dateRange: DateRange | undefined;
  onDateRangeChange: (range: DateRange | undefined) => void;
};

export function DateRangePicker({
  dateRange,
  onDateRangeChange,
}: DateRangePickerProps) {
  const [isCalendarOpen, setIsCalendarOpen] = React.useState(false);

  // Predefined date ranges
  const handlePredefinedRange = (value: string) => {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    
    let from: Date | undefined;
    let to: Date | undefined;
    
    switch (value) {
      case "today":
        from = new Date();
        to = new Date();
        break;
      case "yesterday": {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        from = yesterday;
        to = yesterday;
        break;
      }
      case "last7days": {
        from = new Date();
        from.setDate(from.getDate() - 6);
        to = new Date();
        break;
      }
      case "last30days": {
        from = new Date();
        from.setDate(from.getDate() - 29);
        to = new Date();
        break;
      }
      case "thisMonth": {
        from = new Date(currentYear, currentMonth, 1);
        to = new Date();
        break;
      }
      case "lastMonth": {
        from = new Date(currentYear, currentMonth - 1, 1);
        to = new Date(currentYear, currentMonth, 0);
        break;
      }
      case "thisQuarter": {
        const quarterMonth = Math.floor(currentMonth / 3) * 3;
        from = new Date(currentYear, quarterMonth, 1);
        to = new Date();
        break;
      }
      case "lastQuarter": {
        const quarterMonth = Math.floor(currentMonth / 3) * 3;
        if (quarterMonth === 0) {
          from = new Date(currentYear - 1, 9, 1);
          to = new Date(currentYear - 1, 11, 31);
        } else {
          from = new Date(currentYear, quarterMonth - 3, 1);
          to = new Date(currentYear, quarterMonth, 0);
        }
        break;
      }
      case "thisYear": {
        from = new Date(currentYear, 0, 1);
        to = new Date();
        break;
      }
      case "lastYear": {
        from = new Date(currentYear - 1, 0, 1);
        to = new Date(currentYear - 1, 11, 31);
        break;
      }
      case "all":
        from = undefined;
        to = undefined;
        break;
      default:
        return;
    }

    onDateRangeChange({ from, to });
  };

  const formatDisplayText = () => {
    if (!dateRange?.from) {
      return "All Time";
    }

    if (dateRange.from && !dateRange.to) {
      return `From ${format(dateRange.from, "MMM d, yyyy")}`;
    }

    if (dateRange.from && dateRange.to && 
        dateRange.from.toDateString() === dateRange.to.toDateString()) {
      return format(dateRange.from, "MMM d, yyyy");
    }

    return `${format(dateRange.from, "MMM d, yyyy")} - ${
      dateRange.to ? format(dateRange.to, "MMM d, yyyy") : ""
    }`;
  };

  return (
    <div className="flex flex-col md:flex-row gap-2 items-start md:items-center">
      <Select onValueChange={handlePredefinedRange}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Select period" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="today">Today</SelectItem>
          <SelectItem value="yesterday">Yesterday</SelectItem>
          <SelectItem value="last7days">Last 7 days</SelectItem>
          <SelectItem value="last30days">Last 30 days</SelectItem>
          <SelectItem value="thisMonth">This month</SelectItem>
          <SelectItem value="lastMonth">Last month</SelectItem>
          <SelectItem value="thisQuarter">This quarter</SelectItem>
          <SelectItem value="lastQuarter">Last quarter</SelectItem>
          <SelectItem value="thisYear">This year</SelectItem>
          <SelectItem value="lastYear">Last year</SelectItem>
          <SelectItem value="all">All time</SelectItem>
        </SelectContent>
      </Select>

      <div className="grid gap-2">
        <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
          <PopoverTrigger asChild>
            <Button
              id="date"
              variant={"outline"}
              className={cn(
                "w-[240px] justify-start text-left font-normal",
                !dateRange && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {formatDisplayText()}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              initialFocus
              mode="range"
              defaultMonth={dateRange?.from}
              selected={dateRange}
              onSelect={(range) => {
                onDateRangeChange(range);
                if (range?.to) {
                  setIsCalendarOpen(false);
                }
              }}
              numberOfMonths={2}
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
