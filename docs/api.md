# Référence de l'API

L'API est écrite avec FastAPI (`api/main.py`). Elle sert du JSON et du GeoJSON, en lecture seule (`GET`). En production elle n'est **pas exposée** : seul le service `web` l'appelle, à l'adresse interne `http://api:8000`. En local elle écoute sur `http://127.0.0.1:8000`, où FastAPI publie aussi la documentation interactive (`/docs`) et le schéma OpenAPI (`/openapi.json`).

Les réponses de cette page sont de vraies réponses de l'API sur le jeu de données du dépôt (46 022 ventes, 2021 à 2025), arrondies pour la lecture.

## Conventions

- Les montants sont en euros, les surfaces en m², les prix au m² en €/m².
- **Médianes partout, jamais de moyennes.**
- Un `null` signifie qu'une médiane porte sur zéro vente (un `NaN` pandas n'est pas du JSON valide). Le front affiche « n/d ».
- Les dates sont au format `YYYY-MM-DD`.
- Les codes communes sont des codes INSEE à 5 caractères, en chaîne (`"45234"`).
- CORS : toutes les origines sont autorisées, pour la méthode `GET` uniquement.

## Filtres communs

Une seule dépendance FastAPI (`filtres()` dans `main.py`) valide ces paramètres pour **toutes les routes de données** : un filtre agit donc de la même façon sur les indicateurs, la carte, les graphiques et les listes.

| Paramètre | Type | Défaut | Bornes | Effet |
|---|---|---|---|---|
| `type` | `Maison` \| `Appartement` \| `Tous` | `Maison` | | Type de bien |
| `budget_max` | entier | absent | 10 000 à 2 000 000 | Prix de vente maximum |
| `annee_min` | entier | 2021 | 2021 à 2025 | Première année incluse |
| `annee_max` | entier | 2025 | 2021 à 2025 | Dernière année incluse |
| `surface_min` | entier | absent | 9 à 400 | Surface bâtie minimale |
| `surface_max` | entier | absent | 9 à 400 | Surface bâtie maximale |
| `pieces_min` | entier | absent | 1 à 10 | Nombre minimal de pièces principales |
| `jardin` | booléen | `false` | | `true` : seulement les ventes avec jardin ou terrain d'agrément |
| `dependance` | booléen | `false` | | `true` : seulement les ventes avec garage, cave ou parking |

`annee_min` doit être inférieure ou égale à `annee_max`, et `surface_min` à `surface_max`, sinon la réponse est `422`.

## Erreurs

| Code | Cas | Corps |
|---|---|---|
| `422` | Valeur hors bornes ou de mauvais type | Le détail standard de FastAPI : `{"detail": [{"type": "literal_error", "loc": ["query", "type"], "msg": "Input should be 'Maison', 'Appartement' or 'Tous'", …}]}` |
| `422` | Années ou surfaces inversées | `{"detail": "annee_min doit être inférieure ou égale à annee_max"}` |
| `404` | Code commune inconnu | `{"detail": "Commune 99999 inconnue"}` |

Un code commune est « inconnu » s'il n'a **aucune vente dans le jeu complet**, tous filtres confondus. Une commune connue dont les ventes sont toutes exclues par les filtres répond `200` avec `n = 0` et des médianes à `null`.

## Routes

