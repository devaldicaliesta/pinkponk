interface Option<T extends string | number> {
  value: T;
  label: string;
  disabled?: boolean;
}

interface Props<T extends string | number> {
  label: string;
  value: T;
  options: Option<T>[];
  onChange(v: T): void;
}

export const Chips = <T extends string | number>({ label, value, options, onChange }: Props<T>) => (
  <fieldset class="stack fieldset">
    <legend class="label">{label}</legend>
    <div class="chips">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          class="chip"
          aria-pressed={o.value === value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  </fieldset>
);
