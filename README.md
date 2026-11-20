# Immo Orléans

URL : à compléter après déploiement : front Vercel · API : à compléter (URL Render)

Pour : un couple qui cherche à acheter dans le Loiret, qui doit décider dans quelle commune chercher, pour quel budget

Données : DGFiP, DVF géolocalisées (Etalab), Loiret, ventes d'un logement 2021-2025 (46 022 ventes, 325 communes), Licence Ouverte 2.0

Framework : FastAPI sépare les calculs (pandas, cache) de l'affichage et sert une API réutilisable (bonus back-end séparé). Next.js rend la page côté serveur avec les données préchargées, donc elle s'affiche complète dès la première visite, y compris sur téléphone.

Couche ML ou LLM : à venir au sprint 3

Assistant de code : Claude Code, pour le squelette de l'API, du front et ce README

Depuis la version intermédiaire : à venir

## Lancer en local

Deux terminaux.

Terminal 1, l'API :

```bash
cd api && uv sync && uv run uvicorn main:app --reload --port 8000
```

Terminal 2, le front :

```bash
cd web && pnpm install && API_URL=http://127.0.0.1:8000 pnpm dev
```

Tests et lint de l'API :

```bash
cd api && uv run pytest -q
cd api && uv run ruff check . && uv run ruff format --check .
```

## Données

`api/data/immobilier.parquet` est versionné. Pour le reconstruire depuis DVF (data.gouv.fr) : `cd api && uv run python prepare.py`. Filtres : ventes d'un seul logement, 10 k€-2 M€, 9-400 m², 300-8 000 €/m².

## Routes de l'API

Paramètre commun `type` : `Maison` | `Appartement` | `Tous` (défaut `Maison`). Toutes les médianes, jamais des moyennes.

| Route | Réponse JSON |
|---|---|
| `GET /health` | `{"ok": true}` |
| `GET /kpis?type=` | `{"n_ventes": int, "prix_m2_median": float, "valeur_median": float, "n_communes": int}` |
| `GET /communes?type=&min_ventes=30&limit=15` | `[{"code_commune": str, "nom_commune": str, "n": int, "prix_m2_median": float, "valeur_median": float}]`, triée par `prix_m2_median` décroissant, communes avec `n >= min_ventes` seulement |
| `GET /evolution?type=` | `[{"annee": int, "n": int, "prix_m2_median": float}]`, triée par année |

`prix_m2_median` et `valeur_median` sont `float | null` : un NaN pandas devient `null`. Le front affiche « n/d ».
`type` invalide → 422. `min_ventes` borné 1-1000, `limit` borné 1-325.

## Déployer

1. Pousser le dépôt sur GitHub :

   ```bash
   git remote add origin <url-du-dépôt>
   git push -u origin main
   ```

   Le fichier `api/data/immobilier.parquet` est versionné : il part avec le dépôt.

2. Render : « New Web Service », racine `api`, plan Free.
   - Build command : `pip install uv && uv sync --frozen`
   - Start command : `uv run uvicorn main:app --host 0.0.0.0 --port $PORT`
   - Noter l'URL du service.

3. Vercel : importer le dépôt, racine `web`, variable d'environnement `API_URL` = URL Render, puis déployer.

4. Avant la démo, ouvrir `/health` de l'API pour la réveiller : le plan gratuit se met en veille, le réveil prend environ 50 s.

## Choix de design

Direction « Cadastre » : esprit plan cadastral et grille de géomètre, typographies IBM Plex Sans et IBM Plex Mono, encre bleue, surligneur jaune pour le constat.
