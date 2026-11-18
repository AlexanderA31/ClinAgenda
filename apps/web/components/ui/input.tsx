import * as React from 'react';
import { cn } from '@/lib/utils';

const base =
  'w-full min-h-12 rounded-md border-2 border-rule-strong bg-surface px-3 text-base text-ink placeholder:text-ink-3 focus:border-ballpoint focus:outline-none aria-[invalid=true]:border-redpen aria-[invalid=true]:bg-redpen-soft/40 disabled:opacity-60';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(base, className)} {...props} />
));
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(base, 'min-h-24 py-2', className)} {...props} />
));
Textarea.displayName = 'Textarea';

/** Select nativo: en celular abre el selector del sistema, que todos saben usar. */
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...props }, ref) => (
  <select ref={ref} className={cn(base, 'pr-8', className)} {...props} />
));
Select.displayName = 'Select';
