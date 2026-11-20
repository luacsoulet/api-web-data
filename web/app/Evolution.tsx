import Link from "next/link";
import { ANNEES, type Evolution as Ligne, type EvolutionTranche } from "@/lib/api";

const nombre = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const euros = (v: number | null) => (v == null ? "n/d" : `${nombre.format(v)} €/m²`);
const TOUT = "Toutes surfaces";
const COURT: Record<string, string> = {
  "moins de 50 m²": "< 50 m²", "50 à 80 m²": "50-80 m²", "80 à 120 m²": "80-120 m²", "120 m² et plus": "≥ 120 m²",
};
// motifs distincts : l'information ne repose jamais sur la couleur seule
const TRAITS = ["", "7 4", "2 4", "10 4 2 4"];
const COULEURS = ["var(--ink)", "var(--parcel)", "var(--muted)", "var(--ink)"];
const W = 640, H = 320, G = 58, D = 96, HAUT = 16, BAS = 34;

type Serie = { nom: string; pts: Map<number, { v: number | null; n: number }> };

function echelle(vals: number[]) {
  const min = Math.min(...vals), max = Math.max(...vals);
  const brut = Math.max((max - min) / 4, 1);
  const mag = 10 ** Math.floor(Math.log10(brut));
  const pas = ([1, 2, 5, 10].find((m) => m * mag >= brut) ?? 10) * mag;
  const lo = Math.floor(min / pas) * pas, hi = Math.max(Math.ceil(max / pas) * pas, lo + pas);
  const ticks: number[] = [];
  for (let t = lo; t <= hi + 1e-6; t += pas) ticks.push(t);
  return { lo, hi, ticks };
}

