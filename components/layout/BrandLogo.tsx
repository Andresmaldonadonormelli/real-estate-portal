type BrandLogoProps = {
  variant?: 'wordmark' | 'mark';
  className?: string;
  height?: number;
};

const WORDMARK_RATIO = 629 / 170;

export default function BrandLogo({ variant = 'wordmark', className = '', height }: BrandLogoProps) {
  if (variant === 'mark') {
    const size = height ?? 28;
    return (
      <span className={`brand-logo brand-logo-mark ${className}`.trim()} style={{ width: size, height: size }}>
        <img
          className="brand-logo-asset brand-logo-light"
          src="/brand-mark-light.png"
          alt=""
          width={size}
          height={size}
          style={{ width: size, height: size }}
          draggable={false}
        />
        <img
          className="brand-logo-asset brand-logo-dark"
          src="/brand-mark-dark.png"
          alt=""
          width={size}
          height={size}
          style={{ width: size, height: size }}
          draggable={false}
        />
      </span>
    );
  }

  const h = height ?? 22;
  const w = Math.round(h * WORDMARK_RATIO);
  return (
    <span className={`brand-logo brand-logo-wordmark ${className}`.trim()} style={{ width: w, height: h }}>
      <img
        className="brand-logo-asset brand-logo-light"
        src="/brand-logo-light.png"
        alt="AM Properties"
        width={w}
        height={h}
        style={{ width: w, height: h }}
        draggable={false}
      />
      <img
        className="brand-logo-asset brand-logo-dark"
        src="/brand-logo-dark.png"
        alt=""
        width={w}
        height={h}
        style={{ width: w, height: h }}
        draggable={false}
      />
    </span>
  );
}
