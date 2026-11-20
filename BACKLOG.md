# Backlog · Immo Orléans (cas 5) · Sprint 1

But du sprint 1 : une première page en ligne (titre, filtre, graphique), back FastAPI + front Next.js.
Utilisateur : un couple qui veut acheter dans le Loiret. Décision : dans quelle commune chercher, pour quel budget.
Données : `api/data/immobilier.parquet` (DGFiP, DVF géolocalisées Etalab, Licence Ouverte 2.0, 46 022 ventes 2021-2025).

## Contrat d'API (partagé par T1 et T2)

Paramètre commun `type` : `Maison` | `Appartement` | `Tous` (défaut `Maison`). Toutes les médianes, jamais des moyennes.

| Route | Réponse JSON |
|---|---|
| `GET /health` | `{"ok": true}` |
| `GET /kpis?type=` | `{"n_ventes": int, "prix_m2_median": float, "valeur_median": float, "n_communes": int}` |
| `GET /communes?type=&min_ventes=30&limit=15` | `[{"code_commune": str, "nom_commune": str, "n": int, "prix_m2_median": float, "valeur_median": float}]`, triée par `prix_m2_median` décroissant, communes avec `n >= min_ventes` seulement |
| `GET /evolution?type=` | `[{"annee": int, "n": int, "prix_m2_median": float}]`, triée par année |

`type` invalide → 422 (FastAPI `Literal`). `min_ventes` borné 1-1000, `limit` borné 1-325.

## T1 · API FastAPI — difficulté 2
- Fichiers : `api/` (pyproject uv, `calculs.py`, `main.py`, `tests/test_api.py`)
- Critère : `cd api && uv run pytest -q` passe, `uv run ruff check . && uv run ruff format --check .` propres, `uv run uvicorn main:app` sert les 4 routes du contrat.

## T2 · Front Next.js, direction « Cadastre » — difficulté 2
- Fichiers : `web/` (Next 16 App Router, TypeScript, pnpm)
- Critère : `cd web && pnpm build` passe ; la page est rendue côté serveur avec les données préchargées depuis l'API (`API_URL`), un filtre type (Maison / Appartement / Tous) dans l'URL, 3 indicateurs, un graphique en barres des communes dont le titre dit le constat.

## T3 · README — difficulté 1
- Fichiers : `README.md`
- Critère : gabarit du cours rempli (URL, pour qui, données, framework, couche, assistant, lancer), lancement local des deux services, déploiement Render (API) + Vercel (web).
