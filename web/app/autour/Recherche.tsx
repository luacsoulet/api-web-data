"use client";

import { useId, useRef, useState } from "react";
import type { Adresse } from "@/lib/api";
import { chercherAdresses } from "./actions";

type Choix = { libelle: string; lon: number; lat: number };

/** Formulaire GET vers /autour : adresse (combobox), rayon ; les filtres actifs suivent en champs cachés. */
export default function Recherche({ initial, rayon, filtres }: { initial: Choix | null; rayon: number; filtres: [string, string][] }) {
  const id = useId();
  const [texte, setTexte] = useState(initial?.libelle ?? "");
  const [choix, setChoix] = useState<Choix | null>(initial);
  const [liste, setListe] = useState<Adresse[]>([]);
  const [ouvert, setOuvert] = useState(false);
  const [actif, setActif] = useState(0);
  const [message, setMessage] = useState("");
  const minuterie = useRef<ReturnType<typeof setTimeout>>(undefined);
  const derniere = useRef(0);

  const saisir = (v: string) => {
    setTexte(v);
    setChoix(null);
    setActif(0);
    clearTimeout(minuterie.current);
    if (v.trim().length < 3) return setListe([]);
    // 200 ms sans frappe avant d'interroger l'API ; seule la dernière réponse compte
    minuterie.current = setTimeout(async () => {
      const n = ++derniere.current;
      const r = await chercherAdresses(v);
      if (n !== derniere.current) return;
      setListe(r ?? []);
      setMessage(r ? "" : "La recherche d'adresses est indisponible. Réessayez dans un instant.");
      setOuvert(true);
    }, 200);
  };
  const choisir = (a: Adresse) => {
    setTexte(a.libelle);
    setChoix({ libelle: a.libelle, lon: a.longitude, lat: a.latitude });
    setOuvert(false);
    setMessage("");
  };
  const touche = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOuvert(true); setActif((a) => Math.min(a + 1, liste.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActif((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && ouvert && liste[actif]) { e.preventDefault(); choisir(liste[actif]); }
    else if (e.key === "Escape") setOuvert(false);
  };

  return (
    <form
      className="panel recherche"
      action="/autour"
      method="get"
      onSubmit={(e) => {
        if (!choix) { e.preventDefault(); setMessage("Choisissez une adresse dans la liste des suggestions."); }
      }}
    >
      {filtres.map(([k, v], i) => <input key={`${k}-${i}`} type="hidden" name={k} value={v} />)}
      <div className="champ">
        <label htmlFor={id}>Adresse dans le Loiret</label>
        <input
          id={id}
          role="combobox"
          aria-expanded={ouvert}
          aria-controls={`${id}-liste`}
          aria-autocomplete="list"
          aria-activedescendant={ouvert && liste[actif] ? `${id}-${actif}` : undefined}
          aria-describedby={`${id}-message`}
          autoComplete="off"
          required
          value={texte}
          placeholder="ex. 12 rue de Bourgogne Orléans"
          onChange={(e) => saisir(e.target.value)}
          onKeyDown={touche}
          onBlur={() => setOuvert(false)}
        />
        {ouvert && (
          <ul id={`${id}-liste`} role="listbox" aria-label="Adresses" className="liste">
            {liste.length === 0 && <li className="vide">Aucune adresse trouvée</li>}
            {liste.map((a, i) => (
              <li key={`${a.libelle}-${i}`} id={`${id}-${i}`} role="option" aria-selected={i === actif}
                onMouseDown={(e) => { e.preventDefault(); choisir(a); }}>
                {a.libelle}
              </li>
            ))}
          </ul>
        )}
      </div>
      <input type="hidden" name="lon" value={choix?.lon ?? ""} />
      <input type="hidden" name="lat" value={choix?.lat ?? ""} />
      <input type="hidden" name="adresse" value={choix?.libelle ?? ""} />
      <div className="champ">
        <label htmlFor={`${id}-rayon`}>Rayon (m)</label>
        <input id={`${id}-rayon`} name="rayon" type="number" inputMode="numeric" min={100} max={5000} step={100} defaultValue={rayon} required />
      </div>
      <div className="actions">
        <button className="bouton" type="submit">Voir autour</button>
      </div>
      <p id={`${id}-message`} className="aide" role="status">{message}</p>
    </form>
  );
}
