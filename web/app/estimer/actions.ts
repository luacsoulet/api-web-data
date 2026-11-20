"use server";

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
export type Etat = { resultat?: Estimation; erreur?: string };

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
  const prix = Number(f.get("prix_demande"));
  if (prix > 0) q.set("prix_demande", String(prix));

  try {
    const res = await fetch(`${API_URL}/estimation?${q}`, { cache: "no-store" });
    if (res.status === 404) return { erreur: "Commune inconnue : choisissez-en une dans la liste." };
    if (!res.ok) return { erreur: "Le service d'estimation a refusé la demande. Vérifiez les valeurs saisies." };
    return { resultat: (await res.json()) as Estimation };
  } catch {
    return { erreur: "Le service d'estimation est indisponible. Réessayez dans un instant." };
  }
}
