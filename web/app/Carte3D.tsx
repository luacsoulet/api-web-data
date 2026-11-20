'use client';

import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';

import type { Point } from '@/lib/api';

import 'maplibre-gl/dist/maplibre-gl.css';

const CENTRE: [number, number] = [1.9, 47.9]; // [lng, lat] pour MapLibre

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function Carte3D({
  points,
  type,
}: {
  points: Point[];
  type: string;
}) {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    setLoaded(false);

    const map = new maplibregl.Map({
      container: containerRef.current,
      // liberty (OpenFreeMap, même fournisseur que Carte.tsx) inclut les bâtiments extrudés en 3D
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: CENTRE,
      zoom: 15,
      pitch: 60, // inclinaison pour voir les volumes
      bearing: -17.6,
      canvasContextAttributes: { antialias: true },
    });

    map.on('load', () => setLoaded(true));

    mapRef.current = map;

    // Ajouter des marqueurs HTML pour les points
    points.slice(0, 300).forEach((p) => {
      if (p.latitude == null || p.longitude == null) return;

      const el = document.createElement('div');
      el.style.width = '12px';
      el.style.height = '12px';
      el.style.borderRadius = '50%';
      el.style.background = type === 'Maison' ? '#22c55e' : '#3b82f6';
      el.style.border = '2px solid white';
      el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
      el.style.cursor = 'pointer';
      el.title = `${p.nom_commune} · ${p.type}`;

      new maplibregl.Marker(el)
        .setLngLat([p.longitude, p.latitude])
        .setPopup(
          new maplibregl.Popup({ offset: 25 }).setHTML(
            `<div style="min-width:160px; font-family: system-ui, sans-serif; font-size: 14px;">` +
              `<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">` +
                `<div style="width:10px;height:10px;border-radius:50%;background:${type === 'Maison' ? '#22c55e' : '#3b82f6'};border:2px solid white;"></div>` +
                `<strong>${esc(p.nom_commune)}</strong>` +
              `</div>` +
              `<p style="margin:2px 0"><strong>${esc(p.type)}</strong></p>` +
              `<p style="margin:2px 0">${p.prix_m2 != null ? p.prix_m2.toLocaleString('fr-FR') + ' €/m²' : 'n/d'}</p>` +
              `<p style="margin:2px 0"><em>${esc(p.date ?? 'n/d')}</em></p>` +
            `<p style="margin:6px 0 0"><a href="/bien/${encodeURIComponent(p.id_mutation)}">Voir la fiche du bien</a></p>` +
            `</div>`
          )
        )
        .addTo(map);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [points, type]);

  // Le conteneur doit toujours être rendu : la carte s'y attache avant le 'load'.
  return (
    <section className="panel carte3d">
      <div ref={containerRef} className="maplibre-container" style={{ height: '560px', width: '100%' }} />
      {!loaded && <p className="constat" role="status">Chargement de la vue 3D…</p>}
      <p className="constat">
        Vue 3D / relief — {points.length} point{points.length > 1 ? 's' : ''} affichée{points.length > 1 ? 's' : ''}.
        Inclinez et faites tourner avec clic droit + souris.
      </p>
    </section>
  );
}

export default Carte3D;
