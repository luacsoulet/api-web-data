'use client';

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useState } from "react";
import dynamic from "next/dynamic";

import type { Point } from "@/lib/api";
import type { Commune } from "@/lib/api";
import { IconeTypeBien } from "./icone";

const Maison3D = dynamic(() => import("./Maison3D"), { ssr: false }) as React.ComponentType<{
  point: Point | null;
  communes: { nom_commune: string; prix_m2_median: number | null }[];
}>;

const CENTRE: [number, number] = [47.9, 1.9];

function fmtFr(v: number | null): string {
  if (v == null) return "n/d";
  return v.toLocaleString("fr-FR");
}

function medianeCommune(communes: Commune[], nom: string): number | null {
  const c = communes.find((x) => x.nom_commune === nom);
  return c ? c.prix_m2_median : null;
}

export function CarteMarqueurs({
  points,
  communes,
  type,
}: {
  points: Point[];
  communes: Commune[];
  type: string;
}) {
  const [selected, setSelected] = useState<Point | null>(null);

  // Vue détail (drill-down) : un bien sélectionné
  if (selected) {
    const med = medianeCommune(communes, selected.nom_commune);
    let comparo = "commune non référencée";
    if (med != null && selected.prix_m2 != null) {
      comparo =
        selected.prix_m2 > med
          ? `au-dessus de la médiane de ${selected.nom_commune} (${fmtFr(med)} €/m²)`
          : `en-dessous de la médiane de ${selected.nom_commune} (${fmtFr(med)} €/m²)`;
    } else if (med != null) {
      comparo = `prix m² non disponible (médiane ${selected.nom_commune} : ${fmtFr(med)} €/m²)`;
    }

    const couleurBordure = selected.type === "Maison" ? "#22c55e" : "#3b82f6";

    return (
      <section className="panel fiche" aria-labelledby="titre-fiche">
        <div className="fiche-header">
          <IconeTypeBien type={selected.type as any} />
          <h2 id="titre-fiche">Détail du bien</h2>
          <button
            className="bouton-fermer"
            onClick={() => setSelected(null)}
            aria-label="Fermer la fiche"
          >
            ✕
          </button>
        </div>
        <p>
          <strong>Commune :</strong> {selected.nom_commune}
        </p>
        <p>
          <strong>Type :</strong>{" "}
          <span className={`badge-type ${selected.type === "Maison" ? "maison" : "appartement"}`}>
            {selected.type}
          </span>
        </p>
        <p>
          <strong>Prix :</strong>{" "}
          {selected.prix != null ? fmtFr(selected.prix) + " €" : "n/d"}
        </p>
        <p>
          <strong>Surface :</strong>{" "}
          {selected.surface != null ? fmtFr(selected.surface) + " m²" : "n/d"}
        </p>
        <p>
          <strong>Prix/m² :</strong>{" "}
          {selected.prix_m2 != null ? fmtFr(selected.prix_m2) + " €/m²" : "n/d"}
        </p>
        <p>
          <strong>Pièces :</strong>{" "}
          {selected.nombre_pieces != null ? fmtFr(selected.nombre_pieces) : "n/d"}
        </p>
        <section className="panel agencement3d" aria-label="Agencement 3D du bien">
          <h3 style={{ margin: "0 0 8px 0", fontSize: "1rem" }}>
            Agencement 3D ({selected.nombre_pieces != null ? selected.nombre_pieces : 4} pièces)
          </h3>
          <Maison3D point={selected} communes={communes} />
        </section>
        <p><strong>Date :</strong> {selected.date ?? "n/d"}</p>
        <p className="constat" style={{ borderLeft: `4px solid ${couleurBordure}` }}>
          {comparo}
        </p>
      </section>
    );
  }

  // Vue carte principale
  return (
    <section className="panel carte" aria-label="Carte des ventes immobilières">
      <MapContainer
        center={CENTRE}
        zoom={11}
        style={{ height: "520px", width: "100%" }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />
        {points.map((p) => (
          <Marker
            key={p.id_mutation}
            position={[p.latitude, p.longitude]}
            eventHandlers={{
              click: () => setSelected(p),
            }}
          >
            <Popup>
              <div style={{ minWidth: "200px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                  <IconeTypeBien type={p.type as any} />
                  <strong style={{ fontSize: "1.1em" }}>{p.nom_commune}</strong>
                </div>
                <p style={{ margin: "2px 0" }}><strong>{p.type}</strong></p>
                <p style={{ margin: "2px 0" }}>
                  {p.prix_m2 != null ? fmtFr(p.prix_m2) + " €/m²" : "n/d"}
                </p>
                <p style={{ margin: "2px 0" }}><em>{p.date ?? "n/d"}</em></p>
                <p style={{ fontSize: "0.85em", color: "#666" }}>
                  Cliquez pour voir la fiche détaillée
                </p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      <p className="constat">
        {points.length} vente{points.length > 1 ? "s" : ""} affichée{points.length > 1 ? "s" : ""}
        sur la carte. Cliquez sur un marqueur pour ouvrir la fiche détaillée.
      </p>
    </section>
  );
}
