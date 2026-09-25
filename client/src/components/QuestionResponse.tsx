import { mediaUrl } from "../api";
import { isNumericType } from "../questionTypes";

const LABELS = ["A", "B", "C", "D"];

export function QuestionChoices({
  options,
  optionImageUrls,
  selected,
  onSelect,
  disabled,
}: {
  options: string[];
  optionImageUrls?: (string | null)[];
  selected?: number;
  onSelect: (index: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="mt-4 space-y-2">
      {options.map((opt, i) => {
        const imageUrl = optionImageUrls?.[i];
        return (
        <button
          key={i}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(i)}
          className={`w-full text-left rounded-xl border px-4 py-3 text-sm min-h-[48px] transition ${
            selected === i
              ? "border-brand-600 bg-brand-50 text-brand-900 ring-2 ring-brand-500"
              : "border-slate-200 bg-white hover:border-brand-300"
          } disabled:opacity-60`}
        >
          <span className="font-semibold text-brand-700 mr-2">{LABELS[i] ?? i + 1}.</span>
          {opt}
          {imageUrl ? (
            <img
              src={mediaUrl(imageUrl)}
              alt=""
              className="mt-2 max-h-40 w-full object-contain rounded-lg border border-slate-100 bg-white"
            />
          ) : null}
        </button>
        );
      })}
    </div>
  );
}

export function NumericAnswerInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="mt-4 block">
      <span className="text-sm font-medium text-slate-700">Your answer (number)</span>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-base"
        placeholder="Type a number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export function QuestionResponse({
  type,
  options,
  optionImageUrls,
  selectedOption,
  numericRaw,
  onSelect,
  onNumeric,
  disabled,
}: {
  type?: string;
  options: string[];
  optionImageUrls?: (string | null)[];
  selectedOption?: number;
  numericRaw?: string;
  onSelect: (index: number) => void;
  onNumeric: (raw: string) => void;
  disabled?: boolean;
}) {
  if (isNumericType(type)) {
    return <NumericAnswerInput value={numericRaw ?? ""} onChange={onNumeric} disabled={disabled} />;
  }
  return (
    <QuestionChoices
      options={options}
      optionImageUrls={optionImageUrls}
      selected={selectedOption}
      onSelect={onSelect}
      disabled={disabled}
    />
  );
}
