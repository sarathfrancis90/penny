"use client";

import * as React from "react";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Expense, ExpenseSummary } from "@/lib/types";

export type ExportDataProps = {
  expenses: Expense[];
  categorySummaries: ExpenseSummary[];
  dateRange?: { from?: Date; to?: Date };
  selectedCategories: string[];
};

export function ExportData({
  expenses,
  categorySummaries,
  dateRange,
  selectedCategories,
}: ExportDataProps) {
  // Filter expenses based on date range and selected categories
  const filteredExpenses = React.useMemo(() => {
    return expenses.filter((expense) => {
      // Filter by date range
      if (dateRange?.from && expense.date.toDate() < dateRange.from) {
        return false;
      }
      if (dateRange?.to) {
        const endOfDay = new Date(dateRange.to);
        endOfDay.setHours(23, 59, 59, 999);
        if (expense.date.toDate() > endOfDay) {
          return false;
        }
      }

      // Filter by selected categories
      if (
        selectedCategories.length > 0 &&
        !selectedCategories.includes(expense.category)
      ) {
        return false;
      }

      return true;
    });
  }, [expenses, dateRange, selectedCategories]);

  // Format date range for file names
  const getDateRangeString = () => {
    if (!dateRange?.from && !dateRange?.to) {
      return "all-time";
    }
    
    const fromStr = dateRange.from 
      ? format(dateRange.from, "yyyy-MM-dd") 
      : "start";
      
    const toStr = dateRange.to 
      ? format(dateRange.to, "yyyy-MM-dd") 
      : "today";
      
    return `${fromStr}_to_${toStr}`;
  };

  // Export to Excel
  const exportToExcel = () => {
    // Prepare detailed expense data
    const expenseData = filteredExpenses.map((expense) => ({
      Date: format(expense.date.toDate(), "yyyy-MM-dd"),
      Vendor: expense.vendor,
      Category: expense.category,
      Amount: expense.amount.toFixed(2),
      Description: expense.description || "",
      Notes: expense.notes || "",
    }));

    // Prepare summary data
    const summaryData = categorySummaries
      .filter(
        (summary) =>
          selectedCategories.length === 0 ||
          selectedCategories.includes(summary.category)
      )
      .map((summary) => ({
        Category: summary.category,
        "Total Amount": summary.total.toFixed(2),
        "Number of Transactions": summary.count,
        "Percentage of Total": `${summary.percentage.toFixed(1)}%`,
      }));

    // Create a new workbook
    const wb = XLSX.utils.book_new();

    // Add detailed expenses worksheet
    const wsExpenses = XLSX.utils.json_to_sheet(expenseData);
    XLSX.utils.book_append_sheet(wb, wsExpenses, "Detailed Expenses");

    // Add summary worksheet
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, "Category Summary");

    // Generate filename with date range
    const fileName = `penny_expenses_${getDateRangeString()}.xlsx`;

    // Export to file
    XLSX.writeFile(wb, fileName);
  };

  // Export to PDF
  const exportToPDF = () => {
    // Create a new PDF document
    const doc = new jsPDF();
    const dateRangeStr = getDateRangeString();

    // Add title and date range
    doc.setFontSize(18);
    doc.text("Penny Expense Report", 14, 22);
    
    doc.setFontSize(12);
    doc.text(
      `Date Range: ${
        dateRange?.from
          ? format(dateRange.from, "MMM d, yyyy")
          : "All time"
      } to ${
        dateRange?.to ? format(dateRange.to, "MMM d, yyyy") : "Present"
      }`,
      14,
      30
    );

    // Add category filter info if applicable
    if (selectedCategories.length > 0) {
      doc.text(
        `Filtered by ${selectedCategories.length} categories`,
        14,
        38
      );
    }

    // Add summary table
    doc.setFontSize(14);
    doc.text("Expense Summary by Category", 14, 48);

    const summaryTableData = categorySummaries
      .filter(
        (summary) =>
          selectedCategories.length === 0 ||
          selectedCategories.includes(summary.category)
      )
      .map((summary) => [
        summary.category,
        `$${summary.total.toFixed(2)}`,
        summary.count.toString(),
        `${summary.percentage.toFixed(1)}%`,
      ]);

    autoTable(doc, {
      startY: 52,
      head: [["Category", "Total Amount", "# Transactions", "Percentage"]],
      body: summaryTableData,
      headStyles: { fillColor: [59, 130, 246] },
    });

    // Add detailed expenses table on a new page
    doc.addPage();
    doc.setFontSize(14);
    doc.text("Detailed Expenses", 14, 22);

    const expenseTableData = filteredExpenses.map((expense) => [
      format(expense.date.toDate(), "yyyy-MM-dd"),
      expense.vendor,
      expense.category,
      `$${expense.amount.toFixed(2)}`,
      expense.description || "",
    ]);

    autoTable(doc, {
      startY: 26,
      head: [["Date", "Vendor", "Category", "Amount", "Description"]],
      body: expenseTableData,
      headStyles: { fillColor: [59, 130, 246] },
    });

    // Save the PDF
    doc.save(`penny_expenses_${dateRangeStr}.pdf`);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <Download className="mr-2 h-4 w-4" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={exportToExcel}>
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          Export to Excel
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportToPDF}>
          <FileText className="mr-2 h-4 w-4" />
          Export to PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
