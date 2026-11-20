import Link from "next/link";
import { Fragment } from "react";
import { autour as chargerAutour, EQUIPEMENTS, filtres, type Autour } from "@/lib/api";
import Carte from "../Carte";
import Filtres from "../Filtres";
import Recherche from "./Recherche";

export const metadata = { title: "Autour d'une adresse · Immo Orléans" };

const nombre = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const fmt = (v: number | null | undefined, unite = "") => (v == null ? "n/d" : `${nombre.format(v)}${unite}`);
const date = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });
const un = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const reel = (v: string, min: number, max: number) => {
  const n = v.trim() === "" ? NaN : Number(v);
  return n >= min && n <= max ? n : undefined;
};

const ARGILE: Record<string, string> = { faible: "aléa faible", moyen: "aléa moyen", fort: "aléa fort" };
const CRUE: Record<string, string> = { frequent: "crue fréquente", moyen: "crue moyenne (centennale)", extreme: "crue extrême (rare)" };
const NAPPE: Record<string, string> = { aucune: "aucune remontée connue", inondation_cave: "inondation de cave possible", debordement_nappe: "débordement de nappe possible" };

/** Risques lus sur la vente la plus proche à moins de 150 m ; sinon inconnus. */
function risques(p: Autour["point"]): [string, string][] {
  const inconnu = "non renseigné (aucune vente à moins de 150 m)";
  if (p.distance_m == null || p.distance_m > 150) return [["Risques", inconnu]];
  const s = (v: unknown) => (v == null ? null : String(v));
  const bruit = p.bruit_lden_max_db as number | null;
  const casias = p.distance_site_casias_m as number | null;
  const mh = p.distance_mh_m as number | null;
  return [
    ["Argile (retrait-gonflement)", ARGILE[s(p.alea_argile) ?? ""] ?? "n/d"],
    ["Zone inondable (Loire)", p.zone_inondable_scenario
      ? `${CRUE[s(p.zone_inondable_scenario)!] ?? s(p.zone_inondable_scenario)}${p.hauteur_inondation_classe ? `, hauteur ${p.hauteur_inondation_classe}` : ""}`
      : "hors zone inondable"],
    ["Remontée de nappe", NAPPE[s(p.sensibilite_nappe) ?? ""] ?? "n/d"],
    ["Bruit (routes, rail)", bruit == null ? "moins de 55 dB (hors carte de bruit)" : `${fmt(bruit)} dB Lden${p.bruit_source ? ` (${p.bruit_source})` : ""}`],
    ["Monument historique", p.perimetre_mh_500m ? `dans un périmètre protégé (à ${fmt(mh, " m")})` : `hors périmètre${mh != null ? ` (le plus proche à ${fmt(mh, " m")})` : ""}`],
    ["Sites industriels", `${p.icpe_seveso_1km ? "site Seveso à moins de 1 km" : "pas de site Seveso à 1 km"} · ancien site CASIAS ${casias == null ? "n/d" : `à ${fmt(casias, " m")}`}`],
  ];
}

