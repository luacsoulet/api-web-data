"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { Point } from "@/lib/api";

const Carte3D = dynamic<{ points: Point[]; type: string }>(
  () => import("./Carte3D").then((m) => ({ default: m.Carte3D })),
  { ssr: false },
);

/** Vue complémentaire (design local) : relief 3D. */
export default function VuesBiens({ points, type }: { points: Point[]; type: string }) {
  const [actif, setActif] = useState(false);
  return (
    <section className="carte-wrapper" aria-label="Vue alternative des biens">
      <div className="segments" role="group" aria-label="Vue des biens">
        <button type="button" aria-pressed={actif} onClick={() => setActif(!actif)}>
          Relief 3D
        </button>
      </div>
      {actif && <Carte3D points={points} type={type} />}
    </section>
  );
}
