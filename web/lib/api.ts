export const TYPES = ["Maison", "Appartement", "Tous"] as const;
export type TypeBien = (typeof TYPES)[number];

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

const API_URL = process.env.API_URL ?? "http://127.0.0.1:8000";

function qs(extra: Record<string, string | number | null> = {}): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(extra)) {
    if (v != null) p.set(k, String(v));
  }
  return p.toString();
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`API ${path} : ${res.status}`);
  return res.json();
}

export function chargerDonnees(
  type: TypeBien,
  annee: number | null,
  budget_max: number | null,
) {
  const q = qs({ type, annee, budget_max });
  return Promise.all([
    get<Kpis>(`/kpis?${q}`),
    get<Commune[]>(`/communes?${q}&limit=15&min_ventes=30`),
    get<Evolution[]>(`/evolution?${q}`),
  ]);
}

export function chargerPoints(
  type: TypeBien,
  annee: number | null,
  budget_max: number | null,
  limit = 500,
) {
  const q = qs({ type, annee, budget_max, limit });
  return get<Point[]>(`/points?${q}`);
}
