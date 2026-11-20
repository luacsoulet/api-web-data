import Link from "next/link";
import { chargerDonnees, TYPES, type TypeBien } from "@/lib/api";

const nombre = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const fmt = (v: number | null, unite: string) => (v == null ? "n/d" : `${nombre.format(v)} ${unite}`);

export default async function Page({ searchParams }: PageProps<"/">) {
  const { type: brut } = await searchParams;
  const type: TypeBien = TYPES.find((t) => t === brut) ?? "Maison";
  // /evolution est chargé (contrat du sprint) mais pas encore affiché
  const [kpis, communes] = await chargerDonnees(type);

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
      <p className="source">DGFiP, DVF géolocalisées (Etalab) · Loiret · 2021-2025 · Licence Ouverte 2.0</p>
      <h1>Où chercher un logement autour d&apos;Orléans, et pour quel budget ?</h1>

      <nav className="filtre" aria-label="Type de bien">
        {TYPES.map((t) => (
          <Link key={t} href={`/?type=${t}`} aria-current={t === type ? "page" : undefined}>
            {t}
          </Link>
        ))}
      </nav>

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
          <p className="detail">dans {nombre.format(kpis.n_communes)} communes</p>
        </div>
      </section>

      <section className="panel graphique" aria-labelledby="titre-graphique">
        <h2 id="titre-graphique">{titre}</h2>
        <ol className="barres">
          {communes.map((c) => (
            <li key={c.code_commune}>
              <span className="nom">{c.nom_commune}</span>
              <span className="piste" aria-hidden="true">
                <span className="barre" style={{ width: `${((c.prix_m2_median ?? 0) / max) * 100}%` }} />
              </span>
              <span className="chiffre">
                {fmt(c.prix_m2_median, "€/m²")} <small>{nombre.format(c.n)} ventes</small>
              </span>
            </li>
          ))}
        </ol>
        <p className="alternative">{alternative}</p>
      </section>
    </main>
  );
}
