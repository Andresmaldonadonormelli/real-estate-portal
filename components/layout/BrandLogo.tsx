type BrandLogoProps = {
  variant?: 'wordmark' | 'mark';
  className?: string;
  height?: number;
};

export default function BrandLogo({ variant = 'wordmark', className = '', height }: BrandLogoProps) {
  if (variant === 'mark') {
    const size = height ?? 28;
    return (
      <span className={`brand-logo brand-logo-mark ${className}`.trim()} aria-hidden="true">
        <img className="brand-logo-light" src="/brand-mark-light.png" alt="" width={size} height={size} draggable={false} />
        <img className="brand-logo-dark" src="/brand-mark-dark.png" alt="" width={size} height={size} draggable={false} />
      </span>
    );
  }

  const h = height ?? 28;
  const w = Math.round((629 / 170) * h);
  return (
    <span className={`brand-logo brand-logo-wordmark ${className}`.trim()}>
      <img className="brand-logo-light" src="/brand-logo-light.png" alt="AM Properties" width={w} height={h} draggable={false} />
      <img className="brand-logo-dark" src="/brand-logo-dark.png" alt="" width={w} height={h} draggable={false} />
    </span>
  );
}
