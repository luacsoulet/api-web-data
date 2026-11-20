"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Map as CarteMap, MapGeoJSONFeature } from "maplibre-gl";
import type { Collection, CommuneCarte, VentePoint } from "@/lib/api";

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
};

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

const nombre = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });
const echappe = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const ou = (v: unknown, unite = "") => (v == null || v === "" ? "n/d" : `${nombre.format(Number(v))}${unite}`);

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

export default function Carte({ communes, ventes, cadrage, qs }: Props) {
  const boite = useRef<HTMLDivElement>(null);
  const carte = useRef<CarteMap | null>(null);
  const [mode, setMode] = useState<Mode>(communes ? "deux" : "ventes");
  const [prete, setPrete] = useState(false);
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
    import("maplibre-gl").then(({ Map, NavigationControl, Popup, setWorkerUrl }) => {
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
          const options = [p.avec_jardin && "jardin", p.avec_dependance && "dépendance"].filter(Boolean).join(", ");
          ouvrir(centre, `<strong>${ou(p.valeur_fonciere, " €")}</strong>
            <p>${echappe(p.type)} · ${ou(p.surface_reelle_bati, " m²")} · ${ou(p.nombre_pieces_principales)} pièces</p>
            <p>${ou(p.prix_m2, " €/m²")} · ${p.date_mutation ? date.format(new Date(p.date_mutation)) : "n/d"}</p>
            <p>${echappe(p.nom_commune)}${p.section ? `, section ${echappe(p.section)}` : ""}</p>
            <p>${options ? `Avec ${options}` : "Sans jardin ni dépendance"}</p>`);
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
  }, [theme, communes, ventes, cadrage, qs, cle]);

  // La bascule ne fait que masquer des couches : pas de rechargement.
  useEffect(() => {
    const map = carte.current;
    if (!map || !prete) return;
    for (const [m, couches] of Object.entries(COUCHES))
      for (const id of couches)
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", mode === "deux" || mode === m ? "visible" : "none");
  }, [mode, prete]);

  // constat sur des communes assez vendues pour être fiables (20 ventes), sinon sur toutes celles à 5+
  const solides = fiables.filter((f) => f.properties.n >= 20);
  const tri = [...(solides.length >= 2 ? solides : fiables)].sort((a, b) => b.properties.prix_m2_median! - a.properties.prix_m2_median!);
  const haut = tri[0]?.properties;
  const bas = tri[tri.length - 1]?.properties;
  const phrase = communes
    ? haut && bas
      ? `Parmi ${tri.length} communes avec au moins ${solides.length >= 2 ? 20 : 5} ventes, ${haut.commune} est la plus chère (${ou(haut.prix_m2_median, " €/m²")} sur ${ou(haut.n)} ventes) et ${bas.commune} la moins chère (${ou(bas.prix_m2_median, " €/m²")} sur ${ou(bas.n)} ventes). ${ou(ventes.features.length)} ventes sont placées en points.`
      : "Aucune commune n'a au moins 5 ventes pour cette recherche."
    : `${ou(ventes.features.length)} ventes géolocalisées de la commune, colorées selon leur prix au m².`;

  const etiquettes = [
    `moins de ${ou(bornes[0])}`,
    `${ou(bornes[0])} à ${ou(bornes[1])}`,
    `${ou(bornes[1])} à ${ou(bornes[2])}`,
    `${ou(bornes[2])} à ${ou(bornes[3])}`,
    `${ou(bornes[3])} et plus`,
  ];

  return (
    <section className="panel carte-panneau" aria-labelledby="titre-carte">
      <h2 id="titre-carte">{communes && haut && bas
          ? `${haut.commune} la plus chère (${ou(haut.prix_m2_median, " €/m²")}), ${bas.commune} la moins chère (${ou(bas.prix_m2_median, " €/m²")})`
          : "Ventes sur la carte"}</h2>
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
      </ul>
      <p className="alternative">{phrase}</p>
    </section>
  );
}
