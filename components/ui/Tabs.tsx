export type TabOption<T extends string> = { value: T; label: string };

type TabProps<T extends string> = { value: T; options: readonly TabOption<T>[]; onChange: (value: T) => void; label: string; className?: string };

export function SegmentedTabs<T extends string>({ value, options, onChange, label, className = '' }: TabProps<T>) {
  return <div className={`ui-tabs ui-tabs--segmented ${className}`.trim()} role="tablist" aria-label={label}>{options.map(option => <button type="button" role="tab" aria-selected={value === option.value} key={option.value} className={value === option.value ? 'active' : ''} onClick={() => onChange(option.value)}>{option.label}</button>)}</div>;
}

export function UnderlineTabs<T extends string>({ value, options, onChange, label, className = '', primary = false }: TabProps<T> & { primary?: boolean }) {
  return <nav className={`ui-tabs ui-tabs--underline ${primary ? 'ui-tabs--primary' : ''} ${className}`.trim()} role="tablist" aria-label={label}>{options.map(option => <button type="button" role="tab" aria-selected={value === option.value} key={option.value} className={value === option.value ? 'active' : ''} onClick={() => onChange(option.value)}>{option.label}</button>)}</nav>;
}
