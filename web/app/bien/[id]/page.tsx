import Link from "next/link";
import { notFound } from "next/navigation";
import { chargerBien } from "@/lib/api";
import Bien3D from "../Bien3D";

const nombre = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const fmt = (v: number | null, unite = "") => (v == null ? "n/d" : `${nombre.format(v)}${unite}`);
const date = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });

export default async function PageBien({ params }: PageProps<"/bien/[id]">) {
  const { id } = await params;
  let idDecode: string;
  try {
    idDecode = decodeURIComponent(id);
  } catch {
    notFound(); // id mal encodé (ex. %E0) : 404 plutôt que 500
  }
  const b = await chargerBien(idDecode);
  if (!b) notFound();

  const ecart = b.ecart_pct;
  const constat =
    ecart == null || b.prix_m2_median_commune == null
      ? "Comparaison impossible : prix au m² ou médiane de la commune indisponible."
      : `${Math.abs(ecart).toLocaleString("fr-FR")} % ${ecart >= 0 ? "au-dessus" : "au-dessous"} de la médiane des ${b.type.toLowerCase()}s de ${b.nom_commune} (${fmt(b.prix_m2_median_commune, " €/m²")}).`;

  return (
    <main>
      <nav aria-label="Fil d'Ariane" className="ariane">
        <ol>
          <li><Link href="/">Loiret</Link></li>
          <li><Link href={`/commune/${encodeURIComponent(b.code_commune)}?type=${encodeURIComponent(b.type)}`}>{b.nom_commune}</Link></li>
          <li><span aria-current="page">Bien {b.id_mutation}</span></li>
        </ol>
      </nav>
      <h1>{b.type} à {b.nom_commune}</h1>

      <section className="kpis" aria-label="Caractéristiques du bien">
        <div className="panel surligne">
          <p className="label">Prix</p>
          <p className="valeur">{fmt(b.valeur_fonciere, " €")}</p>
        </div>
        <div className="panel">
          <p className="label">Prix au m²</p>
          <p className="valeur">{fmt(b.prix_m2, " €/m²")}</p>
        </div>
        <div className="panel">
          <p className="label">Surface</p>
          <p className="valeur">{fmt(b.surface_reelle_bati, " m²")}</p>
        </div>
        <div className="panel">
          <p className="label">Pièces</p>
          <p className="valeur">{fmt(b.nombre_pieces_principales)}</p>
        </div>
        <div className="panel">
          <p className="label">Terrain</p>
          <p className="valeur">{fmt(b.surface_terrain, " m²")}</p>
        </div>
        <div className="panel">
          <p className="label">Date de vente</p>
          <p className="valeur">{b.date_mutation ? date.format(new Date(b.date_mutation)) : "n/d"}</p>
        </div>
      </section>

      <section className="panel" aria-labelledby="titre-comparaison">
        <h2 id="titre-comparaison">Comparaison à la commune</h2>
        <p className="constat">{constat}</p>
      </section>

      <section className="panel" aria-labelledby="titre-3d">
        <h2 id="titre-3d">Modèle 3D</h2>
        <Bien3D
          type={b.type}
          surface={b.surface_reelle_bati}
          terrain={b.surface_terrain}
          pieces={b.nombre_pieces_principales}
          commune={b.nom_commune}
        />
        <p className="alternative">Modèle illustratif : dimensions réelles, agencement théorique (le plan réel est inconnu).</p>
      </section>

      <section className="panel" aria-labelledby="titre-photos">
        <h2 id="titre-photos">Photos</h2>
        <p>Non disponibles (DVF ne contient pas de photos).</p>
      </section>

      <section className="panel" aria-labelledby="titre-risques">
        <h2 id="titre-risques">Risques de la zone</h2>
        <p>À venir.</p>
      </section>
    </main>
  );
}
