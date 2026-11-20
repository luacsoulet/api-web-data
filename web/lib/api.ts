export const TYPES = ["Maison", "Appartement", "Tous"] as const;
export type TypeBien = (typeof TYPES)[number];
export const ANNEES = [2021, 2022, 2023, 2024, 2025, 2026] as const;
export const DPE = ["A", "B", "C", "D", "E", "F", "G"] as const;
export const ARGILE = ["faible", "moyen", "fort"] as const;
/** valeur envoyée à l'API (sous-chaîne de bat_materiau_murs) → libellé */
export const MATERIAUX = { BETON: "Béton", PIERRE: "Pierre", AGGLOMERE: "Aggloméré", BRIQUES: "Briques", MEULIERE: "Meulière", BOIS: "Bois" } as const;

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
} & V3Props;
/** ajoutés par l'API v3 dans /ventes et /communes/{code}/ventes */
type V3Props = {
  piscine?: boolean;
  dpe_classe?: string | null;
  alea_argile?: string | null;
  zone_inondable_scenario?: string | null;
  bat_annee_construction?: number | null;
  /** page Autour : distance au point cherché */
  distance_m?: number;
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
} & V3Props;
export type Attention = { facteur: string; niveau: "info" | "vigilance" | "alerte"; texte: string };
type Valeur = string | number | boolean | null;
/** GET /biens/{id} : toutes les colonnes de biens.parquet (NaN → null) + parcelles, piscines, attention */
export type Bien = {
  [colonne: string]: Valeur | string[] | Attention[] | Collection<unknown>;
  id_mutation: string;
  date_mutation: string;
  type: string;
  valeur_fonciere: number;
  code_commune: string;
  nom_commune: string;
  longitude: number | null;
  latitude: number | null;
  parcelles: string[] | string | null;
  piscines: Collection<{ id_parcelle: string; surface_m2: number | null }>;
  attention: Attention[];
};
/** GET /contexte : valeurs de la vente la plus proche à moins de 150 m, sinon null */
export type Contexte = { [colonne: string]: Valeur; code_commune: string | null };
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

/** Paramètres d'URL → filtres du contrat v3 ; toute valeur invalide est ignorée. */
export function filtres(sp: Params): URLSearchParams {
  const q = new URLSearchParams();
  q.set("type", TYPES.find((t) => t === sp.type) ?? "Maison");
  const budget = entier(sp.budget_max, 10_000, 2_000_000);
  if (budget) q.set("budget_max", String(budget));
  const amin = entier(sp.annee_min, 2021, 2026);
  const amax = entier(sp.annee_max, 2021, 2026);
  if (!(amin && amax && amin > amax)) {
    if (amin && amin !== 2021) q.set("annee_min", String(amin));
    if (amax && amax !== 2026) q.set("annee_max", String(amax));
  }
  const smin = entier(sp.surface_min, 9, 400);
  const smax = entier(sp.surface_max, 9, 400);
  if (!(smin && smax && smin > smax)) {
    if (smin) q.set("surface_min", String(smin));
    if (smax) q.set("surface_max", String(smax));
  }
  for (const nom of ["jardin", "dependance", "piscine", "hors_inondable", "hors_nappe"])
    if (sp[nom] === "true") q.set(nom, "true");
  for (const d of DPE) if ([sp.dpe].flat().includes(d)) q.append("dpe", d);
  const argile = ARGILE.find((a) => a === sp.argile_max);
  if (argile && argile !== "fort") q.set("argile_max", argile); // « fort » = tout, donc pas de filtre
  const materiau = Object.keys(MATERIAUX).find((m) => m === sp.materiau);
  if (materiau) q.set("materiau", materiau);
  const capres = entier(sp.construit_apres, 1800, 2026);
  const cavant = entier(sp.construit_avant, 1800, 2026);
  if (!(capres && cavant && capres > cavant)) {
    if (capres) q.set("construit_apres", String(capres));
    if (cavant) q.set("construit_avant", String(cavant));
  }
  for (const nom of ["medecins_min", "ecoles_min", "commerces_min"]) {
    const n = entier(sp[nom], 1, 100);
    if (n) q.set(nom, String(n));
  }
  const gare = entier(sp.gare_max_m, 100, 50_000);
  if (gare) q.set("gare_max_m", String(gare));
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

/** null si la vente n'existe pas (404), pour appeler notFound(). */
export async function bien(id: string) {
  const res = await fetch(`${API_URL}/biens/${encodeURIComponent(id)}`, { next: { revalidate: 3600 } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API /biens/${id} : ${res.status}`);
  return (await res.json()) as Bien;
}

export const contexte = (longitude: number, latitude: number) =>
  get<Contexte>(`/contexte?longitude=${longitude}&latitude=${latitude}`);

/** familles d'équipements (BPE) : libellé et couleur de carte (le canvas MapLibre ne lit pas les variables CSS) */
export const EQUIPEMENTS = {
  ecole: { libelle: "Écoles", couleur: "#2e7d32" },
  college_lycee: { libelle: "Collèges et lycées", couleur: "#00838f" },
  medecin: { libelle: "Médecins généralistes", couleur: "#c62828" },
  pharmacie: { libelle: "Pharmacies", couleur: "#ad1457" },
  commerce_alimentaire: { libelle: "Commerces alimentaires", couleur: "#ef6c00" },
  gare: { libelle: "Gares", couleur: "#6d4c41" },
} as const;
export type Adresse = { libelle: string; code_insee: string; longitude: number; latitude: number };
type Medianes = { n: number; prix_m2_median: number | null; valeur_median: number | null };
/** GET /autour : ventes du rayon (distance_m en plus), médianes, risques au point, équipements */
export type Autour = {
  ventes: Collection<VentePoint> & { total: number };
  stats: Medianes & { par_type: Record<string, Medianes> };
  point: Contexte & { distance_m: number | null };
  equipements: { famille: keyof typeof EQUIPEMENTS; n: number; plus_proche: { nom: string | null; distance_m: number } | null }[];
};
export const autour = (q: URLSearchParams, lon: number, lat: number, rayon: number) =>
  get<Autour>(`/autour?${q}&longitude=${lon}&latitude=${lat}&rayon_m=${rayon}`);
