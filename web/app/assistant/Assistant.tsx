"use client";

import { useState, useTransition } from "react";
import { demander } from "./actions";
import s from "./assistant.module.css";

type Echange = { question: string; texte: string; erreur?: string };

const EXEMPLES = [
  "Compare Olivet, Saran et Fleury-les-Aubrais pour les maisons.",
  "Trouve 5 maisons à Olivet sous 300 000 € hors zone inondable.",
  "Estime une maison de 100 m², 5 pièces à Olivet, DPE F : combien négocier ?",
];

export default function Assistant() {
  const [echanges, setEchanges] = useState<Echange[]>([]);
  const [session, setSession] = useState<string>();
  const [question, setQuestion] = useState("");
  const [enCours, start] = useTransition();

  function envoyer(q: string) {
    if (!q.trim() || enCours) return;
    setQuestion("");
    setEchanges((e) => [...e, { question: q, texte: "" }]);
    start(async () => {
      const r = await demander(q, session);
      if (r.session) setSession(r.session);
      setEchanges((e) => e.map((x, i) => (i === e.length - 1 ? { ...x, texte: r.texte, erreur: r.erreur } : x)));
    });
  }

  return (
    <section className="panel">
      <ol className={s.echanges} aria-live="polite">
        {echanges.map((e, i) => (
          <li key={i}>
            <p className={s.question}><strong>Vous :</strong> {e.question}</p>
            <p className={e.erreur ? `${s.reponse} avertissement` : s.reponse}>
              <strong>Assistant :</strong>{" "}
              {e.erreur ?? (e.texte || (enCours && i === echanges.length - 1 ? "recherche dans les données…" : ""))}
            </p>
          </li>
        ))}
      </ol>
      {echanges.length === 0 && (
        <ul className={s.exemples} aria-label="Exemples de questions">
          {EXEMPLES.map((x) => (
            <li key={x}><button type="button" onClick={() => envoyer(x)}>{x}</button></li>
          ))}
        </ul>
      )}
      <form className={s.form} onSubmit={(ev) => { ev.preventDefault(); envoyer(question); }}>
        <label htmlFor="question">Votre question</label>
        <div className="options">
          <input id="question" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={500} autoComplete="off" />
          <button type="submit" disabled={enCours}>{enCours ? "Réponse en cours…" : "Envoyer"}</button>
        </div>
      </form>
    </section>
  );
}
