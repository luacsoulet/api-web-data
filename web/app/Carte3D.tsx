'use client';

import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';

import type { Point } from '@/lib/api';

import 'maplibre-gl/dist/maplibre-gl.css';

const CENTRE: [number, number] = [1.9, 47.9]; // [lng, lat] pour MapLibre

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

  const couleurBordure = type === 'Maison' ? '#22c55e' : '#3b82f6';

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://demotiles.maplibre.org/style.json',
      center: CENTRE,
      zoom: 12,
      pitch: 45, // inclinaison pour le relief 3D
      bearing: -17.6,
      canvasContextAttributes: { antialias: true },
    });

    map.on('load', () => {
      // Ajouter une couche de relief/extrusion si disponible dans le style
      try {
        // Activer le terrain si le style le supporte
        map.setTerrain({ source: 'demotiles' });
      } catch {
        // terrain non disponible sur ce style, on garde la 3D par le pitch
      }
      setLoaded(true);
    });

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
                `<strong>${p.nom_commune}</strong>` +
              `</div>` +
              `<p style="margin:2px 0"><strong>${p.type}</strong></p>` +
              `<p style="margin:2px 0">${p.prix_m2 != null ? p.prix_m2.toLocaleString('fr-FR') + ' €/m²' : 'n/d'}</p>` +
              `<p style="margin:2px 0"><em>${p.date ?? 'n/d'}</em></p>` +
            `</div>`
          )
        )
        .addTo(map);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [containerRef.current, points, type]);

  if (!loaded) {
    return (
      <div className="panel carte3d" style={{ height: '560px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        Chargement de la vue 3D…
      </div>
    );
  }

  return (
    <section className="panel carte3d">
      <div ref={containerRef} className="maplibre-container" style={{ height: '560px', width: '100%' }} />
      <p className="constat">
        Vue 3D / relief — {points.length} point{points.length > 1 ? 's' : ''} affichée{points.length > 1 ? 's' : ''}.
        Inclinez et faites tourner avec clic droit + souris.
      </p>
    </section>
  );
}

export default Carte3D;
