import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-sm font-bold [&_svg]:size-4', {
  variants: {
    tone: {
      neutral: 'bg-surface-2 text-ink-2',
      info: 'bg-ballpoint-soft text-ballpoint',
      good: 'bg-good-soft text-good',
      warn: 'bg-warn-soft text-warn',
      danger: 'bg-redpen-soft text-redpen',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
