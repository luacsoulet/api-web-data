# Backlog · Immo Orléans (cas 5)

Utilisateur : un couple (ou une famille, des colocataires) qui cherche où acheter dans le Loiret. Décision : dans quelle commune chercher, pour quel budget et quel logement.
Données : `api/data/immobilier.parquet` (DGFiP, DVF géolocalisées, Licence Ouverte 2.0, 46 022 ventes 2021-2025), `api/data/communes.geojson` (325 communes du Loiret, `code_insee`, `commune` ; GéoLoiret, Licence Ouverte 2.0).
Colonnes en plus depuis le sprint 2 : `avec_dependance`, `avec_jardin`, `avec_eau` (booléens, lus sur les autres lignes de la vente). DVF ne connaît ni la piscine, ni le type des pièces, ni l'étage, ni le DPE : l'appli le dit.

Sprint 1 : fait (v0.1.0). Sprints 2 à 4 ci-dessous.

## Contrat d'API v2 (partagé par T1, T2, T3)

### Filtres communs (une seule dépendance FastAPI, appliquée à TOUTES les routes de données)

| Paramètre | Type | Défaut | Bornes |
|---|---|---|---|
| `type` | `Maison` \| `Appartement` \| `Tous` | `Maison` | |
| `budget_max` | int \| absent | absent | 10 000 - 2 000 000 |
| `annee_min`, `annee_max` | int | 2021, 2025 | 2021 - 2025, `annee_min <= annee_max` sinon 422 |
| `surface_min` | int \| absent | absent | 9 - 400 |
| `pieces_min` | int \| absent | absent | 1 - 10 |
| `jardin`, `dependance` | bool | false | true = seulement les ventes avec cette option |

Médianes seulement. `float | null` partout où une médiane peut porter sur 0 vente (NaN → null).

### Routes

| Route | Réponse |
|---|---|
| `GET /health` | `{"ok": true}` |
| `GET /kpis?<filtres>` | `{"n_ventes", "prix_m2_median", "valeur_median", "n_communes"}` |
| `GET /communes?<filtres>&min_ventes=30&limit=15` | `[{"code_commune", "nom_commune", "n", "prix_m2_median", "valeur_median"}]`, prix décroissant |
| `GET /evolution?<filtres>` | `[{"annee", "n", "prix_m2_median"}]` |
| `GET /carte?<filtres>` | GeoJSON FeatureCollection des 325 communes ; `properties`: `code_insee`, `commune`, `n` (0 possible), `prix_m2_median` (null si n=0), `valeur_median` (null si n=0). Géométrie inchangée. |
| `GET /communes/{code}?<filtres>` | `{"code_commune", "nom_commune", "n", "prix_m2_median", "valeur_median"}` ; 404 si code inconnu |
| `GET /communes/{code}/sections?<filtres>` | `[{"section", "n", "prix_m2_median", "valeur_median"}]`, prix décroissant |
| `GET /communes/{code}/ventes?<filtres>&section=&limit=200` | `[{"id_mutation", "date_mutation" (YYYY-MM-DD), "type", "valeur_fonciere", "surface_reelle_bati", "nombre_pieces_principales", "prix_m2", "surface_terrain", "section", "avec_dependance", "avec_jardin", "avec_eau", "longitude", "latitude"}]`, plus récentes d'abord ; `limit` 1-1000 ; lon/lat null possibles |
| `GET /estimation?type=Maison\|Appartement&code_commune=&surface=&pieces=&jardin=&dependance=&prix_demande=` | `{"prix_estime", "fourchette_basse", "fourchette_haute", "mae", "mape", "n_entrainement", "n_test", "comparables": {"n", "prix_median"}, "verdict": "au-dessus" \| "dans la fourchette" \| "au-dessous" \| null}` ; `verdict` null sans `prix_demande` ; 404 commune inconnue |

## T1 · API v2 — difficulté 3
- Fichiers : `api/calculs.py`, `api/main.py`, `api/modele.py` (nouveau), `api/tests/test_api.py`, `api/pyproject.toml`/`uv.lock` (scikit-learn, joblib), `api/Dockerfile` (copier `modele.py` et le modèle ou l'entraîner au build).
- Modèle : régression sur log(valeur_fonciere) avec type, surface, pièces, surface_terrain, commune (encodage cible ou catégoriel), année, options ; scikit-learn `HistGradientBoostingRegressor` ; split train/test 80/20 graine fixe ; MAE et MAPE sur le test ; fourchette = estimation ± MAE. Entraîné au démarrage si absent (moins de 30 s) ou au build Docker, jamais à chaque requête.
- Critère : `uv run pytest -q` (tests des nouvelles routes, filtres et 422), ruff propre, `docker build api` OK.

## T2 · Web : filtres, carte 3D, drill-down — difficulté 3
- Fichiers : `web/lib/api.ts`, `web/app/page.tsx`, `web/app/globals.css`, `web/app/commune/[code]/*`, `web/app/Carte.tsx` (client), `web/app/Filtres.tsx`, `web/package.json`.
- Filtres en formulaire GET (URL = état) : type, budget max, période, surface min ; appliqués aux 3 indicateurs, au graphique et à la carte ; récap des filtres actifs.
- Carte MapLibre GL + fond OpenFreeMap (positron en clair, sombre en mode sombre), communes colorées par prix au m² (échelle séquentielle un seul ton + légende chiffrée, gris hachuré si moins de 5 ventes), bouton « Vue 3D » : extrusion hauteur = prix au m², inclinaison 50° ; « Vue 2D » revient à plat. Survol/focus : nom, prix, nombre de ventes. Clic : drill-down.
- Drill-down : `/commune/[code]` (filtres conservés) : indicateurs de la commune, sections cadastrales en barres (titre = constat), ventes en tableau + points sur la carte ; clic section → ventes de la section. Fil d'Ariane Loiret › commune › section.
- Lien « Simuler mon logement » vers `/simulateur` dans l'en-tête.
- Critère : `pnpm build` et `pnpm lint` OK, page rendue côté serveur, carte chargée côté client sans bloquer le premier affichage.

## T3 · Web : simulateur avec plan et estimation ML — difficulté 3
- Fichiers : `web/app/simulateur/*` uniquement (page, composants, `simulateur.module.css`, appels API dans `web/app/simulateur/api.ts`).
- Profil : couple, famille, colocation (préremplit les pièces), commune (combobox recherchable), type, surface, pièces (curseur 1-8), options jardin / dépendance, prix demandé facultatif.
- Mini plan d'architecte en SVG, redessiné en direct : séjour, cuisine, chambres, salle de bain selon le nombre de pièces, surfaces proportionnelles à la surface choisie, jardin et garage/cave dessinés si cochés ; style trait d'encre « Cadastre » ; texte alternatif qui décrit le plan.
- Résultat : prix estimé, fourchette, erreur moyenne du modèle (MAE, MAPE, n test), comparables, verdict sur le prix demandé ; communes où ce logement s'est vendu sous le budget.
- Critère : `pnpm build` et `pnpm lint` OK ; mention « DVF ne dit rien de la piscine, de l'étage ni du DPE ».

## T4 · README, accessibilité, soutenance — difficulté 1
- Fichiers : `README.md`.
- Critère : gabarit du cours à jour (couche ML et sa limite, depuis la version intermédiaire), routes v2, captures de l'audit d'accessibilité à faire.
