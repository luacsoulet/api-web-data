"use client";

import { startTransition, useActionState, useId, useMemo, useState } from "react";
import Carte from "../Carte";
import CarteClic from "./CarteClic";
import { contexte, estimer, type Etat } from "./actions";
import s from "./estimer.module.css";

export type CommuneOption = { code_commune: string; nom_commune: string };
export type Prefill = {
  commune: string; type: string; surface: string; pieces: string;
  annee_construction: string; dpe: string; piscine: string;
};

const nombre = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const euro = (v: number) => `${nombre.format(v)} €`;
const sans = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const VERDICTS = {
  "au-dessus": { signe: "▲", texte: "Au-dessus de la fourchette : le prix demandé semble élevé.", classe: s.haut },
  "dans la fourchette": { signe: "●", texte: "Dans la fourchette : le prix demandé semble raisonnable.", classe: s.milieu },
  "au-dessous": { signe: "▼", texte: "Au-dessous de la fourchette : le prix demandé est bas, vérifiez l'état du bien.", classe: s.bas },
} as const;

function Commune({ communes, initiale }: { communes: CommuneOption[]; initiale: string }) {
  const id = useId();
  // le lien de la fiche vente peut donner le code INSEE ou le nom
  const depart = communes.find((c) => c.code_commune === initiale || sans(c.nom_commune) === sans(initiale));
  const [texte, setTexte] = useState(depart?.nom_commune ?? "");
  const [code, setCode] = useState(depart?.code_commune ?? "");
  const [ouvert, setOuvert] = useState(false);
  const [actif, setActif] = useState(0);
  const liste = communes.filter((c) => sans(c.nom_commune).includes(sans(texte))).slice(0, 8);

  const choisir = (c: CommuneOption) => {
    setTexte(c.nom_commune);
    setCode(c.code_commune);
    setOuvert(false);
  };
  const touche = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOuvert(true); setActif((a) => Math.min(a + 1, liste.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActif((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && ouvert && liste[actif]) { e.preventDefault(); choisir(liste[actif]); }
    else if (e.key === "Escape") setOuvert(false);
  };

  return (
    <div className={s.champ}>
      <label htmlFor={id}>Commune</label>
      <input
        id={id}
        role="combobox"
        aria-expanded={ouvert}
        aria-controls={`${id}-liste`}
        aria-autocomplete="list"
        aria-activedescendant={ouvert && liste[actif] ? `${id}-${liste[actif].code_commune}` : undefined}
        autoComplete="off"
        required
        value={texte}
        placeholder="Tapez un nom, ex. Olivet"
        onChange={(e) => { setTexte(e.target.value); setCode(""); setOuvert(true); setActif(0); }}
        onKeyDown={touche}
        onBlur={() => setOuvert(false)}
      />
      <input type="hidden" name="code_commune" value={code} />
      {ouvert && (
        <ul id={`${id}-liste`} role="listbox" aria-label="Communes" className={s.liste}>
          {liste.length === 0 && <li className={s.vide}>Aucune commune trouvée</li>}
          {liste.map((c, i) => (
            <li
              key={c.code_commune}
              id={`${id}-${c.code_commune}`}
              role="option"
              aria-selected={i === actif}
              onMouseDown={(e) => { e.preventDefault(); choisir(c); }}
            >
              {c.nom_commune}
            </li>
          ))}
        </ul>
      )}
      {communes.length === 0 && <p className={s.aide}>La liste des communes n&apos;a pas pu être chargée.</p>}
    </div>
  );
}

const NAPPES = { aucune: "Aucune", inondation_cave: "Inondation de cave", debordement_nappe: "Débordement de nappe" } as const;
const FACTEURS: Record<string, string> = {
  dpe_classe: "DPE", alea_argile: "Argile (aléa)", zone_inondable_scenario: "Zone inondable",
  sensibilite_nappe: "Remontée de nappe", bruit_lden_max_db: "Bruit", perimetre_mh_500m: "Monument historique à 500 m",
  piscine: "Piscine",
};
const VALEURS: Record<string, string> = {
  debordement_nappe: "débordement", inondation_cave: "caves inondables", aucune: "aucune",
  frequent: "crue fréquente", extreme: "crue extrême",
};
const NIVEAUX = { info: "ⓘ Info", vigilance: "⚠ Vigilance", alerte: "⛔ Alerte" } as const;
const signe = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${euro(Math.abs(v))}`;

export default function Estimateur({ communes, initial }: { communes: CommuneOption[]; initial: Prefill }) {
  const [risques, setRisques] = useState({ argile: "", inondable: "", nappe: "", bruit: "" });
  const [point, setPoint] = useState<[number, number] | null>(null);
  const [msgCarte, setMsgCarte] = useState("");
  const choisirPoint = async (lon: number, lat: number) => {
    setPoint([lon, lat]);
    setMsgCarte("Lecture des risques…");
    const c = await contexte(lon, lat);
    if (c.erreur) return setMsgCarte(c.erreur);
    const b = c.bruit ?? c.bruit_lden_max_db;
    setRisques({
      argile: c.alea_argile ?? "",
      inondable: c.zone_inondable_scenario ?? "",
      nappe: c.sensibilite_nappe ?? "",
      bruit: b == null ? "" : String(Math.round(b)),
    });
    setMsgCarte("Risques lus au point choisi (vente la plus proche à moins de 150 m) ; vous pouvez les corriger.");
  };
  const [etat, action, attente] = useActionState<Etat, FormData>(estimer, {});
  const r = etat.resultat;
  const budget = etat.budget;
  const comparables = r?.comparables_ventes;
  const points = comparables?.features;
  const cadrage = useMemo<[number, number, number, number] | null>(() => {
    if (!points?.length) return null;
    const c = points.map((f) => (f.geometry as { coordinates: [number, number] }).coordinates);
    const [xs, ys] = [c.map((p) => p[0]), c.map((p) => p[1])];
    const m = 0.01; // marge ~1 km, utile aussi s'il n'y a qu'un point
    return [Math.min(...xs) - m, Math.min(...ys) - m, Math.max(...xs) + m, Math.max(...ys) + m];
  }, [points]);
  const prix = (points ?? []).map((f) => f.properties.valeur_fonciere).sort((a, b) => a - b);
  const mediane = prix.length ? (prix[Math.floor((prix.length - 1) / 2)] + prix[Math.ceil((prix.length - 1) / 2)]) / 2 : 0;
  const sous = budget ? prix.filter((p) => p < budget).length : 0;
  const ecartBudget = budget && r ? budget - r.prix_estime : null;
  const v = r?.verdict ? VERDICTS[r.verdict] : null;

  return (
    <div className={s.grille}>
      <form
        // onSubmit plutôt que action= : React ne vide pas le formulaire, on peut comparer plusieurs prix
        onSubmit={(e) => {
          e.preventDefault();
          const donnees = new FormData(e.currentTarget);
          startTransition(() => action(donnees));
        }}
        className={`panel ${s.form}`}
      >
        <Commune communes={communes} initiale={initial.commune} />
        <fieldset className={s.champ}>
          <legend>Type de bien</legend>
          <div className={s.choix}>
            <label><input type="radio" name="type" value="Maison" defaultChecked={initial.type !== "Appartement"} /> Maison</label>
            <label><input type="radio" name="type" value="Appartement" defaultChecked={initial.type === "Appartement"} /> Appartement</label>
          </div>
        </fieldset>
        <div className={s.deux}>
          <div className={s.champ}>
            <label htmlFor="surface">Surface (m²)</label>
            <input id="surface" name="surface" type="number" inputMode="numeric" min={9} max={400} defaultValue={initial.surface || 100} required />
          </div>
          <div className={s.champ}>
            <label htmlFor="pieces">Pièces principales</label>
            <input id="pieces" name="pieces" type="number" inputMode="numeric" min={1} max={8} defaultValue={initial.pieces || 4} required />
          </div>
        </div>
        <fieldset className={s.champ}>
          <legend>Options</legend>
          <div className={s.choix}>
            <label><input type="checkbox" name="jardin" /> Jardin</label>
            <label><input type="checkbox" name="dependance" /> Garage, cave ou parking</label>
            <label><input type="checkbox" name="piscine" defaultChecked={initial.piscine === "true"} /> Piscine</label>
          </div>
        </fieldset>
        <div className={s.deux}>
          <div className={s.champ}>
            <label htmlFor="annee_construction">Année de construction</label>
            <input id="annee_construction" name="annee_construction" type="number" inputMode="numeric" min={1500} max={2026} defaultValue={initial.annee_construction} />
          </div>
          <div className={s.champ}>
            <label htmlFor="dpe">DPE (classe énergie)</label>
            <select id="dpe" name="dpe" defaultValue={/^[A-G]$/.test(initial.dpe) ? initial.dpe : ""}>
              <option value="">Inconnu</option>
              {"ABCDEFG".split("").map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className={s.champ}>
          <label htmlFor="materiau_murs">Matériau des murs (facultatif)</label>
          <input id="materiau_murs" name="materiau_murs" list="materiaux" maxLength={40} placeholder="ex. pierre, brique, béton" />
          <datalist id="materiaux">
            {["pierre", "brique", "béton", "parpaing", "bois", "pisé"].map((m) => <option key={m} value={m} />)}
          </datalist>
        </div>
        <fieldset className={`${s.champ} ${s.risques}`}>
          <legend>Risques et nuisances du terrain</legend>
          <p className={s.aide}>Cliquez sur la carte pour les remplir, ou choisissez à la main.</p>
          <CarteClic onChoix={choisirPoint} point={point} />
          <p className={s.aide} role="status">
            {point ? `Point choisi : ${point[1].toFixed(5)} N, ${point[0].toFixed(5)} E. ` : "Aucun point choisi. "}
            {msgCarte}
          </p>
          <input type="hidden" name="longitude" value={point ? point[0] : ""} />
          <input type="hidden" name="latitude" value={point ? point[1] : ""} />
          <div className={s.deux}>
            <div className={s.champ}>
              <label htmlFor="alea_argile">Aléa argile (retrait-gonflement)</label>
              <select id="alea_argile" name="alea_argile" value={risques.argile} onChange={(e) => setRisques({ ...risques, argile: e.target.value })}>
                <option value="">Inconnu</option>
                <option value="faible">Faible</option>
                <option value="moyen">Moyen</option>
                <option value="fort">Fort</option>
              </select>
            </div>
            <div className={s.champ}>
              <label htmlFor="zone_inondable">Zone inondable (Loire)</label>
              <select id="zone_inondable" name="zone_inondable" value={risques.inondable} onChange={(e) => setRisques({ ...risques, inondable: e.target.value })}>
                <option value="">Hors zone ou inconnu</option>
                <option value="frequent">Crue fréquente</option>
                <option value="moyen">Crue moyenne</option>
                <option value="extreme">Crue extrême</option>
              </select>
            </div>
            <div className={s.champ}>
              <label htmlFor="sensibilite_nappe">Nappe phréatique</label>
              <select id="sensibilite_nappe" name="sensibilite_nappe" value={risques.nappe} onChange={(e) => setRisques({ ...risques, nappe: e.target.value })}>
                <option value="">Inconnu</option>
                {Object.entries(NAPPES).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
              </select>
            </div>
            <div className={s.champ}>
              <label htmlFor="bruit_db">Bruit (dB, Lden)</label>
              <input id="bruit_db" name="bruit_db" type="number" inputMode="numeric" min={0} max={120} value={risques.bruit} onChange={(e) => setRisques({ ...risques, bruit: e.target.value })} />
            </div>
          </div>
        </fieldset>
        <div className={s.champ}>
          <label htmlFor="prix">Votre budget ou prix demandé (€, facultatif)</label>
          <input id="prix" name="prix_demande" type="number" inputMode="numeric" min={1000} step="any" />
        </div>
        <button type="submit" className="bouton" disabled={attente}>{attente ? "Calcul…" : "Estimer"}</button>
        <p className={s.aide}>
          Nombre de pièces = séjour + chambres. L&apos;étage n&apos;est pas connu des données DVF.
        </p>
      </form>

      <section className={`panel ${s.resultat}`} aria-labelledby="titre-resultat" aria-live="polite">
        <h2 id="titre-resultat">Estimation</h2>
        {etat.erreur && <p role="alert" className={s.erreur}>Erreur : {etat.erreur}</p>}
        {!r && !etat.erreur && <p>Renseignez le bien puis cliquez sur « Estimer ».</p>}
        {r && (
          <>
            <p className="label">Prix estimé</p>
            <p className="valeur surligne">{euro(r.prix_estime)}</p>
            <p>Fourchette : de {euro(r.fourchette_basse)} à {euro(r.fourchette_haute)}.</p>
            {r.marge_negociation && (
              <div className={s.marge}>
                <p className="label">Marge de négociation</p>
                <p className="valeur">
                  {euro(r.marge_negociation.basse_eur)} à {euro(r.marge_negociation.haute_eur)} ({(r.marge_negociation.pct * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %)
                </p>
                <p>{r.marge_negociation.explication}</p>
              </div>
            )}
            <p>
              Erreur moyenne du modèle : ± {euro(r.mae)} ({(r.mape * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} % du prix),
              mesurée sur {nombre.format(r.n_test)} ventes.
            </p>
            <p>
              Comparables dans la commune : {nombre.format(r.comparables.n)} ventes
              {r.comparables.prix_median != null && <>, prix médian {euro(r.comparables.prix_median)}</>}.
            </p>
            {r.facteurs && r.facteurs.length > 0 && (
              <>
                <h3>{r.facteurs.length} facteurs qui pèsent sur le prix</h3>
                <table className={s.table}>
                  <caption className={s.cache}>Impact de chaque facteur sur le prix estimé, en euros</caption>
                  <thead><tr><th scope="col">Facteur</th><th scope="col">Valeur</th><th scope="col">Impact</th></tr></thead>
                  <tbody>
                    {r.facteurs.map((f) => (
                      <tr key={f.facteur}>
                        <th scope="row">{FACTEURS[f.facteur] ?? f.facteur}</th>
                        <td>{typeof f.valeur === "boolean" ? (f.valeur ? "oui" : "non") : f.valeur == null ? "n/d" : (VALEURS[String(f.valeur)] ?? String(f.valeur))}</td>
                        <td>
                          {signe(f.impact_eur)} ({f.impact_pct > 0 ? "+" : f.impact_pct < 0 ? "−" : ""}{Math.abs(f.impact_pct * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %){" "}
                          {f.impact_eur > 0 ? "hausse" : f.impact_eur < 0 ? "baisse" : "neutre"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            {r.a_verifier && r.a_verifier.length > 0 && (
              <>
                <h3>À vérifier avant d&apos;acheter ({r.a_verifier.length})</h3>
                <ul className={s.verifier}>
                  {r.a_verifier.map((a) => (
                    <li key={a.facteur + a.texte}><strong>{NIVEAUX[a.niveau] ?? a.niveau}</strong> · {a.texte}</li>
                  ))}
                </ul>
              </>
            )}
            {ecartBudget != null && (
              <p>
                {ecartBudget === 0
                  ? "Votre budget est égal à l'estimation."
                  : `Votre budget est ${euro(Math.abs(ecartBudget))} ${ecartBudget > 0 ? "au-dessus" : "au-dessous"} de l'estimation.`}
              </p>
            )}
            {v && (
              <p className={`${s.verdict} ${v.classe}`}>
                <span aria-hidden="true">{v.signe}</span> {v.texte}
              </p>
            )}
          </>
        )}
      </section>
      {comparables && (
        <div className={s.carte}>
          {cadrage && points ? (
            <>
              <Carte
                ventes={comparables}
                cadrage={cadrage}
                qs=""
                budget={budget}
                titre={`${points.length} ${points[0].properties.type.toLowerCase()}${points.length > 1 ? "s" : ""} comparable${points.length > 1 ? "s" : ""} vendu${points[0].properties.type === "Maison" ? "e" : ""}${points.length > 1 ? "s" : ""} à ${points[0].properties.nom_commune} (surface ±20 %)${budget ? `, dont ${sous} sous votre budget` : ""}${r && r.comparables.n > points.length ? ` · les ${points.length} plus récentes sur ${r.comparables.n}` : ""}`}
              />
              <p>Prix médian de ces ventes : {euro(mediane)}.{budget ? " Cliquez sur un point pour voir l'écart avec votre budget." : ""}</p>
            </>
          ) : (
            <p>Aucune vente comparable avec coordonnées à afficher sur la carte.</p>
          )}
        </div>
      )}
    </div>
  );
}
