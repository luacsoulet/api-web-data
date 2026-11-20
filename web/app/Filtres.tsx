import Link from "next/link";
import { ANNEES, DPE, MATERIAUX, TYPES } from "@/lib/api";

const nombre = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const annee = (a: string) => (a === "2026" ? "2026 (1er semestre)" : a);

/** Formulaire GET : l'URL porte l'état, fonctionne sans JavaScript. `q` = filtres déjà validés. */
export default function Filtres({ q, action, section, evo, garder }: {
  q: URLSearchParams; action: string; section?: string; evo?: string;
  /** paramètres d'URL à conserver tels quels (page Autour : point, rayon, adresse) */
  garder?: Record<string, string>;
}) {
  const amin = q.get("annee_min") ?? "2021";
  const amax = q.get("annee_max") ?? "2026";
  const dpe = q.getAll("dpe");
  const materiau = q.get("materiau") as keyof typeof MATERIAUX | null;
  const capres = q.get("construit_apres");
  const cavant = q.get("construit_avant");
  const batiment = [
    dpe.length > 0 && `DPE ${dpe.join(", ")}`,
    materiau && `murs en ${MATERIAUX[materiau].toLowerCase()}`,
    capres && cavant ? `construit entre ${capres} et ${cavant}` : capres ? `construit en ${capres} ou après` : cavant && `construit en ${cavant} ou avant`,
  ].filter((x): x is string => Boolean(x));
  const risques = [
    q.get("argile_max") === "faible" && "argile : aléa faible seulement",
    q.get("argile_max") === "moyen" && "argile : sans aléa fort",
    q.has("hors_inondable") && "hors zone inondable",
    q.has("hors_nappe") && "sans débordement de nappe",
  ].filter((x): x is string => Boolean(x));
  const attractivite = [
    q.has("medecins_min") && `${q.get("medecins_min")} médecin(s) ou plus à 1 km`,
    q.has("ecoles_min") && `${q.get("ecoles_min")} école(s) ou plus à 1 km`,
    q.has("commerces_min") && `${q.get("commerces_min")} commerce(s) alimentaire(s) ou plus à 1 km`,
    q.has("gare_max_m") && `gare à moins de ${nombre.format(Number(q.get("gare_max_m")))} m`,
  ].filter((x): x is string => Boolean(x));
  const actifs = [
    q.get("type") === "Tous" ? "tous types" : q.get("type")!.toLowerCase(),
    q.has("budget_max") && `jusqu'à ${nombre.format(Number(q.get("budget_max")))} €`,
    amin === amax ? `en ${annee(amin)}` : `de ${amin} à ${annee(amax)}`,
    q.has("surface_min") && q.has("surface_max")
      ? `entre ${q.get("surface_min")} et ${q.get("surface_max")} m²`
      : q.has("surface_min")
        ? `${q.get("surface_min")} m² ou plus`
        : q.has("surface_max") && `${q.get("surface_max")} m² ou moins`,
    q.has("jardin") && "avec jardin",
    q.has("dependance") && "avec garage, cave ou parking",
    q.has("piscine") && "avec piscine",
    ...batiment,
    ...risques,
    ...attractivite,
  ].filter(Boolean);
  const nb = (l: string[]) => (l.length ? ` (${l.length} actif${l.length > 1 ? "s" : ""})` : "");

  return (
    <form className="filtres panel" action={action} method="get">
      {/* garde la section du drill-down quand on change un filtre */}
      {section && <input type="hidden" name="section" value={section} />}
      {evo && <input type="hidden" name="evo" value={evo} />}
      {Object.entries(garder ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
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
        <legend className="label">Période de vente</legend>
        <select name="annee_min" aria-label="De" defaultValue={amin}>
          {ANNEES.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <span aria-hidden="true">à</span>
        <select name="annee_max" aria-label="À" defaultValue={amax}>
          {ANNEES.map((a) => <option key={a} value={a}>{annee(String(a))}</option>)}
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
        <label className="case">
          <input type="checkbox" name="piscine" value="true" defaultChecked={q.has("piscine")} /> Piscine
        </label>
      </div>

      {/* filtres avancés : repliés, ouverts d'office dès qu'un de leurs filtres est actif */}
      <details className="groupe" open={batiment.length > 0}>
        <summary>Bâtiment &amp; énergie{nb(batiment)}</summary>
        <div className="groupe-corps">
          <fieldset className="dpe">
            <legend className="label">Classe énergie (DPE)</legend>
            {DPE.map((d) => (
              <label key={d} className="case">
                <input type="checkbox" name="dpe" value={d} defaultChecked={dpe.includes(d)} /> {d}
              </label>
            ))}
          </fieldset>
          <label>
            <span className="label">Matériau des murs</span>
            <select name="materiau" defaultValue={materiau ?? ""}>
              <option value="">Tous</option>
              {Object.entries(MATERIAUX).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <fieldset>
            <legend className="label">Construit entre</legend>
            <input name="construit_apres" aria-label="Construit en ou après (année)" type="number" inputMode="numeric"
              min={1800} max={2026} placeholder="ex. 1975" defaultValue={capres ?? ""} />
            <span aria-hidden="true">et</span>
            <input name="construit_avant" aria-label="Construit en ou avant (année)" type="number" inputMode="numeric"
              min={1800} max={2026} placeholder="ex. 2026" defaultValue={cavant ?? ""} />
          </fieldset>
        </div>
      </details>

      <details className="groupe" open={risques.length > 0}>
        <summary>Risques{nb(risques)}</summary>
        <div className="groupe-corps">
          <label>
            <span className="label">Argile (retrait-gonflement)</span>
            <select name="argile_max" defaultValue={q.get("argile_max") ?? "fort"}>
              <option value="fort">Tous les aléas</option>
              <option value="moyen">Exclure l&apos;aléa fort</option>
              <option value="faible">Aléa faible seulement</option>
            </select>
          </label>
          <label className="case">
            <input type="checkbox" name="hors_inondable" value="true" defaultChecked={q.has("hors_inondable")} /> Hors zone inondable (Loire)
          </label>
          <label className="case">
            <input type="checkbox" name="hors_nappe" value="true" defaultChecked={q.has("hors_nappe")} /> Sans débordement de nappe
          </label>
        </div>
      </details>

      <details className="groupe" open={attractivite.length > 0}>
        <summary>Attractivité, à moins de 1 km{nb(attractivite)}</summary>
        <div className="groupe-corps">
          {(
            [
              ["medecins_min", "Médecins généralistes (min.)", "ex. 2"],
              ["ecoles_min", "Écoles (min.)", "ex. 1"],
              ["commerces_min", "Commerces alimentaires (min.)", "ex. 3"],
            ] as const
          ).map(([nom, libelle, exemple]) => (
            <label key={nom}>
              <span className="label">{libelle}</span>
              <input name={nom} type="number" inputMode="numeric" min={1} max={100} placeholder={exemple}
                defaultValue={q.get(nom) ?? ""} />
            </label>
          ))}
          <label>
            <span className="label">Gare à moins de (m)</span>
            <input name="gare_max_m" type="number" inputMode="numeric" min={100} max={50000} step={100}
              placeholder="ex. 2000" defaultValue={q.get("gare_max_m") ?? ""} />
          </label>
        </div>
      </details>

      <div className="options">
        <div className="actions">
          <button className="bouton" type="submit">Appliquer</button>
          <Link className="lien-bouton" href={garder ? `${action}?${new URLSearchParams(garder)}` : action}>Réinitialiser</Link>
        </div>
      </div>
      <p className="detail actifs" aria-live="polite">Recherche : {actifs.join(" · ")}</p>
    </form>
  );
}
