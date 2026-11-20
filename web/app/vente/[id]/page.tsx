import Link from "next/link";
import { notFound } from "next/navigation";
import { bien as chargerBien, type Attention, type Collection } from "@/lib/api";
import Bien3D from "./Bien3D";
import PlanCadastral from "./PlanCadastral";

const nombre = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const jour = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });

const ARGILE: Record<string, string> = { faible: "faible", moyen: "moyen", fort: "fort" };
const CRUE: Record<string, string> = {
  frequent: "crue fréquente (la plus probable)", moyen: "crue moyenne (centennale)", extreme: "crue extrême (rare)" };
const NAPPE: Record<string, string> = {
  aucune: "aucune sensibilité connue", inondation_cave: "inondation de cave possible", debordement_nappe: "débordement de nappe possible" };
const NIVEAUX: Record<Attention["niveau"], { libelle: string; icone: string }> = {
  alerte: { libelle: "Alerte", icone: "⛔" },
  vigilance: { libelle: "Vigilance", icone: "⚠" },
  info: { libelle: "Info", icone: "ℹ" },
};

type Ligne = [string, string];

export default async function PageVente({ params }: PageProps<"/vente/[id]">) {
  const { id } = await params;
  // les id_mutation DVF sont du type « 2021-789576 » : on refuse le reste sans appeler l'API
  if (!/^[\w.-]{1,40}$/.test(id)) notFound();
  const b = await chargerBien(id);
  if (!b) notFound();

  // lecteurs : valeur absente → « non renseigné », toujours avec l'unité
  const brut = (k: string) => b[k] as string | number | boolean | null | undefined;
  const nd = "non renseigné";
  const n = (k: string, unite = "", f = nombre) => {
    const v = brut(k);
    return v == null || v === "" || Number.isNaN(Number(v)) ? nd : `${f.format(Number(v))}${unite}`;
  };
  const pct = (k: string) => (brut(k) == null ? nd : `${nombre.format(Number(brut(k)) * 100)} %`);
  const oui = (k: string) => (brut(k) ? "oui" : "non");
  const txt = (k: string, libelles?: Record<string, string>) => {
    const v = brut(k);
    if (v == null || v === "") return nd;
    const s = String(v);
    return libelles?.[s] ?? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  };
  const date = (k: string) => {
    const d = new Date(String(brut(k) ?? ""));
    return brut(k) == null || Number.isNaN(d.getTime()) ? nd : jour.format(d);
  };

  const parcelles = (Array.isArray(b.parcelles) ? b.parcelles : String(b.parcelles ?? "").split(";")).filter(Boolean);
  const piscines: Collection<unknown> = b.piscines ?? { type: "FeatureCollection", features: [] };
  const centre: [number, number] | null = b.longitude != null && b.latitude != null ? [b.longitude, b.latitude] : null;
  const attention = b.attention ?? [];
  const ecart = b.ecart_pct;
  const constat =
    ecart == null || b.prix_m2_median_commune == null
      ? "Comparaison impossible : prix au m² ou médiane de la commune indisponible."
      : `${Math.abs(ecart).toLocaleString("fr-FR")} % ${ecart >= 0 ? "au-dessus" : "au-dessous"} de la médiane des ${b.type.toLowerCase()}s de ${b.nom_commune} (${nombre.format(b.prix_m2_median_commune)} €/m²).`;
  const num = (k: string) => (brut(k) == null ? null : Number(brut(k)));
  const alertes = attention.filter((a) => a.niveau === "alerte").length;

  const groupes: [string, Ligne[]][] = [
    ["Vente", [
      ["Date", date("date_mutation")],
      ["Prix", n("valeur_fonciere", " €")],
      ["Prix au m²", n("prix_m2", " €/m²")],
      ["Type", txt("type")],
      ["Surface habitable", n("surface_reelle_bati", " m²")],
      ["Pièces principales", n("nombre_pieces_principales")],
      ["Surface Carrez (lot 1)", brut("lot1_surface_carrez") == null ? nd : `${brut("lot1_surface_carrez")} m²`],
      ["Lots de copropriété", n("nombre_lots")],
      ["Garage, cave ou parking", oui("avec_dependance")],
      ["Jardin", oui("avec_jardin")],
      ["Commune", `${b.nom_commune} (${brut("code_postal") ?? b.code_commune})`],
      ["Section cadastrale", txt("section", {})],
    ]],
    ["Bâtiment & DPE", [
      ["Année de construction", brut("bat_annee_construction") == null ? nd : String(brut("bat_annee_construction"))],
      ["Usage", txt("bat_usage")],
      ["Murs", txt("bat_materiau_murs")],
      ["Toiture", txt("bat_materiau_toit")],
      ["Niveaux", n("bat_nb_niveaux")],
      ["Logements dans le bâtiment", n("bat_nb_logements")],
      ["Hauteur moyenne", n("bat_hauteur_moy", " m", decimal)],
      ["Classe énergie (DPE)", txt("dpe_classe", {})],
      ["Classe climat (GES)", txt("dpe_classe_ges", {})],
      ["Consommation", n("dpe_conso_ep_m2", " kWh/m²/an")],
      ["Émissions", n("dpe_ges_m2", " kg CO₂/m²/an")],
      ["Chauffage", txt("dpe_energie_chauffage", { electricite: "Électricité", "reseau de chaleur": "Réseau de chaleur", "gpl/butane/propane": "GPL, butane ou propane" })],
      ["Date du DPE", date("dpe_date")],
    ]],
    ["Parcelle & piscine", [
      ["Parcelles", parcelles.length ? parcelles.join(", ") : nd],
      ["Contenance cadastrale", n("contenance_parcelles_m2", " m²")],
      ["Terrain déclaré (DVF)", n("surface_terrain", " m²")],
      ["Emprise bâtie", n("emprise_batie_m2", " m²")],
      ["Piscine", brut("piscine") ? `oui (${n("nb_piscines")}, ${n("surface_piscine_m2", " m²", decimal)})` : "non détectée"],
    ]],
    ["Risques", [
      ["Argile (retrait-gonflement)", brut("alea_argile") == null ? nd : `aléa ${txt("alea_argile", ARGILE)}`],
      ["Zone inondable (Loire)", brut("zone_inondable_scenario") == null ? "hors zone ou non évalué" : txt("zone_inondable_scenario", CRUE)],
      ["Hauteur d'eau possible", txt("hauteur_inondation_classe", {})],
      ["Remontée de nappe", `${txt("sensibilite_nappe", NAPPE)}${brut("sensibilite_nappe_fiabilite") ? ` (fiabilité ${brut("sensibilite_nappe_fiabilite")})` : ""}`],
      ["Radon", txt("bdnb_alea_radon")],
      ["Sismicité", txt("bdnb_alea_sismique")],
      ["Bruit (Lden max)", brut("bruit_lden_max_db") == null ? "moins de 55 dB ou non cartographié" : n("bruit_lden_max_db", " dB")],
      ["Source du bruit", brut("bruit_source") == null ? nd : String(brut("bruit_source")).replace(":", " ")],
      ["Ancien site industriel (CASIAS) le plus proche", n("distance_site_casias_m", " m")],
      ["Sites CASIAS à 500 m", n("nb_casias_500m")],
      ["Installation classée (ICPE) la plus proche", n("distance_icpe_m", " m")],
      ["Site Seveso à 1 km", oui("icpe_seveso_1km")],
      ["Monument historique le plus proche", n("distance_mh_m", " m")],
      ["Dans un périmètre MH (500 m)", oui("perimetre_mh_500m")],
    ]],
    ["Quartier (à 1 km)", [
      ["Écoles", `${n("nb_ecoles_1km")} · la plus proche à ${n("dist_ecole_proche_m", " m")}`],
      ["Collèges et lycées", n("nb_colleges_lycees_1km")],
      ["Médecins généralistes", n("nb_medecins_generalistes_1km")],
      ["Pharmacies", n("nb_pharmacies_1km")],
      ["Supermarchés", n("nb_supermarches_1km")],
      ["Boulangeries", n("nb_boulangeries_1km")],
      ["Commerces alimentaires", `${n("nb_commerces_alimentaires_1km")} · le plus proche à ${n("dist_commerce_alimentaire_proche_m", " m")}`],
      ["Gares", `${n("nb_gares_1km")} · la plus proche à ${n("dist_gare_proche_m", " m")}`],
      ["Niveau de vie moyen (carreau 200 m)", n("niveau_vie_moyen_carreau", " €/an")],
      ["Ménages pauvres (carreau)", pct("part_menages_pauvres_carreau")],
      ["Propriétaires (carreau)", pct("part_proprietaires_carreau")],
      ["Habitants (carreau)", n("nb_habitants_carreau")],
    ]],
  ];

  const estimer = new URLSearchParams({ commune: b.code_commune, type: b.type });
  for (const [cle, col] of [["surface", "surface_reelle_bati"], ["pieces", "nombre_pieces_principales"],
    ["annee_construction", "bat_annee_construction"], ["dpe", "dpe_classe"]] as const)
    if (brut(col) != null) estimer.set(cle, String(typeof brut(col) === "number" ? Math.round(Number(brut(col))) : brut(col)));
  if (brut("piscine")) estimer.set("piscine", "true");

  const titre = `${b.type} ${brut("surface_reelle_bati") != null ? `de ${n("surface_reelle_bati", " m²")} ` : ""}vendu${b.type === "Maison" ? "e" : ""} ${n("valeur_fonciere", " €")} à ${b.nom_commune}`;

  return (
    <main>
      <nav aria-label="Fil d'Ariane" className="ariane">
        <ol>
          <li><Link href="/">Loiret</Link></li>
          <li><Link href={`/commune/${encodeURIComponent(b.code_commune)}`}>{b.nom_commune}</Link></li>
          <li><span aria-current="page">Vente du {date("date_mutation")}</span></li>
        </ol>
      </nav>
      <p className="source">DVF (DGFiP) · BDNB · ADEME DPE · Géorisques · BRGM · Insee · cadastre DINUM · adresse non publiée</p>
      <h1>{titre}</h1>

      <div className="fiche-actions">
        <Link className="bouton" href={`/estimer?${estimer}`}>Estimer un bien comme celui-ci</Link>
      </div>

      <div className="fiche">
        <section className="panel" aria-labelledby="titre-plan">
          <h2 id="titre-plan">
            {parcelles.length} parcelle{parcelles.length > 1 ? "s" : ""} vendue{parcelles.length > 1 ? "s" : ""}
            {piscines.features.length ? `, ${piscines.features.length} piscine${piscines.features.length > 1 ? "s" : ""}` : ""}
          </h2>
          {centre ? <PlanCadastral centre={centre} parcelles={parcelles} piscines={piscines} /> : <p>Vente sans coordonnées : pas de plan.</p>}
          <ul className="legende">
            <li><span className="pastille" style={{ background: "#f2d14b" }} aria-hidden="true" /> parcelles de la vente (trait épais)</li>
            <li><span className="pastille" style={{ background: "#1c3d78", opacity: 0.25 }} aria-hidden="true" /> bâtiments</li>
            <li><span className="pastille" style={{ background: "#2a9fd6" }} aria-hidden="true" /> piscines</li>
          </ul>
          <p className="alternative">
            Plan cadastral centré sur la vente (repère au point géocodé) : parcelle{parcelles.length > 1 ? "s" : ""}{" "}
            {parcelles.join(", ") || "inconnues"} surlignée{parcelles.length > 1 ? "s" : ""} en jaune avec un contour épais,
            bâtiments en aplat, {piscines.features.length ? `${piscines.features.length} piscine(s) dessinée(s) en bleu` : "aucune piscine détectée"}.
          </p>
        </section>

        <section className="panel" aria-labelledby="titre-attention">
          <h2 id="titre-attention">
            {attention.length
              ? `${attention.length} point${attention.length > 1 ? "s" : ""} d'attention, dont ${alertes} alerte${alertes > 1 ? "s" : ""}`
              : "Aucun point d'attention relevé"}
          </h2>
          {attention.length > 0 && (
            <ul className="attention">
              {attention.map((a) => (
                <li key={a.facteur} className={a.niveau}>
                  <span className="niveau"><span aria-hidden="true">{NIVEAUX[a.niveau]?.icone} </span>{NIVEAUX[a.niveau]?.libelle ?? a.niveau}</span>
                  <p>{a.texte}</p>
                </li>
              ))}
            </ul>
          )}
          <p className="alternative">À vérifier sur place et dans l&apos;état des risques (ERP) fourni par le vendeur.</p>
        </section>

        <section className="panel" aria-labelledby="titre-comparaison">
          <h2 id="titre-comparaison">Comparaison à la commune</h2>
          <p className="constat">{constat}</p>
        </section>

        <section className="panel" aria-labelledby="titre-3d">
          <h2 id="titre-3d">Modèle 3D</h2>
          <Bien3D
            type={b.type}
            surface={num("surface_reelle_bati")}
            terrain={num("surface_terrain")}
            pieces={num("nombre_pieces_principales")}
            commune={b.nom_commune}
          />
          <p className="alternative">Modèle illustratif : dimensions réelles, agencement théorique (le plan réel est inconnu).</p>
        </section>

        {groupes.map(([nom, lignes]) => (
          <section key={nom} className="panel" aria-label={nom}>
            <h2>{nom}</h2>
            <dl className="infos">
              {lignes.map(([l, v]) => (
                <div key={l} style={{ display: "contents" }}>
                  <dt>{l}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </main>
  );
}
