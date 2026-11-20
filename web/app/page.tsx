import {
  chargerDonnees,
  chargerPoints,
  TYPES,
  type TypeBien,
  type Kpis,
  type Commune,
} from "@/lib/api";
import { Carte } from "./carte";

const nombre = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const fmt = (v: number | null, unite: string) =>
  v == null ? "n/d" : `${nombre.format(v)} ${unite}`;

function toNumber(v: string | string[] | undefined): number | null {
  if (v === undefined || v === "") return null;
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isFinite(n) ? n : null;
}

async function resumerNemotron(kpis: Kpis, communes: Commune[]): Promise<string | null> {
  const apiUrl = process.env.API_URL ?? "http://127.0.0.1:8000";
  try {
    const r = await fetch(`${apiUrl}/resume`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kpis, communes }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    return data.resume ?? null;
  } catch {
    return null;
  }
}

export default async function Page({ searchParams }: PageProps<"/">) {
  const type: TypeBien = TYPES.find((t) => t === searchParams.type) ?? "Maison";
  const annee = toNumber(searchParams.annee);
  const budget_max = toNumber(searchParams.budget_max);

  const [kpis, communes] = await chargerDonnees(type, annee, budget_max);
  const points = await chargerPoints(type, annee, budget_max);
  const resume = await resumerNemotron(kpis, communes);

  const max = Math.max(...communes.map((c) => c.prix_m2_median ?? 0), 1);
  const top = communes[0];
  const dernier = communes[communes.length - 1];
  const titre = top
    ? `${top.nom_commune}, la plus chère : ${fmt(top.prix_m2_median, "€/m²")} médian sur ${nombre.format(top.n)} ventes`
    : "Aucune commune avec assez de ventes";
  const alternative =
    top && dernier
      ? `Classement de ${communes.length} communes par prix médian au m² décroissant, de ${top.nom_commune} (${fmt(top.prix_m2_median, "€/m²")}) à ${dernier.nom_commune} (${fmt(dernier.prix_m2_median, "€/m²")}).`
      : "";

  return (
    <main>
      <p className="source">
        DGFiP, DVF géolocalisées (Etalab) · Loiret · 2021-2025 · Licence Ouverte 2.0
      </p>
      <h1>Où chercher un logement autour d&apos;Orléans, et pour quel budget ?</h1>

      <form method="get" className="filtres" aria-label="Filtres">
        <label>
          Type de bien
          <select name="type" defaultValue={type}>
            {TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          Année
          <select name="annee" defaultValue={annee ?? ""}>
            <option value="">Toutes</option>
            {[2021, 2022, 2023, 2024, 2025].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>
        <label>
          Budget max (€)
          <input type="number" name="budget_max" defaultValue={budget_max ?? ""} min="0" />
        </label>
        <button type="submit">Appliquer</button>
      </form>

      <section className="kpis" aria-label="Indicateurs">
        <div className="panel surligne">
          <p className="label">Prix médian au m²</p>
          <p className="valeur">{fmt(kpis.prix_m2_median, "€/m²")}</p>
        </div>
        <div className="panel">
          <p className="label">Prix médian de vente</p>
          <p className="valeur">{fmt(kpis.valeur_median, "€")}</p>
        </div>
        <div className="panel">
          <p className="label">Nombre de ventes</p>
          <p className="valeur">{nombre.format(kpis.n_ventes)}</p>
          <p className="detail">
            dans {nombre.format(kpis.n_communes)} communes
          </p>
        </div>
      </section>

      {resume && (
        <section className="panel resume" aria-labelledby="titre-resume">
          <h2 id="titre-resume">Résumé Nemotron</h2>
          <p>{resume}</p>
          <p className="source">
            Texte généré par Nemotron à partir du tableau ci-dessus.
          </p>
        </section>
      )}

      <Carte points={points} communes={communes} />

      <section className="panel graphique" aria-labelledby="titre-graphique">
        <h2 id="titre-graphique">{titre}</h2>
        <ol className="barres">
          {communes.map((c) => (
            <li key={c.code_commune}>
              <span className="nom">{c.nom_commune}</span>
              <span className="piste" aria-hidden="true">
                <span
                  className="barre"
                  style={{ width: `${((c.prix_m2_median ?? 0) / max) * 100}%` }}
                />
              </span>
              <span className="chiffre">
                {fmt(c.prix_m2_median, "€/m²")}
                <small>{nombre.format(c.n)} ventes</small>
              </span>
            </li>
          ))}
        </ol>
        <p className="alternative">{alternative}</p>
      </section>
    </main>
  );
}
