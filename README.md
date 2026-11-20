# Immo Orléans

URL : https://parcelle.pixelmorph.tech (VPS, Dokploy) · API : interne au compose, non exposée

Pour : un couple, une famille ou des colocataires qui cherche à acheter dans le Loiret, qui doit décider dans quelle commune chercher, pour quel budget

Données : DGFiP, DVF géolocalisées (Etalab), Loiret, ventes d'un logement 2021-2025 (46 022 ventes, 325 communes), Licence Ouverte 2.0

Framework : FastAPI sépare les calculs (pandas, cache) de l'affichage et sert une API réutilisable (bonus back-end séparé). Next.js rend la page côté serveur avec les données préchargées, donc elle s'affiche complète dès la première visite, y compris sur téléphone.

Couche ML : estimateur de prix (page /estimer), HistGradientBoosting sur log(prix) avec commune en TargetEncoder ; erreur sur 9 205 ventes de test : MAE ± 41 881 €, MAPE 28,5 %. Limite : DVF ignore l'état du bien, l'étage, le DPE et la piscine ; la fourchette est large.

Assistant de code : Claude Code, pour le squelette de l'API, du front et ce README

Retours pris en compte : <à compléter avec le retour reçu à la version intermédiaire>

Depuis la version intermédiaire : filtres budget, période, surface, jardin, garage appliqués partout ; carte MapLibre 2D (fond OpenFreeMap) avec communes colorées et ventes de la recherche en points ; drill-down commune → section → ventes ; estimateur ML ; thème clair par défaut avec bouton sombre ; déploiement Docker sur VPS.

Couche IA générique : compatible OpenAI, résumé de l'agrégat de la vue filtrée en 3 phrases (route POST /resume, clés IA_URL / IA_KEY / IA_MODEL).

Depuis la version intermédiaire (design local) : vue Relief 3D MapLibre avec marqueurs géolocalisés (route /points), modèle 3D Three.js et comparaison commune sur /vente/[id], filtre `annee` (équivaut à annee_min = annee_max), icônes par type de bien.

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

Tests : `cd api && uv run pytest -q` (12 tests). Modèle : `cd api && uv run python modele.py` (environ 10 s ; fait automatiquement au build Docker).

## Données

`api/data/biens.parquet` est versionné : une ligne par vente (49 884, 2021 → juin 2026), DVF croisé avec BDNB, DPE ADEME, cadastre (piscines), Géorisques (argile, TRI, nappes), bruit, BPE et Filosofi. Reconstruit par `api/prepare_biens.py` depuis les données brutes. Pas d'adresse publiée. Filtres : ventes d'un seul logement, 10 k€-2 M€, 9-400 m², 300-8 000 €/m².

`api/data/communes.geojson` : contours des 325 communes (GéoLoiret, Licence Ouverte 2.0). Colonnes calculées : avec_dependance, avec_jardin, avec_eau (lues sur les autres lignes de la vente).

## Routes de l'API

Paramètre commun `type` : `Maison` | `Appartement` | `Tous` (défaut `Maison`). Toutes les médianes, jamais des moyennes.

| Paramètre | Type | Défaut | Bornes |
|---|---|---|---|
| `type` | `Maison` \| `Appartement` \| `Tous` | `Maison` | |
| `budget_max` | int \| absent | absent | 10 000 - 2 000 000 |
| `annee_min`, `annee_max` | int | 2021, 2025 | 2021 - 2025, `annee_min <= annee_max` sinon 422 |
| `surface_min` | int \| absent | absent | 9 - 400 |
| `pieces_min` | int \| absent | absent | 1 - 10 |
| `jardin`, `dependance` | bool | false | true = seulement les ventes avec cette option |

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
| `GET /points?<filtres>&limit=` | `[{id_mutation, nom_commune, type, prix, surface, prix_m2, nombre_pieces, date, latitude, longitude}]`, ventes géolocalisées pour les marqueurs de la carte (max 2000, défaut 500) |
| `POST /resume` | `{resume: str}` : résumé IA générique de l'agrégat `{kpis, communes}` (3 phrases FR, sans inventer de chiffre) |

`prix_m2_median` et `valeur_median` sont `float | null` : un NaN pandas devient `null`. Le front affiche « n/d ».
`type` invalide → 422. `min_ventes` borné 1-1000, `limit` borné 1-325.

## Déployer sur un VPS avec Dokploy

1. Create Service → **Compose** (pas « Application » : il y a deux Dockerfile, `api/` et `web/`).
2. Provider GitHub : `luacsoulet/api-web-data`, branche `main`, Compose Path `./docker-compose.yml`.
3. Onglet Domains : service `web`, port `3000`, votre domaine, HTTPS (Let's Encrypt). Puis Deploy.

Aucun port n'est publié : le port 3000 de l'hôte est celui du tableau de bord Dokploy, Traefik route le domaine vers le conteneur `web`. L'API reste interne (`API_URL=http://api:8000`). Pas de mise en veille : rien à réveiller avant la démo.

## Lancer avec Docker, sans Dokploy

```bash
docker compose -f docker-compose.yml -f docker-compose.ports.yml up -d --build   # http://127.0.0.1:3000
docker compose ps                                                                 # api « healthy », web « Up »
```

`WEB_PORT=8080` change le port. Le port écoute sur `127.0.0.1` : mettre un reverse proxy (Caddy, Nginx) devant pour l'ouvrir au public. `WEB_BIND=0.0.0.0` l'ouvre directement, en contournant ufw.

## Choix de design

Direction « Cadastre » : esprit plan cadastral et grille de géomètre, typographies IBM Plex Sans et IBM Plex Mono, encre bleue, surligneur jaune pour le constat.

## Serveur MCP

`mcp/serveur.py` interroge les données en local (stdio) : recherche de biens, fiche, stats de commune, comparaison, estimation avec marge. Installation dans `mcp/README.md`.