| Route | Rôle |
|---|---|
| [`GET /health`](#get-health) | Sonde de santé |
| [`GET /kpis`](#get-kpis) | Trois indicateurs de la recherche |
| [`GET /communes`](#get-communes) | Classement des communes par prix au m² |
| [`GET /evolution`](#get-evolution) | Prix médian par année |
| [`GET /evolution/tranches`](#get-evolutiontranches) | Prix médian par année et par tranche de surface |
| [`GET /carte`](#get-carte) | Les 325 communes en GeoJSON avec leurs médianes |
| [`GET /ventes`](#get-ventes) | Les ventes de la recherche en points GeoJSON |
| [`GET /communes/{code}`](#get-communescode) | Une commune |
| [`GET /communes/{code}/sections`](#get-communescodesections) | Les sections cadastrales d'une commune |
| [`GET /communes/{code}/ventes`](#get-communescodeventes) | Les ventes d'une commune |
| [`GET /estimation`](#get-estimation) | Estimation du prix d'un bien par le modèle |

### `GET /health`

```json
{"ok": true}
```

Utilisée par le `healthcheck` de `docker-compose.yml`.

### `GET /kpis`

Filtres communs. Retourne les indicateurs de la recherche.

```bash
curl "http://127.0.0.1:8000/kpis?type=Tous&budget_max=250000&jardin=true"
```

```json
{"n_ventes": 8832, "prix_m2_median": 1620.64, "valeur_median": 150000.0, "n_communes": 323}
```

| Champ | Sens |
|---|---|
| `n_ventes` | Nombre de ventes qui correspondent aux filtres |
| `prix_m2_median` | Médiane du prix au m² |
| `valeur_median` | Médiane du prix de vente |
| `n_communes` | Nombre de communes qui ont au moins une de ces ventes |

### `GET /communes`

Filtres communs, plus :

| Paramètre | Défaut | Bornes | Effet |
|---|---|---|---|
| `min_ventes` | 30 | 1 à 1 000 | Écarte les communes avec moins de ventes |
| `limit` | 15 | 1 à 325 | Nombre maximal de communes renvoyées |

Classées par prix médian au m² **décroissant**.

```bash
curl "http://127.0.0.1:8000/communes?limit=3"
```

```json
[
  {"code_commune": "45100", "nom_commune": "Combleux", "n": 49, "prix_m2_median": 3019.94, "valeur_median": 315975.0},
  {"code_commune": "45232", "nom_commune": "Olivet", "n": 813, "prix_m2_median": 2686.27, "valeur_median": 287500.0},
  {"code_commune": "45006", "nom_commune": "Ardon", "n": 66, "prix_m2_median": 2678.80, "valeur_median": 413200.0}
]
```

### `GET /evolution`

Filtres communs. Une ligne par année, triée par année croissante.

```json
[{"annee": 2021, "n": 8273, "prix_m2_median": 1780.30}, {"annee": 2022, "n": 7215, "prix_m2_median": 1892.12}, …]
```

### `GET /evolution/tranches`

Filtres communs. Une ligne par couple (tranche de surface, année). Les tranches sont `moins de 50 m²` (9 à moins de 50), `50 à 80 m²`, `80 à 120 m²` et `120 m² et plus`, renvoyées dans cet ordre. Une tranche qui n'est touchée que par sa borne par le filtre de surface est omise (une courbe sur une seule frontière serait trompeuse).

```json
[{"tranche": "moins de 50 m²", "annee": 2021, "n": 356, "prix_m2_median": 1857.32}, …]
```

### `GET /carte`

Filtres communs. Un `FeatureCollection` GeoJSON des **325 communes**, géométrie inchangée.

```json
{
  "type": "Feature", "id": "45115",
  "properties": {"code_insee": "45115", "commune": "Courtenay", "n": 368, "prix_m2_median": 1533.12, "valeur_median": 130750.0},
  "geometry": {"type": "Polygon", "coordinates": ["…"]}
}
```

`n` vaut `0` pour une commune sans vente, avec `prix_m2_median` et `valeur_median` à `null`. Le front hachure les communes de moins de 5 ventes.

### `GET /ventes`

Filtres communs, plus `limit` (défaut 3 000, bornes 1 à 5 000). Les ventes **avec coordonnées** qui correspondent à la recherche, les plus récentes d'abord, en points GeoJSON. Le champ `total` donne le nombre de ventes filtrées **avant** la limite.

```json
{
  "type": "FeatureCollection", "total": 31934,
  "features": [{
    "type": "Feature",
    "geometry": {"type": "Point", "coordinates": [1.9024, 47.893277]},
    "properties": {
      "id_mutation": "2025-607919", "date_mutation": "2025-12-31", "type": "Maison",
      "valeur_fonciere": 149500.0, "surface_reelle_bati": 44.0, "nombre_pieces_principales": 2.0,
      "prix_m2": 3397.73, "nom_commune": "Orléans", "section": "DE",
      "avec_jardin": false, "avec_dependance": false
    }
  }]
}
```

Environ 2 % des ventes n'ont pas de coordonnées : elles sont absentes de cette route mais comptées par les autres.

### `GET /communes/{code}`

Filtres communs. Les médianes d'une commune.

```bash
curl "http://127.0.0.1:8000/communes/45234"
```

```json
{"code_commune": "45234", "nom_commune": "Orléans", "n": 2164, "prix_m2_median": 2613.71, "valeur_median": 248100.0}
```

`404` si le code n'a jamais de vente.

### `GET /communes/{code}/sections`

Filtres communs. Une ligne par **section cadastrale** (deux lettres), classées par prix au m² décroissant. Une section peut n'avoir qu'une vente : le front ne retient comme « la plus chère » que les sections d'au moins 10 ventes.

```json
[{"section": "BH", "n": 1, "prix_m2_median": 4370.37, "valeur_median": 590000.0}, {"section": "BK", "n": 5, …}, {"section": "AN", "n": 32, …}]
```

### `GET /communes/{code}/ventes`

Filtres communs, plus :

| Paramètre | Défaut | Bornes | Effet |
|---|---|---|---|
| `section` | absent | | Ne garde que cette section cadastrale |
| `limit` | 200 | 1 à 1 000 | Nombre maximal de ventes |

Les plus récentes d'abord. `longitude` et `latitude` peuvent être `null`.

```json
[{
  "id_mutation": "2025-607919", "date_mutation": "2025-12-31", "type": "Maison",
  "valeur_fonciere": 149500.0, "surface_reelle_bati": 44.0, "nombre_pieces_principales": 2.0,
  "prix_m2": 3397.73, "surface_terrain": 76.0, "section": "DE",
  "avec_dependance": false, "avec_jardin": false, "avec_eau": false,
  "longitude": 1.9024, "latitude": 47.893277
}]
```

### `GET /estimation`

Cette route **n'utilise pas les filtres communs** : elle décrit un bien précis.

| Paramètre | Type | Obligatoire | Bornes |
|---|---|---|---|
| `type` | `Maison` \| `Appartement` | oui | |
| `code_commune` | chaîne | oui | une commune connue, sinon `404` |
| `surface` | nombre | oui | 9 à 400 |
| `pieces` | entier | oui | 1 à 20 (le formulaire du site limite à 1-8) |
| `jardin` | booléen | non, `false` | |
| `dependance` | booléen | non, `false` | |
| `prix_demande` | nombre > 0 | non | |

```bash
curl "http://127.0.0.1:8000/estimation?type=Maison&code_commune=45234&surface=100&pieces=5&jardin=true&prix_demande=300000"
```

```json
{
  "prix_estime": 225872,
  "fourchette_basse": 183991,
  "fourchette_haute": 267753,
  "mae": 41881,
  "mape": 0.2852,
  "n_entrainement": 36817,
  "n_test": 9205,
  "comparables": {"n": 1024, "prix_median": 235000.0},
  "comparables_ventes": {"type": "FeatureCollection", "features": ["… jusqu'à 300 points"]},
  "verdict": "au-dessus"
}
```

| Champ | Sens |
|---|---|
| `prix_estime` | Prédiction du modèle |
| `fourchette_basse`, `fourchette_haute` | Prix estimé moins et plus l'erreur absolue moyenne du test (`mae`) ; la borne basse ne descend pas sous 0 |
| `mae`, `mape` | Erreur du modèle sur les ventes de test, en € et en proportion (0,285 = 28,5 %) |
| `n_entrainement`, `n_test` | Taille des deux échantillons |
| `comparables` | Nombre et prix médian des ventes de la même commune, du même type, de surface à plus ou moins 20 % |
| `comparables_ventes` | Les 300 comparables les plus récents avec coordonnées, en points (même propriétés que `/ventes`) |
| `verdict` | `null` sans `prix_demande` ; sinon `au-dessus` (prix demandé > fourchette haute), `au-dessous` (< fourchette basse) ou `dans la fourchette` |

Hypothèses de la route, qui ne figurent pas dans les paramètres : l'année est fixée à **2025** et la surface de terrain à la **médiane des ventes de la commune et du type**. Ce que le modèle ne voit pas (état, étage, DPE, piscine) est expliqué dans [donnees.md](donnees.md#modèle-destimation).
