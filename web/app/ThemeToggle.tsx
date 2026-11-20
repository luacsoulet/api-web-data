"use client";

// Le libellé suit data-theme en CSS : pas d'état React, rien à resynchroniser.
export default function ThemeToggle() {
  function basculer() {
    const html = document.documentElement;
    const sombre = html.dataset.theme !== "dark";
    if (sombre) html.dataset.theme = "dark";
    else delete html.dataset.theme;
    try {
      localStorage.setItem("theme", sombre ? "dark" : "light");
    } catch {
      // stockage bloqué (navigation privée) : le choix vaut pour la page seulement
    }
  }

  return (
    <button type="button" className="theme" onClick={basculer}>
      <span className="theme-sombre">Mode sombre</span>
      <span className="theme-clair">Mode clair</span>
    </button>
  );
}
