# Déploiement et exploitation

L'application se déploie comme **deux conteneurs** décrits par `docker-compose.yml` : `api` (FastAPI) et `web` (Next.js). Aucun volume, aucune base de données, aucun secret : tout est dans les images.

URL de production indiquée dans le `README.md` : `https://parcelle.pixelmorph.tech`, sur un VPS géré par Dokploy. L'API n'est **pas exposée** : seul `web` l'est.

## Les images

### `api/Dockerfile`

| Étape | Détail |
|---|---|
| Base | `python:3.12-slim`, avec `uv` copié depuis `ghcr.io/astral-sh/uv:0.11.8` |
| Dépendances | `uv sync --frozen --no-dev` depuis `pyproject.toml` et `uv.lock`, **avant** la copie du code : la couche reste en cache tant que `uv.lock` ne change pas |
| Code et données | copie de `calculs.py`, `main.py`, `modele.py` et de `data/` (**`prepare.py` n'est pas dans l'image**) |
| Modèle | `python modele.py` **pendant le build** : le modèle est entraîné une seule fois et jamais à une requête |
| Exécution | utilisateur non privilégié `app`, `uvicorn main:app --host 0.0.0.0 --port 8000` |

### `web/Dockerfile`

| Étape | Détail |
|---|---|
| Build | `node:22-alpine`, `pnpm` via `corepack`, `pnpm install --frozen-lockfile`, puis `pnpm build` |
| Exécution | seconde étape `node:22-alpine` avec la sortie `standalone` de Next.js, utilisateur `node`, `node server.js` |
| Variables fixées | `NODE_ENV=production`, `PORT=3000`, `HOSTNAME=0.0.0.0` |

La page lit `API_URL` **à chaque requête** : le build du front n'appelle donc jamais l'API, et les deux images se construisent indépendamment.

## `docker-compose.yml`

| Service | Particularités |
|---|---|
| `api` | `restart: unless-stopped`, `expose: 8000` (pas de `ports`), **healthcheck** : une requête vers `/health` toutes les 30 s, délai de 5 s, 3 essais |
| `web` | `restart: unless-stopped`, `API_URL=http://api:8000`, `expose: 3000`, démarre **après** que l'API est saine (`depends_on` avec `service_healthy`) |

## Variables d'environnement

| Variable | Service | Rôle | Valeur |
|---|---|---|---|
| `API_URL` | `web` | Adresse de l'API | `http://api:8000` dans le Compose ; `http://127.0.0.1:8000` par défaut en local |
| `WEB_PORT` | compose local (`docker-compose.ports.yml`) | Port de l'hôte | 3000 par défaut |
| `WEB_BIND` | compose local | Interface d'écoute | `127.0.0.1` par défaut ; `0.0.0.0` ouvre à tout le réseau |

Aucune autre variable n'est nécessaire. Les fichiers `.env*` sont ignorés par Git (sauf `.env.example`).

## En local avec Docker

```bash
docker compose -f docker-compose.yml -f docker-compose.ports.yml up -d --build   # http://127.0.0.1:3000
docker compose ps                                                                 # api « healthy », web « Up »
```

- `WEB_PORT=8080` change le port.
- Le port n'écoute que sur `127.0.0.1` : pour l'ouvrir au public, mettre un reverse proxy (Caddy, Nginx) devant.
- `WEB_BIND=0.0.0.0` l'ouvre directement, **en contournant ufw** (Docker écrit ses propres règles réseau) : à n'utiliser que sciemment.

## En production avec Dokploy

1. **Create Service → Compose** (et non « Application » : il y a deux Dockerfile, `api/` et `web/`).
2. **Provider GitHub** : dépôt `luacsoulet/api-web-data`, branche `main`, chemin du Compose `./docker-compose.yml`.
3. **Onglet Domains** : service `web`, port `3000`, le domaine, HTTPS (Let's Encrypt). Puis **Deploy**.

Aucun port n'est publié : le port 3000 de l'hôte est celui du tableau de bord Dokploy, et Traefik route le domaine vers le conteneur `web`. L'API reste interne. Il n'y a pas de mise en veille : rien à réveiller avant une démonstration.

## Mettre à jour la production

1. Fusionner dans `develop`, vérifier, puis fusionner `develop` dans `main` ([workflow](developpement.md#workflow-git)).
2. Redéployer dans Dokploy. Les images se reconstruisent ; **le modèle est ré-entraîné au build**.
3. Contrôler : `/` affiche des indicateurs et la carte, `/estimer` renvoie une estimation, `docker compose ps` indique `api` en `healthy`.

**Si les données changent** (nouveau Parquet) : c'est le même chemin. Un nouveau Parquet sans nouvelle image n'a aucun effet : le fichier est copié à la construction.

**Retour arrière :** redéployer le commit précédent de `main`. Comme il n'y a ni base ni volume, il n'y a rien à restaurer.

## Exploitation

| Sujet | Situation actuelle |
|---|---|
| **Supervision** | Le healthcheck de l'API et le redémarrage automatique. Rien de plus : ni métriques, ni alertes, ni journaux centralisés |
| **Sauvegardes** | Sans objet : aucun état. Le dépôt GitHub est la seule source |
| **Mises à l'échelle** | Un conteneur de chaque est prévu ; l'API est sans état et pourrait être dupliquée derrière un répartiteur |
| **Temps de réponse** | De 8 ms (`/kpis`) à 90 ms (`/ventes`) mesurés en local sur l'API (voir [architecture.md](architecture.md#données-en-mémoire)) ; le front met les réponses en cache une heure |
| **Cache du front** | Une heure (`revalidate: 3600`) : une donnée modifiée n'apparaît pas tout de suite sans redéploiement |
| **Point de défaillance** | Le fond de carte dépend d'OpenFreeMap : s'il est injoignable, les indicateurs s'affichent mais pas le fond |

## Sécurité

- L'API n'est pas publiée ; le conteneur `web` est la seule porte d'entrée.
- Les deux services tournent avec un **utilisateur non privilégié** (`app` et `node`).
- L'API ne sert que des données publiques en lecture seule ; son CORS est ouvert (`*`, `GET`) parce qu'elle est interne. **Si l'API devait un jour être exposée**, restreindre `allow_origins` et ajouter une limitation de débit.
- Aucun secret n'est requis. Ne pas en introduire dans le dépôt ni dans le Compose.
- L'application ne crée ni compte ni cookie de suivi. Le seul stockage côté navigateur est le choix du thème (`localStorage`).
- Les dépendances sont verrouillées (`uv.lock`, `pnpm-lock.yaml`) et les images les installent avec `--frozen` : une mise à jour se fait par un commit, jamais à la construction.
