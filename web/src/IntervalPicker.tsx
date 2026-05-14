export interface IntervalOption {
  label: string;
  ms:    number;
}

export const INTERVAL_OPTIONS: readonly IntervalOption[] = [
  { label: '1s',  ms:        1_000 },
  { label: '5s',  ms:        5_000 },
  { label: '15s', ms:       15_000 },
  { label: '1m',  ms:       60_000 },
  { label: '5m',  ms:      300_000 },
];

interface Props {
  value:    number;
  onChange: (ms: number) => void;
}

export function IntervalPicker({ value, onChange }: Props) {
  return (
    <div className="interval-picker" role="tablist" aria-label="Candle interval">
      {INTERVAL_OPTIONS.map((opt) => (
        <button
          key={opt.ms}
          role="tab"
          aria-selected={value === opt.ms}
          className={value === opt.ms ? 'active' : ''}
          onClick={() => onChange(opt.ms)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
