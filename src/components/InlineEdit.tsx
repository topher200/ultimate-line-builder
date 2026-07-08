import { useState } from 'react';

/**
 * Tap-to-edit text. Shows the value as a button; tapping swaps in a text input
 * that commits on blur or Enter (a blank value is discarded).
 */
export function InlineEdit({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        className={`w-40 rounded bg-slate-700 px-2 py-1 ${className ?? ''}`}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          if (draft.trim()) onChange(draft.trim());
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setDraft(value);
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <button
      className={`underline decoration-dotted underline-offset-4 ${className ?? ''}`}
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
    >
      {value}
    </button>
  );
}
