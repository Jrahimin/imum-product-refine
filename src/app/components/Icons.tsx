import type { ReactNode } from "react";

/** 18px stroke icon used by the process flow and hero stats. */
export function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function IconDetect() {
  return (
    <Icon>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </Icon>
  );
}

export function IconContext() {
  return (
    <Icon>
      <rect x="4" y="5" width="16" height="4" rx="1" />
      <rect x="4" y="11" width="16" height="4" rx="1" />
      <rect x="4" y="17" width="10" height="3" rx="1" />
    </Icon>
  );
}

export function IconSeparate() {
  return (
    <Icon>
      <path d="M8 5v14" />
      <path d="M16 5v14" />
      <path d="M4 9h4" />
      <path d="M16 15h4" />
    </Icon>
  );
}

export function IconValidate() {
  return (
    <Icon>
      <path d="M12 3l8 4v6c0 5-3.5 7.5-8 8-4.5-.5-8-3-8-8V7l8-4z" />
      <path d="M9 12l2 2 4-4" />
    </Icon>
  );
}

export function IconDerive() {
  return (
    <Icon>
      <rect x="5" y="4" width="14" height="16" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h4" />
    </Icon>
  );
}

export function IconPreserve() {
  return (
    <Icon>
      <path d="M6 8V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" />
      <rect x="5" y="8" width="14" height="12" rx="2" />
      <path d="M9 13h6" />
    </Icon>
  );
}

export function IconCheck() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.5 2.5L16 9.5" />
    </Icon>
  );
}

export function IconInfo() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </Icon>
  );
}

export function IconQuestion() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.4 2.3c-.7.4-1.4.9-1.4 1.7V14" />
      <path d="M12 17h.01" />
    </Icon>
  );
}

export function IconClose() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </Icon>
  );
}

export function IconRows() {
  return (
    <Icon>
      <path d="M5 7h14M5 12h14M5 17h10" />
    </Icon>
  );
}

export function IconSources() {
  return (
    <Icon>
      <rect x="4" y="5" width="7" height="7" rx="1" />
      <rect x="13" y="5" width="7" height="7" rx="1" />
      <rect x="4" y="14" width="7" height="5" rx="1" />
      <rect x="13" y="14" width="7" height="5" rx="1" />
    </Icon>
  );
}

export function IconPreserveRows() {
  return (
    <Icon>
      <path d="M7 4h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
      <path d="M14 4v5h5" />
    </Icon>
  );
}
