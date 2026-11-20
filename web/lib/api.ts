export const TYPES = ["Maison", "Appartement", "Tous"] as const;
export type TypeBien = (typeof TYPES)[number];
export const ANNEES = [2021, 2022, 2023, 2024, 2025] as const;

export type Kpis = {
  n_ventes: number;
  prix_m2_median: number | null;
  valeur_median: number | null;
  n_communes: number;
};
export type Commune = {
  code_commune: string;
  nom_commune: string;
  n: number;
  prix_m2_median: number | null;
  valeur_median: number | null;
};
export type Evolution = { annee: number; n: number; prix_m2_median: number | null };
export type Point = {
  id_mutation: string;
  nom_commune: string;
  type: string;
  prix: number | null;
  surface: number | null;
  prix_m2: number | null;
  nombre_pieces: number | null;
  date: string | null;
  latitude: number;
  longitude: number;
};
export type EvolutionTranche = Evolution & { tranche: string };
export type Section = { section: string; n: number; prix_m2_median: number | null; valeur_median: number | null };

export type Feature<P> = { type: "Feature"; geometry: unknown; properties: P };
export type Collection<P> = { type: "FeatureCollection"; features: Feature<P>[]; total?: number };
export type CommuneCarte = {
  code_insee: string;
  commune: string;
  n: number;
  prix_m2_median: number | null;
  valeur_median: number | null;
};
export type VentePoint = {
  id_mutation: string;
  date_mutation: string;
  type: string;
  valeur_fonciere: number;
  surface_reelle_bati: number | null;
  nombre_pieces_principales: number | null;
  prix_m2: number | null;
  nom_commune: string;
  section: string | null;
  avec_jardin: boolean;
  avec_dependance: boolean;
};
export type VenteCommune = {
  id_mutation: string;
  date_mutation: string;
  type: string;
  valeur_fonciere: number;
  surface_reelle_bati: number | null;
  nombre_pieces_principales: number | null;
  prix_m2: number | null;
  surface_terrain: number | null;
  section: string | null;
  avec_dependance: boolean;
  avec_jardin: boolean;
  avec_eau: boolean;
  longitude: number | null;
  latitude: number | null;
};
export type Bien = {
  id_mutation: string;
  date_mutation: string | null;
  annee: number | null;
  valeur_fonciere: number | null;
  type: string;
  surface_reelle_bati: number | null;
  nombre_pieces_principales: number | null;
  prix_m2: number | null;
  surface_terrain: number | null;
  code_commune: string;
  nom_commune: string;
  code_postal: string | null;
  section: string | null;
  longitude: number | null;
  latitude: number | null;
  prix_m2_median_commune: number | null;
  ecart_pct: number | null;
};
export type Estimation = {
  prix_estime: number;
  fourchette_basse: number;
  fourchette_haute: number;
  mae: number;
  mape: number;
  n_entrainement: number;
  n_test: number;
  comparables: { n: number; prix_median: number | null };
  verdict: "au-dessus" | "dans la fourchette" | "au-dessous" | null;
};

type Params = Record<string, string | string[] | undefined>;

const entier = (v: unknown, min: number, max: number) => {
  const n = typeof v === "string" && /^\d+$/.test(v) ? Number(v) : NaN;
  return n >= min && n <= max ? n : undefined;
};

/** Paramètres d'URL → filtres du contrat v2 ; toute valeur invalide est ignorée. */
export function filtres(sp: Params): URLSearchParams {
  const q = new URLSearchParams();
  q.set("type", TYPES.find((t) => t === sp.type) ?? "Maison");
  const budget = entier(sp.budget_max, 10_000, 2_000_000);
  if (budget) q.set("budget_max", String(budget));
  const an = entier(sp.annee, 2021, 2025); // année seule (équivaut à annee_min = annee_max)
  if (an) q.set("annee", String(an));
  const amin = entier(sp.annee_min, 2021, 2025);
  const amax = entier(sp.annee_max, 2021, 2025);
  if (!(amin && amax && amin > amax)) {
    if (amin && amin !== 2021) q.set("annee_min", String(amin));
    if (amax && amax !== 2025) q.set("annee_max", String(amax));
  }
  const smin = entier(sp.surface_min, 9, 400);
  const smax = entier(sp.surface_max, 9, 400);
  if (!(smin && smax && smin > smax)) {
    if (smin) q.set("surface_min", String(smin));
    if (smax) q.set("surface_max", String(smax));
  }
  if (sp.jardin === "true") q.set("jardin", "true");
  if (sp.dependance === "true") q.set("dependance", "true");
  return q;
}

const API_URL = process.env.API_URL ?? "http://127.0.0.1:8000";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`API ${path} : ${res.status}`);
  return res.json();
}

export const kpis = (q: URLSearchParams) => get<Kpis>(`/kpis?${q}`);
export const communes = (q: URLSearchParams) => get<Commune[]>(`/communes?${q}&limit=15&min_ventes=30`);
export const evolution = (q: URLSearchParams) => get<Evolution[]>(`/evolution?${q}`);
export const evolutionTranches = (q: URLSearchParams) => get<EvolutionTranche[]>(`/evolution/tranches?${q}`);
export const carte = (q: URLSearchParams) => get<Collection<CommuneCarte>>(`/carte?${q}`);
export const sections = (code: string, q: URLSearchParams) =>
  get<Section[]>(`/communes/${encodeURIComponent(code)}/sections?${q}`);
export const estimation = (q: URLSearchParams) => get<Estimation>(`/estimation?${q}`);

/** Ventes en points ; `total` = nombre de ventes filtrées avant la limite (champ ou en-tête). */
export async function ventes(q: URLSearchParams, limit = 3000) {
  const res = await fetch(`${API_URL}/ventes?${q}&limit=${limit}`, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`API /ventes : ${res.status}`);
  const fc: Collection<VentePoint> = await res.json();
  const entete = Number(res.headers.get("x-total-count"));
  return { ...fc, total: fc.total ?? (entete || fc.features.length) };
}

/** null si la commune n'existe pas (404), pour appeler notFound(). */
export async function commune(code: string, q: URLSearchParams) {
  const res = await fetch(`${API_URL}/communes/${encodeURIComponent(code)}?${q}`, { next: { revalidate: 3600 } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API /communes/${code} : ${res.status}`);
  return (await res.json()) as Commune;
}

export function ventesCommune(code: string, q: URLSearchParams, section?: string, limit = 200) {
  const s = section ? `&section=${encodeURIComponent(section)}` : "";
  return get<VenteCommune[]>(`/communes/${encodeURIComponent(code)}/ventes?${q}${s}&limit=${limit}`);
}

export const chargerPoints = (q: URLSearchParams, limit = 500) => get<Point[]>(`/points?${q}&limit=${limit}`);

/** Résumé IA générique (POST /resume) ; texte d'erreur si l'API IA est absente. */
export async function resumeIA(agregat: unknown): Promise<string> {
  const res = await fetch(`${API_URL}/resume`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(agregat),
  });
  if (!res.ok) throw new Error(`API /resume : ${res.status}`);
  return (await res.json()).resume;
}

/** null si le bien n'existe pas (404), pour appeler notFound(). */
export async function chargerBien(id: string) {
  const res = await fetch(`${API_URL}/bien/${encodeURIComponent(id)}`, { next: { revalidate: 3600 } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API /bien/${id} : ${res.status}`);
  return (await res.json()) as Bien;
}
