"use client";

import { MessageSquare, Image, FileText, Sparkles, TrendingUp, PiggyBank, Search, BarChart3 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface EmptyConversationProps {
  onUploadClick?: () => void;
  onDescribeClick?: () => void;
  onQueryClick?: (query: string) => void;
}

export function EmptyConversation({ onUploadClick, onDescribeClick, onQueryClick }: EmptyConversationProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-4 py-12">
      {/* Welcome Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 mb-4">
          <Sparkles className="h-8 w-8 text-white" />
        </div>
        <h1 className="text-2xl md:text-3xl font-bold gradient-text mb-2">
          Welcome to Penny AI
        </h1>
        <p className="text-muted-foreground text-sm md:text-base max-w-md">
          Your smart expense tracking assistant. Upload receipts or describe your expenses,
          and I&apos;ll help you track them effortlessly.
        </p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-3xl mb-8">
        <Card
          className="glass border-2 border-violet-200/50 dark:border-violet-800/30 cursor-pointer hover:border-violet-400 dark:hover:border-violet-600 transition-all hover:shadow-lg"
          onClick={onUploadClick}
        >
          <CardContent className="p-6 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-violet-100 dark:bg-violet-900 mb-3" role="img" aria-label="Upload receipt">
              <Image className="h-6 w-6 text-violet-600 dark:text-violet-400" />
            </div>
            <h3 className="font-semibold mb-1">Upload Receipt</h3>
            <p className="text-xs text-muted-foreground">
              Take a photo or upload an image
            </p>
          </CardContent>
        </Card>

        <Card
          className="glass border-2 border-violet-200/50 dark:border-violet-800/30 cursor-pointer hover:border-violet-400 dark:hover:border-violet-600 transition-all hover:shadow-lg"
          onClick={onDescribeClick}
        >
          <CardContent className="p-6 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-violet-100 dark:bg-violet-900 mb-3">
              <MessageSquare className="h-6 w-6 text-violet-600 dark:text-violet-400" />
            </div>
            <h3 className="font-semibold mb-1">Describe Expense</h3>
            <p className="text-xs text-muted-foreground">
              Type in your expense details
            </p>
          </CardContent>
        </Card>

        <Card className="glass border-2 border-violet-200/50 dark:border-violet-800/30">
          <CardContent className="p-6 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-violet-100 dark:bg-violet-900 mb-3">
              <Sparkles className="h-6 w-6 text-violet-600 dark:text-violet-400" />
            </div>
            <h3 className="font-semibold mb-1">AI Analysis</h3>
            <p className="text-xs text-muted-foreground">
              Smart categorization & insights
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Example Prompts */}
      <div className="w-full max-w-4xl space-y-6">
        {/* Create Expenses */}
        <div>
          <h3 className="text-sm font-semibold mb-3 text-center text-muted-foreground flex items-center justify-center gap-2">
            <FileText className="h-4 w-4" />
            Create Expenses:
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {[
              "I spent $45 at Costco on groceries",
              "$30 at Starbucks in office group",
              "Paid $120 for gas yesterday",
              "Coffee for $5.50 this morning",
            ].map((prompt, index) => (
              <div
                key={index}
                className="px-4 py-2 rounded-lg bg-muted/50 text-sm text-muted-foreground hover:bg-muted transition-colors"
              >
                <Sparkles className="h-3 w-3 inline mr-2 text-violet-500" />
                {prompt}
              </div>
            ))}
          </div>
        </div>

        {/* Ask Questions */}
        <div>
          <h3 className="text-sm font-semibold mb-3 text-center text-muted-foreground flex items-center justify-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Ask Questions:
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              {
                icon: TrendingUp,
                query: "How much have I spent this month?",
                color: "text-blue-500",
              },
              {
                icon: PiggyBank,
                query: "Am I within budget for dining out?",
                color: "text-green-500",
              },
              {
                icon: BarChart3,
                query: "What are my top spending categories?",
                color: "text-purple-500",
              },
              {
                icon: Search,
                query: "Show my recent expenses",
                color: "text-amber-500",
              },
            ].map((item, index) => (
              <Button
                key={index}
                variant="outline"
                className="h-auto py-3 px-4 justify-start text-left hover:border-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-all group"
                onClick={() => onQueryClick?.(item.query)}
              >
                <item.icon className={`h-4 w-4 mr-2 flex-shrink-0 ${item.color} group-hover:scale-110 transition-transform`} />
                <span className="text-sm">{item.query}</span>
              </Button>
            ))}
          </div>
        </div>

        {/* Additional Queries */}
        <div className="pt-2">
          <div className="flex flex-wrap gap-2 justify-center">
            {[
              "Compare this month to last month",
              "Find expenses over $100",
              "Show family group expenses",
            ].map((query, index) => (
              <Button
                key={index}
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-950/30"
                onClick={() => onQueryClick?.(query)}
              >
                {query}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

