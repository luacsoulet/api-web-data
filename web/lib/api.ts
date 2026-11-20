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

const API_URL = process.env.API_URL ?? "http://127.0.0.1:8000";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`API ${path} : ${res.status}`);
  return res.json();
}

export function chargerDonnees(type: TypeBien) {
  return Promise.all([
    get<Kpis>(`/kpis?type=${type}`),
    get<Commune[]>(`/communes?type=${type}&limit=15&min_ventes=30`),
    get<Evolution[]>(`/evolution?type=${type}`),
  ]);
}
