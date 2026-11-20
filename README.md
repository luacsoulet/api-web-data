# Immo Orléans

URL : à compléter après déploiement : front Vercel · API : à compléter (URL Render)

Branche de travail : `dev-sprint1-ro` (`main` intacte).

Pour : un couple qui cherche à acheter dans le Loiret, qui doit décider dans quelle commune chercher, pour quel budget

Données : DGFiP, DVF géolocalisées (Etalab), Loiret, ventes d'un logement 2021-2025 (46 022 ventes, 325 communes), Licence Ouverte 2.0

Framework : FastAPI sépare les calculs (pandas, cache) de l'affichage et sert une API réutilisable (bonus back-end séparé). Next.js rend la page côté serveur avec les données préchargées, donc elle s'affiche complète dès la première visite, y compris sur téléphone.

Couche ML ou LLM : Nemotron, résumé de l'agrégat de la vue filtrée en 3 phrases (route POST /resume, clés NEMOTRON_URL / NEMOTRON_KEY / NEMOTRON_KEY).

Assistant de code : Claude Code, pour le squelette de l'API, du front et ce README

Depuis la version intermédiaire : carte Leaflet interactive (type maps) avec marqueurs géolocalisés, filtres année et budget_max, drill-down fiche détaillée au clic, résumé Nemotron.

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
| `GET /points?type=&limit=` | `[{id_mutation, nom_commune, type, prix, surface, prix_m2, nombre_pieces, date, latitude, longitude}]`, ventes géolocalisées pour les marqueurs de la carte (max 2000, défaut 500) |
| `POST /resume` | `{resume: str}` : résumé Nemotron de l'agrégat `{kpis, communes}` (3 phrases FR, sans inventer de chiffre) |

`prix_m2_median` et `valeur_median` sont `float | null` : un NaN pandas devient `null`. Le front affiche « n/d ».
`type` invalide → 422. `min_ventes` borné 1-1000, `limit` borné 1-325.

## Déployer sur un VPS (Docker)

Prérequis : Docker et le plugin compose sur le VPS.

```bash
git clone https://github.com/luacsoulet/api-web-data.git immo && cd immo
docker compose up -d --build          # front sur le port 3000 (WEB_PORT=8080 pour en changer)
docker compose ps                     # api « healthy », web « Up »
```

Mettre à jour après un push sur `main` : `git pull && docker compose up -d --build`.

- L'API n'est pas exposée : seul le front l'appelle, par le réseau interne de compose (`API_URL=http://api:8000`).
- HTTPS : mettre un reverse proxy devant le port 3000, par exemple Caddy (`immo.mondomaine.fr { reverse_proxy 127.0.0.1:3000 }`), qui gère le certificat seul. Lancer alors `WEB_BIND=127.0.0.1 docker compose up -d --build` : Docker contourne ufw, sans ça le port 3000 reste ouvert sur Internet.
- Pas de mise en veille comme sur les offres gratuites : rien à réveiller avant la démo.

## Déployer (Render + Vercel)

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
