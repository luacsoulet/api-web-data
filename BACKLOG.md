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
| `GET /ventes?<filtres>&limit=3000` | GeoJSON FeatureCollection de points (ventes avec coordonnées) correspondant aux filtres, plus récentes d'abord, `limit` 1-5000 ; `properties`: `id_mutation`, `date_mutation`, `type`, `valeur_fonciere`, `surface_reelle_bati`, `nombre_pieces_principales`, `prix_m2`, `nom_commune`, `section`, `avec_jardin`, `avec_dependance` ; en-tête de réponse ou champ `total` : nombre total de ventes filtrées (avant limit) |
| `GET /communes/{code}?<filtres>` | `{"code_commune", "nom_commune", "n", "prix_m2_median", "valeur_median"}` ; 404 si code inconnu |
| `GET /communes/{code}/sections?<filtres>` | `[{"section", "n", "prix_m2_median", "valeur_median"}]`, prix décroissant |
| `GET /communes/{code}/ventes?<filtres>&section=&limit=200` | `[{"id_mutation", "date_mutation" (YYYY-MM-DD), "type", "valeur_fonciere", "surface_reelle_bati", "nombre_pieces_principales", "prix_m2", "surface_terrain", "section", "avec_dependance", "avec_jardin", "avec_eau", "longitude", "latitude"}]`, plus récentes d'abord ; `limit` 1-1000 ; lon/lat null possibles |
| `GET /estimation?type=Maison\|Appartement&code_commune=&surface=&pieces=&jardin=&dependance=&prix_demande=` | `{"prix_estime", "fourchette_basse", "fourchette_haute", "mae", "mape", "n_entrainement", "n_test", "comparables": {"n", "prix_median"}, "verdict": "au-dessus" \| "dans la fourchette" \| "au-dessous" \| null}` ; `verdict` null sans `prix_demande` ; 404 commune inconnue |

## T1 · API v2 — difficulté 3
- Fichiers : `api/calculs.py`, `api/main.py`, `api/modele.py` (nouveau), `api/tests/test_api.py`, `api/pyproject.toml`/`uv.lock` (scikit-learn, joblib), `api/Dockerfile` (copier `modele.py` et le modèle ou l'entraîner au build).
- Modèle : régression sur log(valeur_fonciere) avec type, surface, pièces, surface_terrain, commune (encodage cible ou catégoriel), année, options ; scikit-learn `HistGradientBoostingRegressor` ; split train/test 80/20 graine fixe ; MAE et MAPE sur le test ; fourchette = estimation ± MAE. Entraîné au démarrage si absent (moins de 30 s) ou au build Docker, jamais à chaque requête.
- Critère : `uv run pytest -q` (tests des nouvelles routes, filtres et 422), ruff propre, `docker build api` OK.

## T2 · Web : filtres, carte 2D améliorée avec points, drill-down — difficulté 3
- Décision utilisateur (20/11 midi) : PAS de 3D, PAS de plan de maison. Une carte 2D soignée.
- Fichiers : `web/lib/api.ts`, `web/app/page.tsx`, `web/app/layout.tsx`, `web/app/globals.css`, `web/app/Carte.tsx`, `web/app/Filtres.tsx`, `web/app/commune/[code]/*`, `web/package.json`.
- Filtres GET (URL = état) : type, budget max, période, surface min, jardin, dépendance ; appliqués aux indicateurs, au graphique et à la carte ; récap des filtres actifs.
- Carte MapLibre GL + fond OpenFreeMap : communes colorées par prix médian au m² (un seul ton + légende chiffrée, hachuré si < 5 ventes) ET les ventes qui correspondent à la recherche en points (clusters avec nombre au zoom faible, points individuels au zoom fort, popup : prix, m², pièces, €/m², date, options). Bascule « Communes / Ventes / Les deux ». Clic commune → drill-down.
- Drill-down `/commune/[code]` : indicateurs, sections en barres, ventes en tableau + points sur la carte zoomée.

## T3 · Web : estimateur de prix (ML) — difficulté 2
- Fichiers : `web/app/estimer/**` uniquement.
- Formulaire simple (commune en combobox recherchable, type, surface, pièces, jardin, dépendance, prix demandé facultatif) → server action → `/estimation` ; affiche prix estimé, fourchette, MAE/MAPE et n test, comparables, verdict. Mention « DVF ne dit rien de la piscine, de l'étage ni du DPE ».

## T4 · README, accessibilité, soutenance — difficulté 1
- Fichiers : `README.md`.
- Critère : gabarit du cours à jour (couche ML et sa limite, depuis la version intermédiaire), routes v2.
