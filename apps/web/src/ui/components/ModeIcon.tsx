// Ikon mode digambar sebagai SVG sederhana bergaya garis tebal (tanpa emoji).
export type ModeIconName = "ai" | "local" | "online" | "timing" | "gamble";

export const ModeIcon = ({ name }: { name: ModeIconName }) => (
  <svg class="mode-card__icon" viewBox="0 0 64 64" aria-hidden="true">
    <rect
      x="2"
      y="2"
      width="60"
      height="60"
      rx="16"
      fill="var(--bg)"
      stroke="var(--border)"
      stroke-width="2"
    />
    {name === "ai" && (
      <g fill="none" stroke="var(--pink)" stroke-width="4" stroke-linecap="round">
        <rect x="16" y="20" width="32" height="24" rx="8" />
        <circle cx="26" cy="32" r="2" fill="var(--pink)" />
        <circle cx="38" cy="32" r="2" fill="var(--pink)" />
        <path d="M32 20v-6" />
      </g>
    )}
    {name === "local" && (
      <g fill="none" stroke="var(--pink)" stroke-width="4" stroke-linecap="round">
        <circle cx="22" cy="26" r="7" />
        <circle cx="42" cy="26" r="7" stroke="var(--cyan)" />
        <path d="M12 48c2-8 18-8 20 0M32 48c2-8 18-8 20 0" />
      </g>
    )}
    {name === "online" && (
      <g fill="none" stroke="var(--pink)" stroke-width="4" stroke-linecap="round">
        <circle cx="32" cy="32" r="16" />
        <path d="M16 32h32M32 16c-8 9-8 23 0 32M32 16c8 9 8 23 0 32" />
      </g>
    )}
    {name === "gamble" && (
      <g fill="none" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
        <rect x="16" y="16" width="32" height="32" rx="8" stroke="var(--pink)" />
        <circle cx="25" cy="25" r="2.5" fill="var(--lime-text)" stroke="none" />
        <circle cx="39" cy="39" r="2.5" fill="var(--lime-text)" stroke="none" />
        <circle cx="32" cy="32" r="2.5" fill="var(--pink)" stroke="none" />
        <circle cx="39" cy="25" r="2.5" fill="var(--cyan)" stroke="none" />
        <circle cx="25" cy="39" r="2.5" fill="var(--cyan)" stroke="none" />
      </g>
    )}
    {name === "timing" && (
      <g fill="none" stroke-width="4" stroke-linecap="round">
        <circle cx="32" cy="32" r="18" stroke="var(--lime-text)" />
        <circle cx="32" cy="32" r="8" stroke="var(--pink)" />
        <circle cx="32" cy="32" r="3" fill="var(--pink)" stroke="none" />
      </g>
    )}
  </svg>
);
