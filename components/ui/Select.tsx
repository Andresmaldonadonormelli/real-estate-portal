import { ChevronDown } from 'lucide-react';
import type { ReactNode, SelectHTMLAttributes } from 'react';

export function Select({ label, className = '', children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label?: string; className?: string; children: ReactNode }) {
  return <label className={`ui-select ${className}`.trim()}>{label && <span>{label}</span>}<span className="ui-select-control product-select-control"><select {...props}>{children}</select><ChevronDown size={17} aria-hidden="true" /></span></label>;
}
