function modeLabel(mode: number): string {
  if (mode < 0.25) return 'Competitive';
  if (mode < 0.4) return 'Mostly competitive';
  if (mode <= 0.6) return 'Equal time';
  if (mode < 0.75) return 'Mostly resting';
  return 'Resting';
}

/**
 * Game-competitiveness control. Internally mode 0 = competitive and 1 = resting,
 * but the slider is drawn as a competitiveness percentage (100% = go all out),
 * so the displayed position is inverted.
 */
export function ModeSlider({
  value,
  onChange,
  className,
}: {
  value: number;
  onChange: (mode: number) => void;
  className?: string;
}) {
  const competitiveness = Math.round((1 - value) * 100);
  return (
    <div className={`flex flex-col gap-1 ${className ?? ''}`}>
      <span className="text-sm font-semibold">
        Competitiveness {competitiveness}%{' '}
        <span className="font-normal text-slate-400">({modeLabel(value)})</span>
      </span>
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500">Resting</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round((1 - value) * 100)}
          className="flex-1"
          onChange={(e) => onChange(1 - Number(e.target.value) / 100)}
        />
        <span className="text-xs text-slate-500">Competitive</span>
      </div>
    </div>
  );
}
