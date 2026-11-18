import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// Botones de al menos 48 px de alto: fáciles de tocar en celular y de acertar con el mouse.
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-bold transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-5 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-ballpoint text-ballpoint-ink hover:brightness-110 active:brightness-95',
        secondary: 'border-2 border-rule-strong bg-surface text-ink hover:border-ballpoint hover:text-ballpoint',
        ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
        danger: 'bg-redpen text-white hover:brightness-110 dark:text-[#2a0d0b]',
        link: 'text-ballpoint underline underline-offset-4 hover:no-underline px-0',
      },
      size: {
        md: 'min-h-12 px-5 text-base',
        sm: 'min-h-10 px-3 text-sm',
        lg: 'min-h-14 px-7 text-lg',
        icon: 'size-12',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
Button.displayName = 'Button';

export { buttonVariants };
