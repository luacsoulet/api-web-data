import Link from "next/link";
import {
  carte, communes as chargerCommunes, evolution as chargerEvolution, evolutionTranches, filtres,
  kpis as chargerKpis, ventes as chargerVentes,
} from "@/lib/api";
import Carte from "./Carte";
import Evolution from "./Evolution";
import Filtres from "./Filtres";

const nombre = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const fmt = (v: number | null, unite: string) => (v == null ? "n/d" : `${nombre.format(v)} ${unite}`);
const LOIRET: [number, number, number, number] = [1.51, 47.48, 3.13, 48.35];
const LIMITE = 3000;

export default async function Page({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const q = filtres(sp);
  const vue = sp.evo === "tout" ? "tout" : "tranches";
  const [kpis, communes, communesCarte, ventes, evo] = await Promise.all([
    chargerKpis(q),
    chargerCommunes(q),
    carte(q),
    chargerVentes(q, LIMITE),
    vue === "tout" ? chargerEvolution(q) : evolutionTranches(q),
  ]);

  const max = Math.max(...communes.map((c) => c.prix_m2_median ?? 0), 1);
  const top = communes[0];
  const dernier = communes[communes.length - 1];
  const titre = top
    ? `${top.nom_commune}, la plus chère : ${fmt(top.prix_m2_median, "€/m²")} médian sur ${nombre.format(top.n)} ventes`
    : "Aucune commune avec au moins 30 ventes pour cette recherche";
  const alternative =
    top && dernier
      ? `Classement de ${communes.length} communes (au moins 30 ventes) par prix médian au m² décroissant, de ${top.nom_commune} (${fmt(top.prix_m2_median, "€/m²")}) à ${dernier.nom_commune} (${fmt(dernier.prix_m2_median, "€/m²")}).`
      : "";

  return (
    <main>
      <p className="source">DGFiP, DVF géolocalisées (Etalab) · Loiret · 2021-2025 · Licence Ouverte 2.0</p>
      <h1>Où chercher un logement autour d&apos;Orléans, et pour quel budget ?</h1>

      <Filtres q={q} action="/" evo={vue === "tout" ? vue : undefined} />

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

      <Evolution q={q} vue={vue} lignes={evo} />

      <Carte communes={communesCarte} ventes={ventes} cadrage={LOIRET} qs={q.toString()} />
      {ventes.total > ventes.features.length && (
        <p className="detail avertissement">
          {nombre.format(ventes.features.length)} ventes affichées sur {nombre.format(ventes.total)} correspondant à la
          recherche (les plus récentes). Affinez les filtres pour tout voir.
        </p>
      )}

      <section className="panel graphique" aria-labelledby="titre-graphique">
        <h2 id="titre-graphique">{titre}</h2>
        <ol className="barres">
          {communes.map((c) => (
            <li key={c.code_commune}>
              <Link className="nom" href={`/commune/${c.code_commune}?${q}`}>
                {c.nom_commune}
              </Link>
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
