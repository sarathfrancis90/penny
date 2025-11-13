"use client";

import { MessageSquare, Image, FileText, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface EmptyConversationProps {
  onUploadClick?: () => void;
  onDescribeClick?: () => void;
}

export function EmptyConversation({ onUploadClick, onDescribeClick }: EmptyConversationProps) {
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
      <div className="w-full max-w-2xl">
        <h3 className="text-sm font-semibold mb-3 text-center text-muted-foreground">
          Try asking me:
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {[
            "I spent $45 at Costco on groceries",
            "Upload a receipt from dinner last night",
            "Add $20 for Uber ride",
            "Coffee at Starbucks for $5.50",
          ].map((prompt, index) => (
            <div
              key={index}
              className="px-4 py-2 rounded-lg bg-muted/50 text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              <FileText className="h-3 w-3 inline mr-2" />
              {prompt}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

