"use client";

import { startTransition, useActionState, useId, useState } from "react";
import { estimer, type Etat } from "./actions";
import s from "./estimer.module.css";

export type CommuneOption = { code_commune: string; nom_commune: string };

const nombre = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const euro = (v: number) => `${nombre.format(v)} €`;
const sans = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const VERDICTS = {
  "au-dessus": { signe: "▲", texte: "Au-dessus de la fourchette : le prix demandé semble élevé.", classe: s.haut },
  "dans la fourchette": { signe: "●", texte: "Dans la fourchette : le prix demandé semble raisonnable.", classe: s.milieu },
  "au-dessous": { signe: "▼", texte: "Au-dessous de la fourchette : le prix demandé est bas, vérifiez l'état du bien.", classe: s.bas },
} as const;

function Commune({ communes }: { communes: CommuneOption[] }) {
  const id = useId();
  const [texte, setTexte] = useState("");
  const [code, setCode] = useState("");
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

export default function Estimateur({ communes }: { communes: CommuneOption[] }) {
  const [etat, action, attente] = useActionState<Etat, FormData>(estimer, {});
  const r = etat.resultat;
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
        <Commune communes={communes} />
        <fieldset className={s.champ}>
          <legend>Type de bien</legend>
          <div className={s.choix}>
            <label><input type="radio" name="type" value="Maison" defaultChecked /> Maison</label>
            <label><input type="radio" name="type" value="Appartement" /> Appartement</label>
          </div>
        </fieldset>
        <div className={s.deux}>
          <div className={s.champ}>
            <label htmlFor="surface">Surface (m²)</label>
            <input id="surface" name="surface" type="number" inputMode="numeric" min={9} max={1000} defaultValue={100} required />
          </div>
          <div className={s.champ}>
            <label htmlFor="pieces">Pièces principales</label>
            <input id="pieces" name="pieces" type="number" inputMode="numeric" min={1} max={8} defaultValue={4} required />
          </div>
        </div>
        <fieldset className={s.champ}>
          <legend>Options</legend>
          <div className={s.choix}>
            <label><input type="checkbox" name="jardin" /> Jardin</label>
            <label><input type="checkbox" name="dependance" /> Garage, cave ou parking</label>
          </div>
        </fieldset>
        <div className={s.champ}>
          <label htmlFor="prix">Prix demandé (€, facultatif)</label>
          <input id="prix" name="prix_demande" type="number" inputMode="numeric" min={1000} step="any" />
        </div>
        <button type="submit" className="bouton" disabled={attente}>{attente ? "Calcul…" : "Estimer"}</button>
        <p className={s.aide}>
          DVF ne dit rien de la piscine, de l&apos;étage ni du DPE ; nombre de pièces = séjour + chambres.
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
            <p>
              Erreur moyenne du modèle : ± {euro(r.mae)} ({(r.mape * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} % du prix),
              mesurée sur {nombre.format(r.n_test)} ventes.
            </p>
            <p>
              Comparables dans la commune : {nombre.format(r.comparables.n)} ventes
              {r.comparables.prix_median != null && <>, prix médian {euro(r.comparables.prix_median)}</>}.
            </p>
            {v && (
              <p className={`${s.verdict} ${v.classe}`}>
                <span aria-hidden="true">{v.signe}</span> {v.texte}
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
