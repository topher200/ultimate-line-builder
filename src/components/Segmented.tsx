export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={`flex overflow-hidden rounded ${className ?? ''}`}>
      {options.map((o) => (
        <button
          key={o.value}
          className={`px-4 py-2 font-semibold ${
            o.value === value ? 'bg-emerald-600' : 'bg-slate-700 text-slate-300'
          }`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
