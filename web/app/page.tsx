'use client';

import type { Point } from "@/lib/api";
import {
  chargerDonnees,
  chargerPoints,
  TYPES,
  type TypeBien,
  type Kpis,
  type Commune,
} from "@/lib/api";
import { Carte } from "./Carte";
import { IconeTypeBien } from "./icone";
import dynamic from "next/dynamic";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";

const Carte3D = dynamic<{ points: Point[]; type: string }>(
  () => import("./Carte3D").then((mod) => ({ default: mod.Carte3D })),
  { ssr: false }
);

const nombre = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const fmt = (v: number | null, unite: string) =>
  v == null ? "n/d" : `${nombre.format(v)} ${unite}`;

function toNumber(v: string | null): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export default function Page() {
  const searchParams = useSearchParams();
  const [donnees, setDonnees] = useState<{
    kpis: Kpis;
    communes: Commune[];
    points: import("@/lib/api").Point[];
  } | null>(null);
  const [mode3D, setMode3D] = useState(false);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    let ignore = false;
    const type: TypeBien =
      TYPES.find((t) => t === searchParams.get("type")) ?? "Maison";
    const annee = toNumber(searchParams.get("annee"));
    const budget_max = toNumber(searchParams.get("budget_max"));

    setChargement(true);
    Promise.all([
      chargerDonnees(type, annee, budget_max),
      chargerPoints(type, annee, budget_max),
    ])
      .then(([donneesKpis, points]) => {
        const [kpis, communes] = donneesKpis;
        if (!ignore) {
          setDonnees({ kpis, communes, points });
          setChargement(false);
        }
      })
      .catch(() => {
        if (!ignore) setChargement(false);
      });

    return () => {
      ignore = true;
    };
  }, [searchParams]);

  if (chargement || !donnees) {
    return (
      <main className="chargement">
        <p className="source">
          DGFiP, DVF gÃ©olocalisÃ©es (Etalab) Â· Loiret Â· 2021-2025 Â· Licence Ouverte 2.0
        </p>
        <h1>OÃ¹ acheter autour d&apos;OrlÃ©ans, et pour quel budget ?</h1>
        <p style={{ textAlign: "center", padding: "4rem 0", color: "#666" }}>
          Chargement des donnÃ©esâ€¦
        </p>
      </main>
    );
  }

  const { kpis, communes, points } = donnees;
  const max = Math.max(...communes.map((c) => c.prix_m2_median ?? 0), 1);
  const top = communes[0];
  const dernier = communes[communes.length - 1];
  const titre = top
    ? `${top.nom_commune}, la plus chÃ¨re : ${fmt(top.prix_m2_median, "â‚¬/mÂ²")} mÃ©dian sur ${nombre.format(top.n)} ventes`
    : "Aucune commune avec assez de ventes";
  const alternative =
    top && dernier
      ? `Classement de ${communes.length} communes par prix mÃ©dian au mÂ² dÃ©croissant, de ${top.nom_commune} (${fmt(top.prix_m2_median, "â‚¬/mÂ²")}) Ã  ${dernier.nom_commune} (${fmt(dernier.prix_m2_median, "â‚¬/mÂ²")}).`
      : "";

  return (
    <main>
      <p className="source">
        DGFiP, DVF gÃ©olocalisÃ©es (Etalab) Â· Loiret Â· 2021-2025 Â· Licence Ouverte 2.0
      </p>
      <h1>OÃ¹ acheter autour d&apos;OrlÃ©ans, et pour quel budget ?</h1>

      <form method="get" className="filtres" aria-label="Filtres">
        <label>
          Type de bien
          <select name="type" defaultValue={typeInitial(searchParams)}>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                <IconeTypeBien type={t} /> {t}
              </option>
            ))}
          </select>
        </label>
        <label>
          AnnÃ©e
          <select name="annee" defaultValue={searchParams.get("annee") ?? ""}>
            <option value="">Toutes</option>
            {[2021, 2022, 2023, 2024, 2025].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>
        <label>
          Budget max (â‚¬)
          <input
            type="number"
            name="budget_max"
            defaultValue={searchParams.get("budget_max") ?? ""}
            min="0"
          />
        </label>
        <button type="submit" className="bouton">
          Appliquer
        </button>
      </form>

      <section className="kpis" aria-label="Indicateurs">
        <div className="panel surligne">
          <p className="label">Prix mÃ©dian au mÂ²</p>
          <p className="valeur">{fmt(kpis.prix_m2_median, "â‚¬/mÂ²")}</p>
        </div>
        <div className="panel">
          <p className="label">Prix mÃ©dian de vente</p>
          <p className="valeur">{fmt(kpis.valeur_median, "â‚¬")}</p>
        </div>
        <div className="panel">
          <p className="label">Nombre de ventes</p>
          <p className="valeur">{nombre.format(kpis.n_ventes)}</p>
          <p className="detail">
            dans {nombre.format(kpis.n_communes)} communes
          </p>
        </div>
      </section>

      <div className="carte-wrapper">
        <button
          className="bouton bouton-3d"
          onClick={() => setMode3D((p) => !p)}
          aria-pressed={mode3D}
        >
          {mode3D ? "Repasser en 2D" : "Passer en 3D / relief"}
        </button>
        {mode3D ? (
          <Carte3D points={points} type={typeInitial(searchParams)} />
        ) : (
          <Carte points={points} communes={communes} type={typeInitial(searchParams)} />
        )}
      </div>

      <section className="panel graphique" aria-labelledby="titre-graphique">
        <h2 id="titre-graphique">{titre}</h2>
        <ol className="barres">
          {communes.map((c) => (
            <li key={c.code_commune}>
              <span className="nom">{c.nom_commune}</span>
              <span className="piste" aria-hidden="true">
                <span
                  className="barre"
                  style={{ width: `${((c.prix_m2_median ?? 0) / max) * 100}%` }}
                />
              </span>
              <span className="chiffre">
                {fmt(c.prix_m2_median, "â‚¬/mÂ²")}
                <small>{nombre.format(c.n)} ventes</small>
              </span>
            </li>
          ))}
        </ol>
        <p className="alternative">{alternative}</p>
      </section>
    </main>
  );
}

function typeInitial(searchParams: URLSearchParams): TypeBien {
  return TYPES.find((t) => t === searchParams.get("type")) ?? "Maison";
}
