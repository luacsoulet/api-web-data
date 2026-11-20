"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import type { Collection } from "@/lib/api";

const WORKER = new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString();
const CADASTRE = "https://openmaptiles.data.gouv.fr/data/cadastre/{z}/{x}/{y}.pbf";
// couleurs fixes (le canvas ne lit pas les variables CSS) : surlignage jaune « --highlight », traits encre, piscines bleues
const ENCRE = "#1c3d78";
const SURLIGNE = "#f2d14b";
const EAU = "#2a9fd6";

/** Plan cadastral centré sur la vente : ses parcelles surlignées (propriété `id` des tuiles), bâtiments, piscines. */
export default function PlanCadastral({ centre, parcelles, piscines }: {
  centre: [number, number];
  parcelles: string[];
  piscines: Collection<unknown>;
}) {
  const boite = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let annule = false;
    let detruire = () => {};
    import("maplibre-gl").then(({ Map, Marker, NavigationControl, setWorkerUrl }) => {
      if (annule || !boite.current) return;
      setWorkerUrl(WORKER);
      const map = new Map({
        container: boite.current,
        style: "https://tiles.openfreemap.org/styles/positron",
        center: centre,
        zoom: 17.5,
        dragRotate: false,
        maxPitch: 0,
        attributionControl: { compact: true },
      });
      detruire = () => map.remove();
      map.touchZoomRotate.disableRotation();
      map.keyboard.disableRotation();
      map.addControl(new NavigationControl({ showCompass: false }), "top-right");
      map.on("load", () => {
        const siennes = ["in", ["get", "id"], ["literal", parcelles]];
        map.addSource("cadastre", { type: "vector", tiles: [CADASTRE], minzoom: 11, maxzoom: 16, attribution: "© DINUM - cadastre" });
        map.addLayer({ id: "parcelles-vente", type: "fill", source: "cadastre", "source-layer": "parcelles",
          filter: siennes as never, paint: { "fill-color": SURLIGNE, "fill-opacity": 0.6 } });
        map.addLayer({ id: "batiments", type: "fill", source: "cadastre", "source-layer": "batiments",
          paint: { "fill-color": ENCRE, "fill-opacity": 0.25, "fill-outline-color": ENCRE } });
        map.addLayer({ id: "parcelles", type: "line", source: "cadastre", "source-layer": "parcelles",
          paint: { "line-color": ENCRE, "line-width": 0.8 } });
        map.addLayer({ id: "parcelles-vente-contour", type: "line", source: "cadastre", "source-layer": "parcelles",
          filter: siennes as never, paint: { "line-color": ENCRE, "line-width": 3 } });
        map.addLayer({ id: "parcelles-numero", type: "symbol", source: "cadastre", "source-layer": "parcelles", minzoom: 17,
          layout: { "text-field": ["get", "numero"], "text-font": ["Noto Sans Regular"], "text-size": 11 },
          paint: { "text-color": ENCRE, "text-halo-color": "#ffffff", "text-halo-width": 1.5 } });
        map.addSource("piscines", { type: "geojson", data: piscines as never });
        map.addLayer({ id: "piscines", type: "fill", source: "piscines",
          paint: { "fill-color": EAU, "fill-opacity": 0.8, "fill-outline-color": ENCRE } });
        new Marker({ color: ENCRE }).setLngLat(centre).addTo(map);
      });
    });
    return () => {
      annule = true;
      detruire();
    };
  }, [centre, parcelles, piscines]);

  return <div ref={boite} className="plan" role="region" aria-label="Plan cadastral interactif (zoom au clavier avec + et -)" />;
}
