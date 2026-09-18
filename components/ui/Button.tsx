import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'destructive' | 'quiet';
type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; children: ReactNode };

export function Button({ variant = 'primary', className = '', type = 'button', children, ...props }: Props) {
  return <button type={type} className={`ui-button ui-button--${variant} ${className}`.trim()} {...props}>{children}</button>;
}

export function ButtonLink({ variant = 'secondary', className = '', children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: Exclude<Variant, 'quiet'>; children: ReactNode }) {
  return <a className={`ui-button ui-button--${variant} ${className}`.trim()} {...props}>{children}</a>;
}
