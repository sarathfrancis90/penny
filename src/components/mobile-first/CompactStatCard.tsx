import { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface CompactStatCardProps {
  icon: ReactNode;
  label: string;
  value: string | number;
  className?: string;
}

export function CompactStatCard({ icon, label, value, className }: CompactStatCardProps) {
  return (
    <>
      {/* Mobile - Horizontal Compact Layout */}
      <div className={cn(
        "md:hidden flex items-center gap-3 px-4 py-3 rounded-xl glass border border-border/50 hover:border-primary/50 transition-all",
        className
      )}>
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold gradient-text">{value}</p>
        </div>
      </div>
      
      {/* Desktop - Full Card Layout */}
      <Card className={cn("hidden md:block glass border-2 border-border/50 hover:border-primary/50 transition-all", className)}>
        <CardHeader className="pb-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 flex items-center justify-center mb-2">
            {icon}
          </div>
          <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">{label}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-4xl font-bold gradient-text">{value}</p>
        </CardContent>
      </Card>
    </>
  );
}

