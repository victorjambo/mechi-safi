import * as React from 'react';
import { cn } from '@/lib/utils';
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...props }, ref) => <select ref={ref} className={cn('h-10 w-full rounded-lg border border-input bg-white px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring', className)} {...props} />);
Select.displayName = 'Select';
