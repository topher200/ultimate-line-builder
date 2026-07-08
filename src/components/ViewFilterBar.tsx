import { Segmented } from './Segmented.tsx';
import type { GenderView, LineView } from './viewFilter.ts';

export function ViewFilterBar({
  gender,
  line,
  onGender,
  onLine,
  shown,
  total,
}: {
  gender: GenderView;
  line: LineView;
  onGender: (v: GenderView) => void;
  onLine: (v: LineView) => void;
  shown?: number;
  total?: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-800 p-3">
      <span className="text-sm font-semibold text-slate-400">View</span>
      <Segmented
        options={[
          { value: 'ALL', label: 'All' },
          { value: 'MMP', label: 'MMP' },
          { value: 'WMP', label: 'WMP' },
        ]}
        value={gender}
        onChange={onGender}
      />
      <Segmented
        options={[
          { value: 'ALL', label: 'All' },
          { value: 'O', label: 'O line' },
          { value: 'D', label: 'D line' },
        ]}
        value={line}
        onChange={onLine}
      />
      {shown !== undefined && total !== undefined && (
        <span className="text-sm text-slate-500">
          {shown} of {total}
        </span>
      )}
    </div>
  );
}
