import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  backHref?: string;
  action?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  backHref,
  action,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn(
      "flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4",
      className
    )}>
      <div className="flex items-center gap-4">
        {backHref && (
          <Button variant="ghost" size="icon" asChild>
            <Link href={backHref}>
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
        )}
        <div>
          <h1 className="text-3xl font-bold gradient-text">{title}</h1>
          {subtitle && (
            <p className="text-muted-foreground mt-1">{subtitle}</p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

