type Props<Value extends string> = {
  values: readonly Value[];
  value: Value;
  label: (value: Value) => string;
  onChange: (value: Value) => void;
};

/** A row of toggle chips that picks one value. */
export function ChoiceChips<Value extends string>({
  values,
  value,
  label,
  onChange,
}: Props<Value>) {
  return (
    <div className="options">
      {values.map((option) => (
        <button
          key={option}
          className="chip"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
        >
          {label(option)}
        </button>
      ))}
    </div>
  );
}
