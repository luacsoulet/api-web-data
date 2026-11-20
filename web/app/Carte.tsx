"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Map as CarteMap, MapGeoJSONFeature } from "maplibre-gl";
import { EQUIPEMENTS, type Collection, type CommuneCarte, type VentePoint } from "@/lib/api";

// Turbopack ne résout pas seul le worker de MapLibre 6 : on lui donne son adresse (doc MapLibre, section Next.js)
const WORKER = new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString();

type Mode = "communes" | "ventes" | "deux";
type Props = {
  communes?: Collection<CommuneCarte>;
  ventes: Collection<VentePoint>;
  /** [ouest, sud, est, nord] */
  cadrage: [number, number, number, number];
  /** filtres actifs, recopiés dans les liens « Voir la commune » */
  qs: string;
  /** budget saisi (page Estimer) : ajoute l'écart au prix de chaque vente dans la fenêtre */
  budget?: number;
  /** remplace le titre-constat calculé (page Estimer) */
  titre?: string;
  /** page Autour : cercle du rayon et équipements qu'il contient */
  autour?: { centre: [number, number]; rayon: number };
};

/** Cercle en polygone GeoJSON (64 côtés), même approximation plane que l'API. */
function cercle([lon, lat]: [number, number], rayon: number) {
  const ring = Array.from({ length: 65 }, (_, i) => {
    const a = (i / 64) * 2 * Math.PI;
    return [lon + (rayon * Math.cos(a)) / (111_320 * Math.cos((lat * Math.PI) / 180)), lat + (rayon * Math.sin(a)) / 110_540];
  });
  return { type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: [ring] } };
}

// Couleurs pour MapLibre (le canvas ne lit pas les variables CSS) : un seul ton, clair → bleu encre ;
// en sombre la rampe s'inverse pour que les prix élevés ressortent sur le fond nuit.
const RAMPES = {
  clair: ["#dbe6f3", "#a9c3e3", "#6f97cc", "#3d67a8", "#1c3d78"],
  sombre: ["#2a3f66", "#3f5f94", "#5f86c0", "#8fb0e0", "#c9dbf5"],
};
const FOND = {
  clair: { style: "https://tiles.openfreemap.org/styles/positron", trait: "#1c3d78", papier: "#ffffff" },
  sombre: { style: "https://tiles.openfreemap.org/styles/dark", trait: "#c9dbf5", papier: "#16213a" },
};
const COUCHES: Record<Mode, string[]> = {
  communes: ["communes-prix", "communes-faible", "communes-contour"],
  ventes: ["ventes-groupes", "ventes-nombre", "ventes-points"],
  deux: [],
};

// Couches thématiques servies par Next (/public/couches) : [valeur de la propriété, libellé, couleur], dans l'ordre de dessin
// (les scénarios de crue sont imbriqués : l'extrême, le plus large, d'abord).
const THEMES = {
  argile: { libelle: "Argile (retrait-gonflement)", prop: "alea", classes: [
    ["moyen", "aléa moyen", "#e0a43a"], ["fort", "aléa fort", "#a64b1c"]] },
  inondation: { libelle: "Zones inondables (Loire, TRI 2020)", prop: "scenario", classes: [
    ["extreme", "crue extrême (rare)", "#a6cee3"], ["moyen", "crue moyenne (centennale)", "#3a87c8"], ["frequent", "crue fréquente", "#0b3d78"]] },
  nappes: { libelle: "Remontées de nappe", prop: "sensibilite", classes: [
    ["inondation_cave", "inondation de cave possible", "#b7a6dc"], ["debordement_nappe", "débordement de nappe possible", "#5b3a9e"]] },
} as const;
type Theme = keyof typeof THEMES;
const FAMILLES = {
  medecin: { libelle: "médecins et pharmacies", valeurs: ["medecin", "pharmacie"] },
  ecole: { libelle: "écoles, collèges et lycées", valeurs: ["ecole", "college_lycee"] },
  commerce: { libelle: "commerces alimentaires", valeurs: ["commerce_alimentaire"] },
  gare: { libelle: "gares", valeurs: ["gare"] },
} as const;
type Famille = keyof typeof FAMILLES;
const CHALEUR = ["#fde8a8", "#f5b041", "#d35400", "#8e2c06"];
const CADASTRE = "https://openmaptiles.data.gouv.fr/data/cadastre/{z}/{x}/{y}.pbf";
const ARGILE: Record<string, string> = { faible: "faible", moyen: "moyen", fort: "fort" };
const CRUE: Record<string, string> = { frequent: "crue fréquente", moyen: "crue moyenne", extreme: "crue extrême" };

