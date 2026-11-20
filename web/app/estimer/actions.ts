"use server";

import type { Collection, VentePoint } from "@/lib/api";

export type Estimation = {
  prix_estime: number;
  fourchette_basse: number;
  fourchette_haute: number;
  mae: number;
  mape: number;
  n_entrainement: number;
  n_test: number;
  comparables: { n: number; prix_median: number | null };
  comparables_ventes: Collection<VentePoint>;
  verdict: "au-dessus" | "dans la fourchette" | "au-dessous" | null;
  facteurs?: { facteur: string; valeur: string | number | null; impact_eur: number; impact_pct: number }[];
  marge_negociation?: { basse_eur: number; haute_eur: number; pct: number; explication: string };
  a_verifier?: { facteur: string; niveau: "info" | "vigilance" | "alerte"; texte: string }[];
};
export type Contexte = {
  alea_argile?: string | null;
  zone_inondable_scenario?: string | null;
  sensibilite_nappe?: string | null;
  bruit?: number | null;
  bruit_lden_max_db?: number | null;
  erreur?: string;
};
export type Etat = { resultat?: Estimation; budget?: number; erreur?: string };

const API_URL = process.env.API_URL ?? "http://127.0.0.1:8000";

export async function estimer(_: Etat, f: FormData): Promise<Etat> {
  const code = String(f.get("code_commune") ?? "");
  const surface = Number(f.get("surface"));
  const pieces = Number(f.get("pieces"));
  const type = f.get("type") === "Appartement" ? "Appartement" : "Maison";
  if (!code) return { erreur: "Choisissez une commune dans la liste." };
  if (!(surface >= 9 && surface <= 400)) return { erreur: "La surface doit être comprise entre 9 et 400 m² (bornes des données DVF retenues)." };
  if (!(pieces >= 1 && pieces <= 8)) return { erreur: "Le nombre de pièces doit être compris entre 1 et 8." };

  const q = new URLSearchParams({
    type,
    code_commune: code,
    surface: String(surface),
    pieces: String(pieces),
    jardin: String(f.get("jardin") === "on"),
    dependance: String(f.get("dependance") === "on"),
  });
  const annee = Number(f.get("annee_construction"));
  if (annee >= 1500 && annee <= 2026) q.set("annee_construction", String(annee));
  const dpe = String(f.get("dpe") ?? "");
  if (/^[A-G]$/.test(dpe)) q.set("dpe", dpe);
  const materiau = String(f.get("materiau_murs") ?? "").trim().slice(0, 40);
  if (materiau) q.set("materiau_murs", materiau);
  if (f.get("piscine") === "on") q.set("piscine", "true");
  const argile = String(f.get("alea_argile") ?? "");
  if (["faible", "moyen", "fort"].includes(argile)) q.set("alea_argile", argile);
  const inond = String(f.get("zone_inondable") ?? "");
  if (["frequent", "moyen", "extreme"].includes(inond)) q.set("zone_inondable", inond);
  const nappe = String(f.get("sensibilite_nappe") ?? "");
  if (["aucune", "inondation_cave", "debordement_nappe"].includes(nappe)) q.set("sensibilite_nappe", nappe);
  const bruit = String(f.get("bruit_db") ?? "");
  if (bruit !== "" && Number(bruit) >= 0 && Number(bruit) <= 120) q.set("bruit_db", bruit);
  const lon = String(f.get("longitude") ?? "");
  const lat = String(f.get("latitude") ?? "");
  if (lon !== "" && lat !== "" && Number.isFinite(Number(lon)) && Number.isFinite(Number(lat))) {
    q.set("longitude", lon);
    q.set("latitude", lat);
  }
  const prix = Number(f.get("prix_demande"));
  if (prix > 0) q.set("prix_demande", String(prix));

  try {
    const res = await fetch(`${API_URL}/estimation?${q}`, { cache: "no-store" });
    if (res.status === 404) return { erreur: "Commune inconnue : choisissez-en une dans la liste." };
    if (!res.ok) return { erreur: "Le service d'estimation a refusé la demande. Vérifiez les valeurs saisies." };
    return { resultat: (await res.json()) as Estimation, budget: prix > 0 ? prix : undefined };
  } catch {
    return { erreur: "Le service d'estimation est indisponible. Réessayez dans un instant." };
  }
}

/** Risques au point cliqué (GET /contexte), appelé depuis le navigateur via une action serveur. */
export async function contexte(lon: number, lat: number): Promise<Contexte> {
  if (!(lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90)) return { erreur: "Coordonnées invalides." };
  try {
    const res = await fetch(`${API_URL}/contexte?longitude=${lon}&latitude=${lat}`, { cache: "no-store" });
    if (!res.ok) return { erreur: "Impossible de lire les risques à cet endroit." };
    return (await res.json()) as Contexte;
  } catch {
    return { erreur: "Le service est indisponible. Réessayez dans un instant." };
  }
}
