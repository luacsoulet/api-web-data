"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import type { Map as CarteMap, Marker } from "maplibre-gl";

// Turbopack ne résout pas seul le worker de MapLibre 6 (voir ../Carte.tsx)
const WORKER = new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString();

/** Mini-carte : un clic place le point du bien et appelle `onChoix(lon, lat)`. */
export default function CarteClic({ onChoix, point }: { onChoix: (lon: number, lat: number) => void; point: [number, number] | null }) {
  const boite = useRef<HTMLDivElement>(null);
  const rappel = useRef(onChoix);
  const repere = useRef<Marker | null>(null);
  const carte = useRef<CarteMap | null>(null);

  useEffect(() => {
    rappel.current = onChoix;
  });

  useEffect(() => {
    let annule = false;
    import("maplibre-gl").then(({ Map, Marker, NavigationControl, setWorkerUrl }) => {
      if (annule || !boite.current) return;
      setWorkerUrl(WORKER);
      const map = new Map({
        container: boite.current,
        style: "https://tiles.openfreemap.org/styles/positron",
        center: [1.909, 47.9], // Orléans
        zoom: 9,
        dragRotate: false,
        maxPitch: 0,
        attributionControl: { compact: true },
      });
      map.touchZoomRotate.disableRotation();
      map.addControl(new NavigationControl({ showCompass: false }), "top-right");
      map.on("click", (e) => rappel.current(e.lngLat.lng, e.lngLat.lat));
      carte.current = map;
      repere.current = new Marker({ color: "#1c3d78" });
    });
    return () => {
      annule = true;
      carte.current?.remove();
      carte.current = null;
    };
  }, []);

  useEffect(() => {
    if (point && carte.current && repere.current) repere.current.setLngLat(point).addTo(carte.current);
  }, [point]);

  return (
    <div
      ref={boite}
      style={{ height: 260, border: "1px solid var(--ink)" }}
      role="img"
      aria-label="Carte du Loiret : cliquez pour placer le bien. Les champs de risque restent modifiables à la main."
    />
  );
}
