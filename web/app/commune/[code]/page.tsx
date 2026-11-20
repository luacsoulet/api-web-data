import Link from "next/link";
import { notFound } from "next/navigation";
import { commune as chargerCommune, filtres, sections as chargerSections, ventesCommune, type Collection, type VentePoint } from "@/lib/api";
import Carte from "../../Carte";
import Filtres from "../../Filtres";

const nombre = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const fmt = (v: number | null, unite = "") => (v == null ? "n/d" : `${nombre.format(v)}${unite}`);
const date = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });
const LOIRET: [number, number, number, number] = [1.51, 47.48, 3.13, 48.35];
const TABLE = 200;

export default async function PageCommune({ params, searchParams }: PageProps<"/commune/[code]">) {
  const { code } = await params;
  const sp = await searchParams;
  const q = filtres(sp);
  const section = typeof sp.section === "string" && /^[0-9A-Za-z]{1,10}$/.test(sp.section) ? sp.section : undefined;

  const c = await chargerCommune(code, q);
  if (!c) notFound();
  const [sections, ventes] = await Promise.all([chargerSections(code, q), ventesCommune(code, q, section, 1000)]);

  const points: Collection<VentePoint> = {
    type: "FeatureCollection",
    features: ventes
      .filter((v) => v.longitude != null && v.latitude != null)
      .map(({ longitude, latitude, ...v }) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [longitude, latitude] },
        properties: { ...v, nom_commune: c.nom_commune },
      })),
  };
  const lon = points.features.map((f) => (f.geometry as { coordinates: number[] }).coordinates[0]);
  const lat = points.features.map((f) => (f.geometry as { coordinates: number[] }).coordinates[1]);
  // marge de 0,01° : une seule vente donnerait sinon une boîte vide
  const cadrage: [number, number, number, number] = lon.length
    ? [Math.min(...lon) - 0.01, Math.min(...lat) - 0.01, Math.max(...lon) + 0.01, Math.max(...lat) + 0.01]
    : LOIRET;

  const base = `/commune/${encodeURIComponent(code)}`;
  const max = Math.max(...sections.map((s) => s.prix_m2_median ?? 0), 1);
  // la plus chère parmi les sections d'au moins 10 ventes : un constat sur 1 vente ne vaut rien
  const top = sections.find((s) => s.n >= 10) ?? sections[0];
  const de = /^[aeiouyhéèêâîôûàAEIOUYHÉÈÊÂÎÔÛ]/.test(c.nom_commune) ? "d'" : "de ";
  const titre = top
    ? `Section ${top.section}, la plus chère ${de}${c.nom_commune}${top.n >= 10 ? " (sections d'au moins 10 ventes)" : ""} : ${fmt(top.prix_m2_median, " €/m²")} médian sur ${nombre.format(top.n)} vente${top.n > 1 ? "s" : ""}`
    : "Aucune section avec des ventes pour cette recherche";
  const dernier = sections[sections.length - 1];

  return (
    <main>
      <nav aria-label="Fil d'Ariane" className="ariane">
        <ol>
          <li><Link href={`/?${q}`}>Loiret</Link></li>
          <li>{section ? <Link href={`${base}?${q}`}>{c.nom_commune}</Link> : <span aria-current="page">{c.nom_commune}</span>}</li>
          {section && <li><span aria-current="page">Section {section}</span></li>}
        </ol>
      </nav>
      <h1>{c.nom_commune}{section ? `, section ${section}` : ""}</h1>

      <Filtres q={q} action={base} />

      <section className="kpis" aria-label="Indicateurs de la commune">
        <div className="panel surligne">
          <p className="label">Prix médian au m²</p>
          <p className="valeur">{fmt(c.prix_m2_median, " €/m²")}</p>
        </div>
        <div className="panel">
          <p className="label">Prix médian de vente</p>
          <p className="valeur">{fmt(c.valeur_median, " €")}</p>
        </div>
        <div className="panel">
          <p className="label">Nombre de ventes</p>
          <p className="valeur">{nombre.format(c.n)}</p>
          <p className="detail">{sections.length} sections cadastrales</p>
        </div>
      </section>

      <Carte ventes={points} cadrage={cadrage} qs={q.toString()} />

      <section className="panel graphique" aria-labelledby="titre-sections">
        <h2 id="titre-sections">{titre}</h2>
        <ol className="barres">
          {sections.map((s) => (
            <li key={s.section}>
              <Link className="nom" href={`${base}?${q}&section=${encodeURIComponent(s.section)}`}
                aria-current={s.section === section ? "page" : undefined}>
                Section {s.section}
              </Link>
              <span className="piste" aria-hidden="true">
                <span className="barre" style={{ width: `${((s.prix_m2_median ?? 0) / max) * 100}%` }} />
              </span>
              <span className="chiffre">
                {fmt(s.prix_m2_median, " €/m²")} <small>{nombre.format(s.n)} ventes</small>
              </span>
            </li>
          ))}
        </ol>
        {top && dernier && (
          <p className="alternative">
            {sections.length} sections classées par prix médian au m² décroissant, de {top.section} ({fmt(top.prix_m2_median, " €/m²")}) à {dernier.section} ({fmt(dernier.prix_m2_median, " €/m²")}).
          </p>
        )}
      </section>

      <section className="panel" aria-labelledby="titre-ventes">
        <h2 id="titre-ventes">
          {ventes.length > TABLE ? `Les ${TABLE} ventes les plus récentes sur ${nombre.format(ventes.length)}` : `${nombre.format(ventes.length)} ventes, les plus récentes d'abord`}
        </h2>
        <div className="tableau" role="region" aria-labelledby="titre-ventes" tabIndex={0}>
          <table>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Prix</th>
                <th scope="col">Surface</th>
                <th scope="col">Pièces</th>
                <th scope="col">€/m²</th>
                <th scope="col">Section</th>
                <th scope="col">Options</th>
              </tr>
            </thead>
            <tbody>
              {ventes.slice(0, TABLE).map((v) => (
                <tr key={v.id_mutation}>
                  <td>{date.format(new Date(v.date_mutation))}</td>
                  <td>{fmt(v.valeur_fonciere, " €")}</td>
                  <td>{fmt(v.surface_reelle_bati, " m²")}</td>
                  <td>{fmt(v.nombre_pieces_principales)}</td>
                  <td>{fmt(v.prix_m2)}</td>
                  <td>{v.section ?? "n/d"}</td>
                  <td>
                    {v.avec_jardin && <span className="puce">jardin</span>}
                    {v.avec_dependance && <span className="puce">dépendance</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
