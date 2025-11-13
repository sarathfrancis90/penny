import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface MobilePageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  backLink?: string;
  rightAction?: ReactNode;
  className?: string;
}

export function MobilePageHeader({
  title,
  subtitle,
  icon,
  backLink,
  rightAction,
  className,
}: MobilePageHeaderProps) {
  return (
    <>
      {/* Mobile - Compact Sticky Header */}
      <div className={cn(
        "md:hidden sticky top-[57px] z-40 bg-background/95 backdrop-blur-sm border-b",
        className
      )}>
        <div className="flex items-center justify-between p-4 gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {backLink && (
              <Button variant="ghost" size="icon" className="shrink-0" asChild>
                <Link href={backLink}>
                  <ArrowLeft className="h-5 w-5" />
                </Link>
              </Button>
            )}
            {icon && (
              <div className="w-10 h-10 rounded-lg flex items-center justify-center text-2xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 shrink-0">
                {icon}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold truncate">{title}</h1>
              {subtitle && (
                <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
              )}
            </div>
          </div>
          
          {rightAction && (
            <div className="shrink-0">
              {rightAction}
            </div>
          )}
        </div>
      </div>

      {/* Desktop - Full Header */}
      <div className={cn("hidden md:block mb-8", className)}>
        <div className="flex items-start justify-between">
          <div className="flex gap-6">
            {backLink && (
              <Button variant="ghost" size="icon" asChild>
                <Link href={backLink}>
                  <ArrowLeft className="h-6 w-6" />
                </Link>
              </Button>
            )}
            {icon && (
              <div className="w-24 h-24 rounded-2xl flex items-center justify-center text-5xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 animate-in fade-in-50 zoom-in-95 duration-500">
                {icon}
              </div>
            )}
            <div>
              <h1 className="text-4xl font-bold mb-2 gradient-text">{title}</h1>
              {subtitle && (
                <p className="text-lg text-muted-foreground">{subtitle}</p>
              )}
            </div>
          </div>
          
          {rightAction && (
            <div className="flex gap-3">
              {rightAction}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

