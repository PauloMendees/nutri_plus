import Link from 'next/link';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

type CtaLinkProps = {
  href?: string;
  className?: string;
  size?: 'default' | 'lg' | 'sm';
  variant?: 'default' | 'outline' | 'secondary' | 'ghost';
  children?: React.ReactNode;
};

/**
 * Primary conversion CTA. Labels vary by section for rhythm,
 * but all keep the same goal: start the free 7-day trial via /signup.
 */
export function CtaLink({
  href = '/signup',
  className,
  size = 'lg',
  variant = 'default',
  children = 'Começar 7 dias grátis',
}: CtaLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        buttonVariants({ variant, size }),
        size === 'lg' && 'h-11 px-6 text-sm font-semibold',
        className,
      )}
    >
      {children}
    </Link>
  );
}