export default function Evolution({
  q, vue, lignes,
}: { q: URLSearchParams; vue: "tranches" | "tout"; lignes: (Ligne | EvolutionTranche)[] }) {
  const lien = (val: string) => {
    const p = new URLSearchParams(q);
    p.set("evo", val);
    return `/?${p}`;
  };
  const mot = "médian";

  const series: Serie[] = [];
  for (const l of lignes) {
    const nom = "tranche" in l ? l.tranche : TOUT;
    let s = series.find((x) => x.nom === nom);
    if (!s) series.push((s = { nom, pts: new Map() }));
    s.pts.set(l.annee, { v: l.prix_m2_median, n: l.n });
  }
  const valeurs = series.flatMap((s) => [...s.pts.values()].map((p) => p.v).filter((v): v is number => v != null));
  const total = lignes.reduce((a, l) => a + l.n, 0);

  // évolution première -> dernière année renseignée de chaque série
  const evol = series.flatMap((s) => {
    const ok = ANNEES.filter((a) => s.pts.get(a)?.v != null);
    if (ok.length < 2) return [];
    const [d, f] = [s.pts.get(ok[0])!.v!, s.pts.get(ok[ok.length - 1])!.v!];
    return [{ nom: s.nom, pct: Math.round((f / d - 1) * 100), de: ok[0], a: ok[ok.length - 1] }];
  });
  const pct = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v)} %`;
  let titre = `Pas assez de ventes pour tracer l'évolution du prix au m² (${nombre.format(total)} ventes)`;
  if (valeurs.length && evol.length) {
    if (vue === "tout") {
      const e = evol[0];
      titre = `${TOUT} : prix ${mot} au m² ${pct(e.pct)} de ${e.de} à ${e.a} (${nombre.format(total)} ventes)`;
    } else {
      const m = evol.reduce((a, b) => (b.pct > a.pct ? b : a));
      titre = `Par tranche, ${m.nom} évolue le plus : prix ${mot} au m² ${pct(m.pct)} de ${m.de} à ${m.a} (${nombre.format(total)} ventes)`;
    }
  }

  let graphique = null;
  if (valeurs.length) {
    const { lo, hi, ticks } = echelle(valeurs);
    const x = (a: number) => G + ((a - ANNEES[0]) / (ANNEES.length - 1)) * (W - G - D);
    const y = (v: number) => HAUT + (1 - (v - lo) / (hi - lo)) * (H - HAUT - BAS);
    // étiquettes de fin de ligne, écartées d'au moins 14 px
    const fins = series
      .flatMap((s, i) => {
        const a = [...ANNEES].reverse().find((an) => s.pts.get(an)?.v != null);
        return a ? [{ i, a, y: y(s.pts.get(a)!.v!) }] : [];
      })
      .sort((p, r) => p.y - r.y);
    fins.forEach((f, k) => { if (k && f.y < fins[k - 1].y + 14) f.y = fins[k - 1].y + 14; });

    graphique = (
      <div className="evo-defile" tabIndex={0} role="group" aria-label="Graphique, défilable horizontalement">
        <svg className="evo-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby="evo-titre evo-desc">
          <desc id="evo-desc">Courbes du prix {mot} au m² par année ; le détail chiffré est dans le tableau sous le graphique.</desc>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={G} x2={W - D} y1={y(t)} y2={y(t)} stroke="var(--grid)" />
              <text x={G - 8} y={y(t)} textAnchor="end" dominantBaseline="middle">{nombre.format(t)}</text>
            </g>
          ))}
          {ANNEES.map((a) => <text key={a} x={x(a)} y={H - 10} textAnchor="middle">{a}</text>)}
          {series.map((s, i) => {
            const c = COULEURS[i % 4], t = TRAITS[i % 4];
            let d = "", pen = false;
            for (const a of ANNEES) {
              const v = s.pts.get(a)?.v;
              if (v == null) { pen = false; continue; }
              d += `${pen ? "L" : "M"}${x(a).toFixed(1)} ${y(v).toFixed(1)}`;
              pen = true;
            }
            const fin = fins.find((f) => f.i === i);
            return (
              <g key={s.nom} className="evo-serie">
                <path className="evo-trace" d={d} fill="none" stroke={c} strokeWidth={2} strokeDasharray={t || undefined} />
                {/* zone de survol large et invisible : nom de la tranche au survol de la courbe */}
                <path d={d} fill="none" stroke="transparent" strokeWidth={14}>
                  <title>{s.nom}</title>
                </path>
                {ANNEES.map((a) => {
                  const p = s.pts.get(a);
                  if (p?.v == null) return null;
                  const bx = Math.min(Math.max(x(a), G + 90), W - D - 90);
                  return (
                    <g key={a} className="evo-point" tabIndex={0}>
                      <circle cx={x(a)} cy={y(p.v)} r={12} fill="transparent" />
                      <circle cx={x(a)} cy={y(p.v)} r={4} fill="var(--paper)" stroke={c} strokeWidth={2} />
                      <text className="evo-bulle" x={bx} y={y(p.v) - 14} textAnchor="middle">
                        {`${s.nom} · ${a} · ${euros(p.v)} · ${nombre.format(p.n)} ventes`}
                      </text>
                    </g>
                  );
                })}
                {fin && (
                  <text className="evo-etiquette" x={x(fin.a) + 10} y={fin.y} dominantBaseline="middle">
                    {COURT[s.nom] ?? s.nom}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    );
  }

  const groupe = (nom: string, actif: string, choix: [string, string][]) => (
    <nav className="filtre" aria-label={nom}>
      {choix.map(([val, lib]) => (
        <Link key={val} href={lien(val)} aria-current={val === actif ? "true" : undefined} scroll={false}>{lib}</Link>
      ))}
    </nav>
  );

  return (
    <section className="panel evo" aria-labelledby="evo-titre">
      <p className="label">Évolution du prix au m²</p>
      <h2 id="evo-titre">{titre}</h2>
      <div className="evo-choix">
        {groupe("Vue", vue, [["tranches", "Par tranche de surface"], ["tout", "Toutes surfaces"]])}
      </div>
      {graphique}
      {graphique && (
        <details className="evo-chiffres">
          <summary>Voir les chiffres</summary>
          <div className="tableau">
            <table>
              <caption className="detail">Prix {mot} au m² (nombre de ventes), par année</caption>
              <thead>
                <tr><th scope="col">{vue === "tout" ? "Surface" : "Tranche"}</th>{ANNEES.map((a) => <th key={a} scope="col">{a}</th>)}</tr>
              </thead>
              <tbody>
                {series.map((s) => (
                  <tr key={s.nom}>
                    <th scope="row">{s.nom}</th>
                    {ANNEES.map((a) => {
                      const p = s.pts.get(a);
                      return <td key={a}>{p?.v == null ? "n/d" : `${euros(p.v)} (${nombre.format(p.n)})`}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
