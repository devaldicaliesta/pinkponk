interface Props {
  label: string;
  checked: boolean;
  onChange(v: boolean): void;
}

export const Switch = ({ label, checked, onChange }: Props) => (
  <label class="switch">
    <span>{label}</span>
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange((e.currentTarget as HTMLInputElement).checked)}
    />
  </label>
);
