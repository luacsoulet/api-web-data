"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { Commune, Point } from "@/lib/api";

const CarteMarqueurs = dynamic<{ points: Point[]; communes: Commune[]; type: string }>(
  () => import("./CarteMarqueurs").then((m) => ({ default: m.CarteMarqueurs })),
  { ssr: false },
);

const Carte3D = dynamic<{ points: Point[]; type: string }>(
  () => import("./Carte3D").then((m) => ({ default: m.Carte3D })),
  { ssr: false },
);

/** Vues complémentaires (design local) : marqueurs Leaflet avec fiche détaillée, ou relief 3D. */
export default function VuesBiens({ points, communes, type }: { points: Point[]; communes: Commune[]; type: string }) {
  const [vue, setVue] = useState<"off" | "marqueurs" | "3d">("off");
  return (
    <section className="carte-wrapper" aria-label="Vues alternatives des biens">
      <div className="segments" role="group" aria-label="Vue des biens">
        <button type="button" aria-pressed={vue === "marqueurs"} onClick={() => setVue(vue === "marqueurs" ? "off" : "marqueurs")}>
          Marqueurs et fiches
        </button>
        <button type="button" aria-pressed={vue === "3d"} onClick={() => setVue(vue === "3d" ? "off" : "3d")}>
          Relief 3D
        </button>
      </div>
      {vue === "marqueurs" && <CarteMarqueurs points={points} communes={communes} type={type} />}
      {vue === "3d" && <Carte3D points={points} type={type} />}
    </section>
  );
}