export default async function PageAutour({ searchParams }: PageProps<"/autour">) {
  const sp = await searchParams;
  const q = filtres(sp);
  const lon = reel(un(sp.lon), -5.5, 10);
  const lat = reel(un(sp.lat), 41, 51.5);
  const rayon = Math.round((reel(un(sp.rayon), 100, 5000) ?? 500) / 100) * 100;
  const adresse = un(sp.adresse).slice(0, 200);
  const point = lon != null && lat != null ? { libelle: adresse || "Point choisi", lon, lat } : null;
  const a = point ? await chargerAutour(q, point.lon, point.lat, rayon) : null;

  // boîte du cercle (approximation plane, comme l'API) pour cadrer la carte
  const cadrage: [number, number, number, number] | null = point
    ? [point.lon - rayon / (111_320 * Math.cos((point.lat * Math.PI) / 180)), point.lat - rayon / 110_540,
       point.lon + rayon / (111_320 * Math.cos((point.lat * Math.PI) / 180)), point.lat + rayon / 110_540]
    : null;
  const garder = point ? { lon: String(point.lon), lat: String(point.lat), rayon: String(rayon), adresse: point.libelle } : undefined;
  const recentes = a?.ventes.features.slice(0, 20) ?? [];

  return (
    <main>
      <p className="source">Adresses : BAN · Ventes : DGFiP, DVF géolocalisées · Risques : Géorisques, BRGM · Équipements : Insee BPE · Licence Ouverte 2.0</p>
      <h1>Qu&apos;y a-t-il autour d&apos;une adresse ?</h1>

      <Recherche initial={point} rayon={rayon} filtres={[...q.entries()]} />
      <Filtres q={q} action="/autour" garder={garder} />

      {!point || !a || !cadrage ? (
        <p className="panel">Tapez une adresse du Loiret, choisissez-la dans la liste, puis réglez le rayon pour voir les ventes, les risques et les équipements autour.</p>
      ) : (
        <>
          <section className="kpis" aria-label="Indicateurs dans le rayon">
            <div className="panel surligne">
              <p className="label">Prix médian au m²</p>
              <p className="valeur">{fmt(a.stats.prix_m2_median, " €/m²")}</p>
              <p className="detail">dans un rayon de {fmt(rayon, " m")}</p>
            </div>
            <div className="panel">
              <p className="label">Nombre de ventes</p>
              <p className="valeur">{nombre.format(a.stats.n)}</p>
              <p className="detail">
                {Object.entries(a.stats.par_type).map(([t, m]) => `${t} : ${nombre.format(m.n)} (${fmt(m.prix_m2_median, " €/m²")})`).join(" · ") || "aucune vente pour ces filtres"}
              </p>
            </div>
            <div className="panel">
              <p className="label">Prix médian de vente</p>
              <p className="valeur">{fmt(a.stats.valeur_median, " €")}</p>
            </div>
          </section>

          <Carte ventes={a.ventes} cadrage={cadrage} qs={q.toString()} autour={{ centre: [point.lon, point.lat], rayon }}
            titre={`${nombre.format(a.ventes.total)} vente${a.ventes.total > 1 ? "s" : ""} à moins de ${fmt(rayon, " m")} de ${point.libelle}`} />
          {a.ventes.total > a.ventes.features.length && (
            <p className="detail avertissement">
              {nombre.format(a.ventes.features.length)} ventes affichées sur {nombre.format(a.ventes.total)} (les plus récentes). Réduisez le rayon ou affinez les filtres pour tout voir.
            </p>
          )}

          <div className="fiche autour-blocs">
            <section className="panel" aria-labelledby="titre-risques">
              <h2 id="titre-risques">Risques à cet endroit</h2>
              <dl className="infos">
                {risques(a.point).map(([k, v]) => (
                  <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>
                ))}
              </dl>
              <p className="detail" style={{ marginTop: 12 }}>
                Commune : {a.point.nom_commune ?? "n/d"}. Valeurs de la vente la plus proche{a.point.distance_m != null ? ` (à ${fmt(a.point.distance_m, " m")})` : ""} ; à confirmer par l&apos;état des risques officiel.
              </p>
            </section>
            <section className="panel" aria-labelledby="titre-proximite">
              <h2 id="titre-proximite">À proximité</h2>
              <dl className="infos">
                {a.equipements.map((e) => (
                  <Fragment key={e.famille}>
                    <dt>{EQUIPEMENTS[e.famille]?.libelle ?? e.famille}</dt>
                    <dd>
                      {nombre.format(e.n)} dans le rayon
                      {e.plus_proche && ` · plus proche : ${e.plus_proche.nom ?? "sans nom"}, ${fmt(e.plus_proche.distance_m, " m")}`}
                    </dd>
                  </Fragment>
                ))}
              </dl>
            </section>
          </div>

          <section className="panel autour-ventes" aria-labelledby="titre-ventes">
            <h2 id="titre-ventes">{recentes.length ? `Les ${recentes.length} ventes les plus récentes dans le rayon` : "Aucune vente dans le rayon pour ces filtres"}</h2>
            {recentes.length > 0 && (
              <div className="tableau" role="region" aria-labelledby="titre-ventes" tabIndex={0}>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Type</th>
                      <th scope="col">Surface</th>
                      <th scope="col">Prix</th>
                      <th scope="col">Distance</th>
                      <th scope="col">Commune, section</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentes.map(({ properties: v }) => (
                      <tr key={v.id_mutation}>
                        <td>
                          <Link href={`/vente/${encodeURIComponent(v.id_mutation)}`} aria-label={`Fiche de la vente du ${date.format(new Date(v.date_mutation))}`}>
                            {date.format(new Date(v.date_mutation))}
                          </Link>
                        </td>
                        <td>{v.type}</td>
                        <td>{fmt(v.surface_reelle_bati, " m²")}</td>
                        <td>{fmt(v.valeur_fonciere, " €")}</td>
                        <td>{fmt(v.distance_m, " m")}</td>
                        <td>{v.nom_commune}{v.section ? `, ${v.section}` : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
