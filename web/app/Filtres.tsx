import Link from "next/link";
import { ANNEES, TYPES } from "@/lib/api";

const nombre = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

/** Formulaire GET : l'URL porte l'état, fonctionne sans JavaScript. `q` = filtres déjà validés. */
export default function Filtres({ q, action, section, evo }: { q: URLSearchParams; action: string; section?: string; evo?: string }) {
  const amin = q.get("annee_min") ?? "2021";
  const amax = q.get("annee_max") ?? "2025";
  const actifs = [
    q.get("type") === "Tous" ? "tous types" : q.get("type")!.toLowerCase(),
    q.has("budget_max") && `jusqu'à ${nombre.format(Number(q.get("budget_max")))} €`,
    amin === amax ? `en ${amin}` : `de ${amin} à ${amax}`,
    q.has("surface_min") && q.has("surface_max")
      ? `entre ${q.get("surface_min")} et ${q.get("surface_max")} m²`
      : q.has("surface_min")
        ? `${q.get("surface_min")} m² ou plus`
        : q.has("surface_max") && `${q.get("surface_max")} m² ou moins`,
    q.has("jardin") && "avec jardin",
    q.has("dependance") && "avec garage, cave ou parking",
  ].filter(Boolean);

  return (
    <form className="filtres panel" action={action} method="get">
      {/* garde la section du drill-down quand on change un filtre */}
      {section && <input type="hidden" name="section" value={section} />}
      {evo && <input type="hidden" name="evo" value={evo} />}
      <label>
        <span className="label">Type</span>
        <select name="type" defaultValue={q.get("type")!}>
          {TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      <label>
        <span className="label">Budget max (€)</span>
        <input name="budget_max" type="number" inputMode="numeric" min={10000} max={2000000} step={1000}
          placeholder="ex. 250000" defaultValue={q.get("budget_max") ?? ""} />
      </label>
      <fieldset>
        <legend className="label">Période</legend>
        <select name="annee_min" aria-label="De" defaultValue={amin}>
          {ANNEES.map((a) => <option key={a}>{a}</option>)}
        </select>
        <span aria-hidden="true">à</span>
        <select name="annee_max" aria-label="À" defaultValue={amax}>
          {ANNEES.map((a) => <option key={a}>{a}</option>)}
        </select>
      </fieldset>
      <fieldset>
        <legend className="label">Surface (m²)</legend>
        <input name="surface_min" aria-label="Surface entre (m²)" type="number" inputMode="numeric" min={9} max={400}
          placeholder="entre" defaultValue={q.get("surface_min") ?? ""} />
        <span aria-hidden="true">et</span>
        <input name="surface_max" aria-label="Surface et (m²)" type="number" inputMode="numeric" min={9} max={400}
          placeholder="et" defaultValue={q.get("surface_max") ?? ""} />
      </fieldset>
      <div className="options">
      <label className="case">
        <input type="checkbox" name="jardin" value="true" defaultChecked={q.has("jardin")} /> Jardin
      </label>
      <label className="case">
        <input type="checkbox" name="dependance" value="true" defaultChecked={q.has("dependance")} /> Garage, cave ou parking
      </label>
      <div className="actions">
        <button className="bouton" type="submit">Appliquer</button>
        <Link className="lien-bouton" href={action}>Réinitialiser</Link>
      </div>
      </div>
      <p className="detail actifs" aria-live="polite">Recherche : {actifs.join(" · ")}</p>
    </form>
  );
}