const nombre = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });
const echappe = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const ou = (v: unknown, unite = "") => (v == null || v === "" ? "n/d" : `${nombre.format(Number(v))}${unite}`);

const ecart = (d: number) =>
  d === 0 ? "0 € (au prix de votre budget)" : `${d > 0 ? "+" : "−"}${nombre.format(Math.abs(d))} € (${d > 0 ? "plus cher" : "moins cher"} que votre budget)`;

// Quantiles (20/40/60/80 %) : 4 seuils pour 5 classes.
function seuils(valeurs: number[]) {
  const v = [...valeurs].sort((a, b) => a - b);
  if (v.length < 5) return [1500, 2000, 2500, 3000];
  return [0.2, 0.4, 0.6, 0.8].map((p) => Math.round(v[Math.floor(p * (v.length - 1))] / 50) * 50);
}

function sombreActif() {
  return document.documentElement.dataset.theme === "dark";
}
function abonneTheme(rappel: () => void) {
  const obs = new MutationObserver(rappel);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}

export default function Carte({ communes, ventes, cadrage, qs, budget, titre, autour }: Props) {
  const boite = useRef<HTMLDivElement>(null);
  const carte = useRef<CarteMap | null>(null);
  const [mode, setMode] = useState<Mode>(communes ? "deux" : "ventes");
  const [prete, setPrete] = useState(false);
  const [couches, setCouches] = useState<Record<Theme | "attractivite", boolean>>({
    argile: false, inondation: false, nappes: false, attractivite: false });
  const [famille, setFamille] = useState<Famille>("medecin");
  const sombre = useSyncExternalStore(abonneTheme, sombreActif, () => false);
  const theme = sombre ? "sombre" : "clair";

  const fiables = communes?.features.filter((f) => f.properties.n >= 5) ?? [];
  const bornes = seuils(
    communes
      ? fiables.map((f) => f.properties.prix_m2_median!).filter((v) => v != null)
      : ventes.features.map((f) => f.properties.prix_m2!).filter((v) => v != null),
  );
  const rampe = RAMPES[theme];
  const couleur = ["step", ["get", "prix_m2_median"], rampe[0], bornes[0], rampe[1], bornes[1], rampe[2], bornes[2], rampe[3], bornes[3], rampe[4]];
  const cle = JSON.stringify(bornes);

  // Carte recréée seulement si le thème ou les données changent (le fond de carte change avec le thème).
  useEffect(() => {
    let annule = false;
    const reduit = matchMedia("(prefers-reduced-motion: reduce)").matches;
    import("maplibre-gl").then(({ Map, Marker, NavigationControl, Popup, setWorkerUrl }) => {
      if (annule || !boite.current) return;
      setWorkerUrl(WORKER);
      const fond = FOND[theme];
      const map = new Map({
        container: boite.current,
        style: fond.style,
        bounds: cadrage,
        fitBoundsOptions: { padding: 16 },
        dragRotate: false,
        pitchWithRotate: false,
        maxPitch: 0,
        attributionControl: { compact: true },
      });
      carte.current = map;
      map.touchZoomRotate.disableRotation();
      map.keyboard.disableRotation();
      map.addControl(new NavigationControl({ showCompass: false }), "top-right");

      map.on("load", () => {
        // Hachures 8×8 pour les communes à moins de 5 ventes : prix trop fragile pour une couleur.
        const t = 8;
        const px = new Uint8Array(t * t * 4);
        for (let i = 0; i < t; i++) px.set([128, 128, 128, 200], ((i * t + (t - 1 - i)) * 4));
        map.addImage("hachure", { width: t, height: t, data: px });

        if (communes) {
          map.addSource("communes", { type: "geojson", data: communes as never, promoteId: "code_insee" });
          map.addLayer({ id: "communes-prix", type: "fill", source: "communes", filter: [">=", ["get", "n"], 5],
            paint: { "fill-color": couleur as never, "fill-opacity": 0.72 } });
          map.addLayer({ id: "communes-faible", type: "fill", source: "communes", filter: ["<", ["get", "n"], 5],
            paint: { "fill-pattern": "hachure" } });
          map.addLayer({ id: "communes-contour", type: "line", source: "communes",
            paint: {
              "line-color": fond.trait,
              "line-width": ["case", ["boolean", ["feature-state", "survol"], false], 2.5, 0.4],
            } });
        }

        // plan cadastral : tuiles chargées seulement à partir du zoom 15 (minzoom des couches)
        map.addSource("cadastre", { type: "vector", tiles: [CADASTRE], minzoom: 11, maxzoom: 16, attribution: "© DINUM - cadastre" });
        map.addLayer({ id: "cadastre-batiments", type: "fill", source: "cadastre", "source-layer": "batiments", minzoom: 15,
          paint: { "fill-color": fond.trait, "fill-opacity": 0.15 } });
        map.addLayer({ id: "cadastre-parcelles", type: "line", source: "cadastre", "source-layer": "parcelles", minzoom: 15,
          paint: { "line-color": fond.trait, "line-width": 0.6, "line-opacity": 0.7 } });

        if (autour) {
          const zone = cercle(autour.centre, autour.rayon);
          map.addSource("cercle", { type: "geojson", data: zone });
          map.addLayer({ id: "cercle-fond", type: "fill", source: "cercle", paint: { "fill-color": fond.trait, "fill-opacity": 0.06 } });
          map.addLayer({ id: "cercle-trait", type: "line", source: "cercle",
            paint: { "line-color": fond.trait, "line-width": 2, "line-dasharray": [3, 2] } });
          // équipements du rayon seulement : filtre « within » sur le cercle, côté carte
          map.addSource("autour-equipements", { type: "geojson", data: "/couches/equipements.geojson" });
          map.addLayer({ id: "autour-equipements", type: "circle", source: "autour-equipements", filter: ["within", zone] as never,
            paint: {
              "circle-color": ["match", ["get", "famille"], ...Object.entries(EQUIPEMENTS).flatMap(([f, e]) => [f, e.couleur]), "#888888"] as never,
              "circle-radius": 5,
              "circle-stroke-color": fond.papier,
              "circle-stroke-width": 1.5,
            } });
          new Marker({ color: fond.trait }).setLngLat(autour.centre).addTo(map);
        }

        map.addSource("ventes", { type: "geojson", data: ventes as never, cluster: true, clusterMaxZoom: 13, clusterRadius: 40 });
        map.addLayer({ id: "ventes-groupes", type: "circle", source: "ventes", filter: ["has", "point_count"],
          paint: {
            "circle-color": fond.trait,
            "circle-opacity": 0.85,
            "circle-radius": ["step", ["get", "point_count"], 12, 20, 16, 100, 22, 500, 28],
            "circle-stroke-color": fond.papier,
            "circle-stroke-width": 1.5,
          } });
        map.addLayer({ id: "ventes-nombre", type: "symbol", source: "ventes", filter: ["has", "point_count"],
          layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": ["Noto Sans Regular"], "text-size": 12 },
          paint: { "text-color": fond.papier } });
        map.addLayer({ id: "ventes-points", type: "circle", source: "ventes", filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": ["step", ["coalesce", ["get", "prix_m2"], 0], rampe[0], bornes[0], rampe[1], bornes[1], rampe[2], bornes[2], rampe[3], bornes[3], rampe[4]],
            "circle-radius": 6,
            "circle-stroke-color": fond.trait,
            "circle-stroke-width": 1.5,
          } });
        setPrete(true);
      });

      let survol: string | number | undefined;
      const quitter = () => {
        if (survol !== undefined) map.setFeatureState({ source: "communes", id: survol }, { survol: false });
        survol = undefined;
      };
      for (const id of ["communes-prix", "communes-faible"]) {
        map.on("mousemove", id, (e) => {
          const f = e.features?.[0];
          if (!f || f.id === survol) return;
          quitter();
          survol = f.id;
          map.setFeatureState({ source: "communes", id: survol! }, { survol: true });
        });
        map.on("mouseleave", id, quitter);
      }
      for (const id of ["communes-prix", "communes-faible", "ventes-groupes", "ventes-points"]) {
        map.on("mouseenter", id, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", id, () => (map.getCanvas().style.cursor = ""));
      }

      const ouvrir = (lngLat: [number, number] | { lng: number; lat: number }, html: string) =>
        new Popup({ maxWidth: "260px", focusAfterOpen: true }).setLngLat(lngLat).setHTML(html).addTo(map);

      map.on("click", async (e) => {
        const ordre = ["ventes-groupes", "ventes-points", "communes-prix", "communes-faible"].filter((l) => map.getLayer(l));
        const f: MapGeoJSONFeature | undefined = map.queryRenderedFeatures(e.point, { layers: ordre })[0];
        if (!f) return;
        const p = f.properties;
        const centre = (f.geometry as { coordinates: [number, number] }).coordinates;
        if (f.layer.id === "ventes-groupes") {
          const source = map.getSource("ventes") as import("maplibre-gl").GeoJSONSource;
          const zoom = await source.getClusterExpansionZoom(p.cluster_id);
          map.easeTo({ center: centre, zoom, duration: reduit ? 0 : 500 });
        } else if (f.layer.id === "ventes-points") {
          const options = [p.avec_jardin && "jardin", p.avec_dependance && "dépendance", p.piscine && "piscine"].filter(Boolean).join(", ");
          const risques = [
            p.alea_argile && `argile ${echappe(ARGILE[p.alea_argile] ?? p.alea_argile)}`,
            p.zone_inondable_scenario && `zone inondable (${echappe(CRUE[p.zone_inondable_scenario] ?? p.zone_inondable_scenario)})`,
          ].filter(Boolean).join(" · ");
          ouvrir(centre, `<strong>${ou(p.valeur_fonciere, " €")}</strong>
            <p>${echappe(p.type)} · ${ou(p.surface_reelle_bati, " m²")} · ${ou(p.nombre_pieces_principales)} pièces</p>
            <p>${ou(p.prix_m2, " €/m²")} · ${p.date_mutation ? date.format(new Date(p.date_mutation)) : "n/d"}${p.distance_m != null ? ` · à ${ou(p.distance_m, " m")}` : ""}</p>
            <p>${echappe(p.nom_commune)}${p.section ? `, section ${echappe(p.section)}` : ""}</p>
            <p>${options ? `Avec ${options}` : "Sans jardin, dépendance ni piscine"}</p>
            <p>DPE ${p.dpe_classe ? echappe(p.dpe_classe) : "n/d"}${p.bat_annee_construction ? ` · construit en ${echappe(p.bat_annee_construction)}` : ""}</p>${
              risques ? `<p>${risques}</p>` : ""}${
              budget ? `<p>Écart avec votre budget : <strong>${ecart(p.valeur_fonciere - budget)}</strong></p>` : ""}
            <p><a class="bouton" href="/vente/${encodeURIComponent(p.id_mutation)}" aria-label="Voir plus : fiche complète et plan cadastral">Voir plus</a></p>`);
        } else {
          ouvrir(e.lngLat, `<strong>${echappe(p.commune)}</strong>
            <p>${ou(p.prix_m2_median, " €/m²")} médian · ${ou(p.n)} ventes${p.n < 5 ? " (trop peu pour conclure)" : ""}</p>
            <p><a href="/commune/${encodeURIComponent(p.code_insee)}?${echappe(qs)}">Voir la commune</a></p>`);
        }
      });
    });
    return () => {
      annule = true;
      carte.current?.remove();
      carte.current = null;
      setPrete(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- couleur/rampe dérivent de theme et cle
  }, [theme, communes, ventes, cadrage, qs, cle, budget, autour]);

  // La bascule ne fait que masquer des couches : pas de rechargement.
  useEffect(() => {
    const map = carte.current;
    if (!map || !prete) return;
    for (const [m, couches] of Object.entries(COUCHES))
      for (const id of couches)
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", mode === "deux" || mode === m ? "visible" : "none");
  }, [mode, prete]);

  // Couches thématiques : source chargée au premier affichage seulement (fichiers de 0,4 à 2 Mo), puis masquée/affichée.
  useEffect(() => {
    const map = carte.current;
    if (!map || !prete) return;
    for (const [cle, t] of Object.entries(THEMES) as [Theme, (typeof THEMES)[Theme]][]) {
      const id = `couche-${cle}`;
      if (couches[cle] && !map.getSource(cle)) {
        const couleur = ["match", ["get", t.prop], ...t.classes.flatMap(([v, , c]) => [v, c]), "#888888"];
        const ordre = ["match", ["get", t.prop], ...t.classes.flatMap(([v], i) => [v, i]), 0];
        map.addSource(cle, { type: "geojson", data: `/couches/${cle}.geojson` });
        map.addLayer({ id, type: "fill", source: cle, layout: { "fill-sort-key": ordre as never },
          paint: { "fill-color": couleur as never, "fill-opacity": 0.45 } }, "cadastre-batiments");
      }
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", couches[cle] ? "visible" : "none");
    }
    const filtre = ["in", ["get", "famille"], ["literal", [...FAMILLES[famille].valeurs]]];
    if (couches.attractivite && !map.getSource("equipements")) {
      map.addSource("equipements", { type: "geojson", data: "/couches/equipements.geojson" });
      map.addLayer({ id: "attractivite-chaleur", type: "heatmap", source: "equipements", maxzoom: 16,
        paint: {
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 8, 12, 13, 40],
          "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 13, 0.8, 16, 0.2],
          "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(0,0,0,0)",
            0.2, CHALEUR[0], 0.45, CHALEUR[1], 0.7, CHALEUR[2], 1, CHALEUR[3]],
        } }, "cadastre-batiments");
      // au zoom fin, la chaleur s'efface au profit des équipements eux-mêmes
      map.addLayer({ id: "attractivite-points", type: "circle", source: "equipements", minzoom: 13,
        paint: { "circle-color": CHALEUR[3], "circle-radius": 5, "circle-stroke-color": "#ffffff", "circle-stroke-width": 1.5 } },
        "cadastre-batiments");
    }
    for (const id of ["attractivite-chaleur", "attractivite-points"])
      if (map.getLayer(id)) {
        map.setFilter(id, filtre as never);
        map.setLayoutProperty(id, "visibility", couches.attractivite ? "visible" : "none");
      }
  }, [couches, famille, prete]);

  // constat sur des communes assez vendues pour être fiables (20 ventes), sinon sur toutes celles à 5+
  const solides = fiables.filter((f) => f.properties.n >= 20);
  const tri = [...(solides.length >= 2 ? solides : fiables)].sort((a, b) => b.properties.prix_m2_median! - a.properties.prix_m2_median!);
  const haut = tri[0]?.properties;
  const bas = tri[tri.length - 1]?.properties;
  const phrase = communes
    ? haut && bas
      ? `Parmi ${tri.length} communes avec au moins ${solides.length >= 2 ? 20 : 5} ventes, ${haut.commune} est la plus chère (${ou(haut.prix_m2_median, " €/m²")} sur ${ou(haut.n)} ventes) et ${bas.commune} la moins chère (${ou(bas.prix_m2_median, " €/m²")} sur ${ou(bas.n)} ventes). ${ou(ventes.features.length)} ventes sont placées en points.`
      : "Aucune commune n'a au moins 5 ventes pour cette recherche."
    : autour
      ? `Cercle de ${ou(autour.rayon)} m autour de l'adresse cherchée (repère au centre) : ${ou(ventes.features.length)} ventes colorées selon leur prix au m², et les équipements du rayon en points colorés par famille (détail dans « À proximité »).`
      : `${ou(ventes.features.length)} ventes géolocalisées de la commune, colorées selon leur prix au m².`;

  const etiquettes = [
    `moins de ${ou(bornes[0])}`,
    `${ou(bornes[0])} à ${ou(bornes[1])}`,
    `${ou(bornes[1])} à ${ou(bornes[2])}`,
    `${ou(bornes[2])} à ${ou(bornes[3])}`,
    `${ou(bornes[3])} et plus`,
  ];

  const actives = [
    ...(Object.keys(THEMES) as Theme[]).filter((c) => couches[c])
      .map((c) => `${THEMES[c].libelle} (${THEMES[c].classes.map(([, l]) => l).join(", ")})`),
    ...(couches.attractivite ? [`densité de ${FAMILLES[famille].libelle}`] : []),
  ];
  const aucuneCouche = actives.length === 0;

  // titre-constat quand la carte ne montre que des ventes (page commune)
  const prixVentes = ventes.features.map((f) => f.properties.prix_m2).filter((p): p is number => p != null).sort((a, b) => a - b);
  const medianeVentes = prixVentes.length ? prixVentes[Math.floor(prixVentes.length / 2)] : null;

  return (
    <section className="panel carte-panneau" aria-labelledby="titre-carte">
      <h2 id="titre-carte">{titre ?? (communes && haut && bas
          ? `${haut.commune} la plus chère (${ou(haut.prix_m2_median, " €/m²")}), ${bas.commune} la moins chère (${ou(bas.prix_m2_median, " €/m²")})`
          : medianeVentes != null
            ? `${ou(ventes.features.length)} vente${ventes.features.length > 1 ? "s" : ""} sur la carte, médiane ${ou(medianeVentes, " €/m²")}`
            : "Aucune vente géolocalisée pour cette recherche")}</h2>
      {communes && (
        <div className="segments" role="group" aria-label="Couches affichées">
          {(
            [
              ["communes", "Communes"],
              ["ventes", "Ventes"],
              ["deux", "Les deux"],
            ] as const
          ).map(([m, libelle]) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
              {libelle}
            </button>
          ))}
        </div>
      )}
      <fieldset className="couches">
        <legend className="label">Couches thématiques</legend>
        {(Object.entries(THEMES) as [Theme, (typeof THEMES)[Theme]][]).map(([cle, t]) => (
          <label key={cle} className="case">
            <input type="checkbox" checked={couches[cle]} onChange={(e) => setCouches((c) => ({ ...c, [cle]: e.target.checked }))} />
            {t.libelle}
          </label>
        ))}
        <label className="case">
          <input type="checkbox" checked={couches.attractivite}
            onChange={(e) => setCouches((c) => ({ ...c, attractivite: e.target.checked }))} />
          Attractivité (densité d&apos;équipements)
        </label>
        {couches.attractivite && (
          <div className="familles" role="radiogroup" aria-label="Équipements comptés dans l'attractivité">
            {(Object.entries(FAMILLES) as [Famille, (typeof FAMILLES)[Famille]][]).map(([cle, f]) => (
              <label key={cle}>
                <input type="radio" name="famille" checked={famille === cle} onChange={() => setFamille(cle)} />
                {f.libelle}
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <div ref={boite} className="carte" role="region" aria-label="Carte interactive (zoom au clavier avec + et -)" />
      <ul className="legende" aria-label="Légende, prix au m²">
        {etiquettes.map((t, i) => (
          <li key={t}>
            <span className="pastille" style={{ background: rampe[i] }} aria-hidden="true" />
            {t} €/m²
          </li>
        ))}
        {communes && (
          <li>
            <span className="pastille hachure" aria-hidden="true" />
            moins de 5 ventes
          </li>
        )}
        <li>
          <span className="pastille groupe" aria-hidden="true" />
          cercle chiffré : groupe de ventes, cliquer pour zoomer
        </li>
        <li>dès le zoom 15 : plan cadastral (traits = parcelles, aplats = bâtiments)</li>
      </ul>
      {autour && (
        <ul className="legende" aria-label="Légende, équipements dans le rayon">
          <li><strong>Équipements dans le rayon :</strong></li>
          {Object.entries(EQUIPEMENTS).map(([f, e]) => (
            <li key={f}>
              <span className="pastille point" style={{ background: e.couleur }} aria-hidden="true" />
              {e.libelle}
            </li>
          ))}
        </ul>
      )}
      {(Object.keys(THEMES) as Theme[]).filter((c) => couches[c]).map((c) => (
        <ul key={c} className="legende" aria-label={`Légende, ${THEMES[c].libelle}`}>
          <li><strong>{THEMES[c].libelle} :</strong></li>
          {THEMES[c].classes.map(([v, l, coul]) => (
            <li key={v}>
              <span className="pastille" style={{ background: coul, opacity: 0.7 }} aria-hidden="true" />
              {l}
            </li>
          ))}
        </ul>
      ))}
      {couches.attractivite && (
        <ul className="legende" aria-label="Légende, attractivité">
          <li><strong>Attractivité ({FAMILLES[famille].libelle}) :</strong></li>
          {["peu", "assez", "beaucoup", "très dense"].map((l, i) => (
            <li key={l}>
              <span className="pastille" style={{ background: CHALEUR[i] }} aria-hidden="true" />
              {l}
            </li>
          ))}
          <li>
            <span className="pastille point" style={{ background: CHALEUR[3] }} aria-hidden="true" />
            dès le zoom 13 : un point par équipement
          </li>
        </ul>
      )}
      <p className="alternative">
        {phrase}
        {aucuneCouche ? "" : ` Couches affichées : ${actives.join(" ; ")}.`}
      </p>
    </section>
  );
}
