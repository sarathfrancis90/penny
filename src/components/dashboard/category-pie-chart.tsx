"use client";

import React from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import { ExpenseSummary } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

// Color palette for the chart (same as in dashboard)
const COLORS = [
  "#3b82f6", // blue
  "#10b981", // green
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ef4444", // red
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#84cc16", // lime
  "#f97316", // orange
  "#a855f7", // purple
];

interface CategoryPieChartProps {
  categorySummaries: ExpenseSummary[];
}

export function CategoryPieChart({ categorySummaries }: CategoryPieChartProps) {
  // Prepare data for pie chart (top 8 categories + "Others")
  const pieData = React.useMemo(() => {
    if (categorySummaries.length <= 8) {
      return categorySummaries.map(summary => ({
        name: summary.category,
        value: summary.total,
        percentage: summary.percentage,
      }));
    }

    // Take top 7 categories
    const topCategories = categorySummaries.slice(0, 7).map(summary => ({
      name: summary.category,
      value: summary.total,
      percentage: summary.percentage,
    }));

    // Combine the rest into "Others"
    const otherCategories = categorySummaries.slice(7);
    const otherTotal = otherCategories.reduce((sum, cat) => sum + cat.total, 0);
    const otherPercentage = otherCategories.reduce((sum, cat) => sum + cat.percentage, 0);

    return [
      ...topCategories,
      {
        name: "Others",
        value: otherTotal,
        percentage: otherPercentage,
      },
    ];
  }, [categorySummaries]);

  const renderCustomizedLabel = ({
    cx,
    cy,
    midAngle,
    innerRadius,
    outerRadius,
    percent,
  }: any) => {
    if (percent < 0.05) return null; // Don't show labels for small slices
    
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.6;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text
        x={x}
        y={y}
        fill="white"
        textAnchor="middle"
        dominantBaseline="central"
        className="text-xs font-medium"
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border rounded-md shadow-md p-3">
          <p className="font-medium">{payload[0].name}</p>
          <p className="text-sm">${payload[0].value.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground">
            {payload[0].payload.percentage.toFixed(1)}% of total
          </p>
        </div>
      );
    }

    return null;
  };

  if (categorySummaries.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Expense Distribution</CardTitle>
        <CardDescription>
          Breakdown of expenses by category
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[350px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={renderCustomizedLabel}
                outerRadius={130}
                fill="#8884d8"
                dataKey="value"
                animationDuration={750}
                animationBegin={0}
              >
                {pieData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={COLORS[index % COLORS.length]} 
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                layout="horizontal" 
                verticalAlign="bottom" 
                align="center" 
                wrapperStyle={{ paddingTop: "20px" }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
