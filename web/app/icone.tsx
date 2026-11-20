'use client';

type TypeBien = "Maison" | "Appartement" | "Tous";

export function IconeTypeBien({ type }: { type: TypeBien }) {
  const svg = {
    Maison: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <polyline points="3 9 12 2 21 9" />
        <path d="M21 9v9h-6l-3-3-3 3H3V9z" />
      </svg>
    ),
    Appartement: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <line x1="6" y1="6" x2="6.01" y2="6" />
        <line x1="6" y1="12" x2="6.01" y2="12" />
        <line x1="6" y1="18" x2="6.01" y2="18" />
        <line x1="12" y1="6" x2="12.01" y2="6" />
        <line x1="12" y1="12" x2="12.01" y2="12" />
        <line x1="12" y1="18" x2="12.01" y2="18" />
        <line x1="18" y1="6" x2="18.01" y2="6" />
        <line x1="18" y1="12" x2="18.01" y2="12" />
        <line x1="18" y1="18" x2="18.01" y2="18" />
      </svg>
    ),
    Tous: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M7 7l10 10" />
      </svg>
    ),
  };

  return <span className="icone-badge">{svg[type]}</span>;
}
