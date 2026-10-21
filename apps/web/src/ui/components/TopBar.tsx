import type { ComponentChildren } from "preact";
import { useT } from "../../i18n";

export const TopBar = ({
  onBack,
  children,
}: {
  onBack?: () => void;
  children?: ComponentChildren;
}) => {
  const t = useT();
  return (
    <div class="topbar">
      {onBack && (
        <button type="button" class="btn btn--icon" aria-label={t("app.back")} onClick={onBack}>
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            aria-hidden="true"
          >
            <path d="M15 5l-7 7 7 7" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      )}
      <div class="spacer" />
      {children}
    </div>
  );
};
