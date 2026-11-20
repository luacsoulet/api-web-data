# Guide de développement

## Prérequis

| Outil | Version | Pour |
|---|---|---|
| Python | 3.12 (fixé dans `api/.python-version`) | l'API |
| [uv](https://docs.astral.sh/uv/) | récent | dépendances et exécution de l'API |
| Node.js | 22 (celui des images Docker) | le front |
| pnpm | 10.33.2 (`packageManager` de `web/package.json`, activable avec `corepack enable`) | le front |
| Docker | récent | construire et lancer les deux services ensemble (facultatif) |

## Organisation du dépôt

```text
.
├── README.md                 présentation, lancement, routes, déploiement
├── BACKLOG.md                sprints et contrat d'API v2
├── docs/                     cette documentation
├── docker-compose.yml        api + web, sans port publié (Dokploy)
├── docker-compose.ports.yml  publie le front sur l'hôte, hors Dokploy
├── api/
│   ├── main.py               routes FastAPI, validation des filtres
│   ├── calculs.py            filtrage et agrégations pandas, GeoJSON
│   ├── modele.py             entraînement du modèle d'estimation
│   ├── prepare.py            reconstruction du Parquet depuis DVF
│   ├── data/                 immobilier.parquet, communes.geojson
│   ├── tests/test_api.py     17 tests
│   ├── pyproject.toml, uv.lock
│   └── Dockerfile
└── web/
    ├── app/                  pages, composants, styles (App Router)
    ├── lib/api.ts            client de l'API et validation des filtres
    ├── package.json, pnpm-lock.yaml
    └── Dockerfile
```

## Lancer en local

Deux terminaux.

```bash
# Terminal 1 : l'API sur http://127.0.0.1:8000 (documentation interactive sur /docs)
cd api && uv sync && uv run uvicorn main:app --reload --port 8000

# Terminal 2 : le front sur http://localhost:3000
cd web && pnpm install && API_URL=http://127.0.0.1:8000 pnpm dev
```

Le front lit `API_URL` à chaque requête. Sans elle, il vise `http://127.0.0.1:8000`.

Tout lancer avec Docker : voir [deploiement.md](deploiement.md#en-local-avec-docker).

## Tests et qualité

```bash
cd api
uv run pytest -q                     # 17 tests
uv run ruff check .                  # lint
uv run ruff format --check .         # formatage

cd ../web
pnpm lint                            # ESLint
```

Les 17 tests de l'API (`api/tests/test_api.py`) utilisent le client de test de FastAPI sur le vrai fichier Parquet. Ils vérifient :

| Thème | Ce qui est vérifié |
|---|---|
| Santé et indicateurs | `/health`, `/kpis` |
| Classements | tri décroissant et `min_ventes` de `/communes`, tri chronologique de `/evolution` |
| Filtres | `budget_max` et `surface_max` réduisent bien `n_ventes` ; `422` sur type invalide, années inversées, surfaces inversées |
| Carte et ventes | 325 communes dans `/carte`, communes vides à `null` ; points, `total` et tri de `/ventes` |
| Drill-down | `/communes/{code}` (Orléans, 45234) et `404`, sections, ventes de la commune |
| Estimation | fourchette cohérente, verdict, `404`, comparables en points |
| Tranches de surface | ordre des tranches, toutes les années, tranches bornées par le filtre |

Il n'y a **pas de test du front** ni d'intégration continue dans le dépôt : la vérification se fait à la main avant chaque demande de fusion (tests et lint de l'API, `pnpm lint` et `pnpm build` du front).

## Workflow Git

Convention observée dans l'historique :

```text
feature/<sujet>  →  pull request  →  develop  →  pull request  →  main  →  déploiement
```

- Une branche par sujet (`feature/api-v2`, `feature/carte-2d`, `feature/estimer`, `feature/docker`…), une pull request vers `develop`.
- `main` est la branche déployée (Dokploy la suit) : ne la mettre à jour que par fusion de `develop`.
- Messages de commit en français, au format *Conventional Commits* avec portée : `feat(api): …`, `fix(web): …`, `docs: …`.
- Un commit = un changement cohérent et vérifiable.

## Tâches courantes

### Ajouter un filtre ou une route

Voir [frontend.md](frontend.md#ajouter-un-filtre) pour les six endroits à toucher. Pour une route : fonction dans `calculs.py` (le calcul), route dans `main.py` (la validation), test dans `test_api.py`, ligne dans [api.md](api.md) et dans le tableau du `README.md`.

### Mettre à jour les données

```bash
cd api
uv run python prepare.py       # reconstruit data/immobilier.parquet depuis DVF
uv run python modele.py        # réentraîne le modèle (écrit modele.joblib)
uv run pytest -q               # les tests dépendent des données
```

Relever les nouveaux chiffres (nombre de ventes, MAE, MAPE) et mettre à jour `README.md` et [donnees.md](donnees.md). Détail et précautions : [donnees.md](donnees.md#construction--apipreparepy).

### Étendre la période (2026, par exemple)

Les années sont écrites en dur à plusieurs endroits : `prepare.py` (la plage téléchargée), `main.py` (`annee_min`, `annee_max` bornés à 2021-2025 et la valeur par défaut de `annee_max`), `web/lib/api.ts` (`ANNEES` et la validation), le formulaire (`Filtres.tsx`), l'année fixée à 2025 dans `/estimation`, et les tests (`range(2021, 2026)`).

### Mettre à jour une dépendance

```bash
cd api && uv lock --upgrade-package <paquet> && uv sync && uv run pytest -q
cd web && pnpm update <paquet> && pnpm lint && pnpm build
```

`web/AGENTS.md` met en garde : cette version de Next.js a des changements incompatibles avec les précédentes ; lire le guide de `node_modules/next/dist/docs/` avant de modifier l'usage de ses API.

## Dépannage

| Symptôme | Cause probable | Remède |
|---|---|---|
| Le front affiche une erreur et aucune donnée | L'API n'est pas démarrée, ou `API_URL` est faux | Lancer l'API, ou passer `API_URL` au démarrage du front |
| `/estimation` met une dizaine de secondes la première fois | `modele.joblib` absent : l'API l'entraîne une fois | Lancer `uv run python modele.py` avant |
| `404 Commune … inconnue` sur une commune qui existe | Le code n'a aucune vente dans le jeu (commune absente du Parquet) | Vérifier le code INSEE ; certaines communes n'ont aucune vente retenue |
| La carte reste vide ou le fond manque | OpenFreeMap injoignable (réseau, pare-feu) | Vérifier l'accès à `tiles.openfreemap.org` |
| `docker compose up` : port 3000 déjà pris | Dokploy ou un autre service occupe le port | `WEB_PORT=8080 docker compose … up` |
| Les tests échouent après une mise à jour des données | Le jeu a changé (nombre de communes, filtres) | Comprendre l'écart avant d'adapter un test ; ne pas assouplir un test pour le faire passer |

## Tenir la documentation à jour

| Si vous changez… | Mettre à jour |
|---|---|
| une route, un paramètre, un format de réponse | [api.md](api.md), tableau du `README.md` |
| une page, un composant, un comportement visible | [frontend.md](frontend.md) |
| le Parquet, `prepare.py` ou le modèle | [donnees.md](donnees.md), chiffres de `README.md` et de [docs/README.md](README.md) |
| la base enrichie de l'équipe données | [base-enrichie.md](base-enrichie.md), [dictionnaire-colonnes.md](dictionnaire-colonnes.md) |
| le déploiement | [deploiement.md](deploiement.md) |
