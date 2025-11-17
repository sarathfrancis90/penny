import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { forwardRef, ComponentPropsWithoutRef } from 'react';

export interface GradientButtonProps extends Omit<ComponentPropsWithoutRef<typeof Button>, 'variant'> {
  variant?: 'primary' | 'secondary' | 'success' | 'danger';
}

const gradientClasses = {
  primary: 'bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 text-white border-0',
  secondary: 'bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white border-0',
  success: 'bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white border-0',
  danger: 'bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-600 hover:to-rose-600 text-white border-0',
};

export const GradientButton = forwardRef<HTMLButtonElement, GradientButtonProps>(
  ({ className, variant = 'primary', ...props }, ref) => {
    return (
      <Button
        ref={ref}
        className={cn(gradientClasses[variant], className)}
        {...props}
      />
    );
  }
);

GradientButton.displayName = 'GradientButton';

