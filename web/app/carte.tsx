'use client';

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useState } from "react";

import type { Point } from "@/lib/api";
import type { Commune } from "@/lib/api";

const CENTRE = [47.9, 1.9]; // Orléans

function fmtFr(v: number | null): string {
  if (v == null) return "n/d";
  return v.toLocaleString("fr-FR");
}

function medianeCommune(communes: Commune[], nom: string): number | null {
  const c = communes.find((x) => x.nom_commune === nom);
  return c ? c.prix_m2_median : null;
}

export function Carte({
  points,
  communes,
}: {
  points: Point[];
  communes: Commune[];
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
    return (
      <section className="panel fiche" aria-labelledby="titre-fiche">
        <h2 id="titre-fiche">Détail du bien</h2>
        <p>Commune : {selected.nom_commune}</p>
        <p>Type : {selected.type}</p>
        <p>
          Prix :{" "}
          {selected.prix != null ? fmtFr(selected.prix) + " €" : "n/d"}
        </p>
        <p>
          Surface :{" "}
          {selected.surface != null ? fmtFr(selected.surface) + " m²" : "n/d"}
        </p>
        <p>
          Prix/m² :{" "}
          {selected.prix_m2 != null ? fmtFr(selected.prix_m2) + " €/m²" : "n/d"}
        </p>
        <p>
          Pièces : {selected.nombre_pieces != null ? fmtFr(selected.nombre_pieces) : "n/d"}
        </p>
        <p>Date : {selected.date ?? "n/d"}</p>
        <p className="constat">{comparo}</p>
        <button onClick={() => setSelected(null)}>Fermer la fiche</button>
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
            onClick={() => setSelected(p)}
          >
            <Popup>
              {p.nom_commune} · {p.type} ·{" "}
              {p.prix_m2 != null ? fmtFr(p.prix_m2) + " €/m²" : "n/d"}
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
