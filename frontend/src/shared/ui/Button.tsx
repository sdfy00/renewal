import { type ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'success' | 'danger' | 'warning' | 'ghost' | 'accent' | 'solid' | 'square';

const styles: Record<Variant, string> = {
  accent:  'bg-accent text-bg hover:bg-accent/90 rounded-lg',
  solid:   'bg-text text-bg hover:bg-white rounded-full',
  square:  'bg-text text-bg hover:bg-white',
  primary: 'bg-card border border-secondary/30 text-text hover:border-accent/60 rounded-lg',
  success: 'bg-success/10 text-success border border-success/30 hover:bg-success/20 rounded-lg',
  danger:  'bg-danger/10 text-danger border border-danger/30 hover:bg-danger/20 rounded-lg',
  warning: 'bg-warning/10 text-warning border border-warning/30 hover:bg-warning/20 rounded-lg',
  ghost:   'text-secondary hover:text-text rounded-lg',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md';
}

export default function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...rest
}: Props) {
  const sz = size === 'sm' ? 'px-3 py-1 text-xs' : 'px-4 py-2 text-sm';
  return (
    <button
      className={`inline-flex items-center justify-center font-medium transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 ${sz} ${styles[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
