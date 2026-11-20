# Données embarquées et modèle

Cette page décrit les données que l'application **utilise réellement** : deux fichiers versionnés dans `api/data/`. La base enrichie de l'équipe données, qui est plus riche mais n'est pas dans le dépôt, est décrite dans [base-enrichie.md](base-enrichie.md).

| Fichier | Contenu | Taille | Licence | Producteur |
|---|---|---|---|---|
| `api/data/immobilier.parquet` | 46 022 ventes d'un logement, 18 colonnes, 2021 à 2025 | 1,7 Mo | Licence Ouverte 2.0 | DGFiP, DVF géolocalisées publiées par Etalab |
| `api/data/communes.geojson` | Contours des 325 communes du Loiret | 436 Ko | Licence Ouverte 2.0 | GéoLoiret |
| `api/modele.joblib` | Modèle d'estimation entraîné (non versionné) | 380 Ko | | généré par `modele.py` |

## `immobilier.parquet`

Une ligne = **une vente d'un seul logement** (maison ou appartement) dans le Loiret. Période : du 2 janvier 2021 au 31 décembre 2025.

| Colonne | Type | Sens |
|---|---|---|
| `id_mutation` | texte | Identifiant DVF de la vente (`2025-607919`) |
| `date_mutation` | date | Date de la vente |
| `annee` | entier | Année de la vente |
| `valeur_fonciere` | décimal | Prix de vente en € |
| `type` | texte | `Maison` ou `Appartement` |
| `surface_reelle_bati` | décimal | Surface bâtie en m² |
| `nombre_pieces_principales` | décimal | Nombre de pièces principales |
| `prix_m2` | décimal | `valeur_fonciere / surface_reelle_bati` |
| `surface_terrain` | décimal | Somme de la surface des parcelles de la vente, en m² |
| `code_commune` | texte | Code INSEE (clé de jointure) |
| `nom_commune` | texte | Nom de la commune |
| `code_postal` | texte | Code postal |
| `section` | texte | Section cadastrale : deux lettres tirées de `id_parcelle` (`45234000AB0012` donne `AB`) |
| `longitude`, `latitude` | décimal | Position WGS84, vide pour 2,2 % des ventes |
| `avec_dependance` | booléen | La vente comprend un garage, une cave ou un parking |
| `avec_jardin` | booléen | La vente comprend un jardin ou un terrain d'agrément |
| `avec_eau` | booléen | La vente comprend un terrain d'eau (étang, mare) |

### Répartition

| Année | Ventes | | Type | Ventes |
|---|---|---|---|---|
| 2021 | 11 403 | | Maison | 32 820 |
| 2022 | 10 246 | | Appartement | 13 202 |
| 2023 | 8 428 | | | |
| 2024 | 7 518 | | | |
| 2025 | 8 427 | | | |

- 325 communes, 175 sections cadastrales différentes.
- Prix médian 150 000 €, prix médian au m² 1 930 €.
- **La moitié des communes a 48 ventes ou moins sur cinq ans**, 217 communes ont au moins 30 ventes. C'est pourquoi le classement impose `min_ventes=30` et la carte hachure les communes de moins de 5 ventes.
- 25 % des ventes ont un jardin, 53 % une dépendance, 0,8 % un terrain d'eau.

### `communes.geojson`

`FeatureCollection` de 325 polygones, une feature par commune, avec `properties.code_insee` (clé de jointure avec `code_commune`) et `properties.commune` (nom). L'API le complète à la volée avec les médianes (`GET /carte`).

## Construction : `api/prepare.py`

```bash
cd api && uv run python prepare.py            # écrit api/data/immobilier.parquet
cd api && uv run python prepare.py sortie.parquet   # ailleurs
```

Le script télécharge les DVF géolocalisées du Loiret, un fichier par année, sur `https://files.data.gouv.fr/geo-dvf/latest/csv/{année}/departements/45.csv.gz` (2021 à 2025), puis :

1. **garde les mutations de nature « Vente »** ;
2. calcule le **terrain d'une vente** comme la somme de ses parcelles (une ligne DVF = une parcelle) ;
3. déduit les **options** à partir des autres lignes de la vente : une ligne `Dépendance` donne `avec_dependance` ; une nature de culture `jardins` ou `terrains d'agrément` (ou une nature spéciale « Jardin ») donne `avec_jardin` ; `eaux`, `Etangs` ou `Mare` donnent `avec_eau` ;
4. ne garde que les lignes de type **Maison ou Appartement**, dédoublonne, puis **écarte toute vente qui a plusieurs logements** (un seul prix pour tous : impossible à ventiler) ;
5. **écarte les valeurs aberrantes** :

| Variable | Bornes retenues |
|---|---|
| Prix de vente | 10 000 à 2 000 000 € |
| Surface bâtie | 9 à 400 m² |
| Prix au m² | 300 à 8 000 €/m² |

6. extrait la **section cadastrale** de l'identifiant de parcelle, puis écrit le Parquet trié par date. Aucune adresse n'est gardée : le niveau le plus fin est la section.

À savoir :

- l'URL contient `latest` : un nouveau téléchargement peut donner un fichier différent si la DGFiP republie. Le Parquet versionné est la référence ; en cas de reconstruction, comparer avant de remplacer ;
- **après toute reconstruction, réentraîner le modèle** (`uv run python modele.py`, fait automatiquement au build Docker) ;
- les bornes de l'API (années 2021 à 2025, surface 9 à 400, budget 10 000 à 2 000 000) reprennent celles de ce filtre : si elles changent ici, elles changent aussi dans `main.py` et `web/lib/api.ts`.

## Modèle d'estimation

`api/modele.py`, utilisé par `GET /estimation`. Lancer : `cd api && uv run python modele.py` (environ 10 secondes, écrit `modele.joblib`).

| Élément | Choix |
|---|---|
| **Cible** | `log1p(valeur_fonciere)` : le prix varie sur plusieurs ordres de grandeur |
| **Algorithme** | `HistGradientBoostingRegressor` (scikit-learn), `random_state=42` |
| **Variables** | `type`, `code_commune`, `surface_reelle_bati`, `nombre_pieces_principales`, `surface_terrain`, `annee`, `avec_jardin`, `avec_dependance` |
| **`type`** | encodage one-hot |
| **`code_commune`** | `TargetEncoder` avec validation croisée en 5 plis : 325 communes dépassent les 255 catégories du mode catégoriel de l'algorithme |
| **Découpage** | 80 % entraînement (36 817 ventes) et 20 % test (9 205), tirage aléatoire, graine 42 |
| **Mesure** | erreur sur le test, ramenée en euros |

| Métrique | Valeur |
|---|---|
| MAE (erreur absolue moyenne) | **41 881 €** |
| MAPE (erreur en pourcentage) | **28,5 %** |

La **fourchette** affichée est le prix estimé plus ou moins la MAE. Ce n'est pas un intervalle de confiance statistique : il ne garantit pas qu'une proportion donnée de ventes tombe dedans.

### Ce que le modèle ne voit pas

DVF décrit la transaction, pas le bien. Le modèle ignore donc **l'état du bien, l'étage, le DPE, la piscine, l'exposition, le bruit, le quartier**. L'erreur de 28,5 % reflète en grande partie cela. C'est la raison d'être de la [base enrichie](base-enrichie.md), qui apporte DPE, piscine, année de construction, risques, bruit et équipements proches, et la limite que l'application annonce à l'utilisateur.

### Précautions de lecture

- Le test est un **tirage aléatoire**, pas un découpage dans le temps : l'erreur sur des ventes futures sera probablement un peu plus forte.
- `annee` est une variable numérique : le modèle ne sait pas extrapoler au-delà de 2025. L'API l'impose à 2025.
- La route fixe `surface_terrain` à la médiane de la commune et du type, car le formulaire ne la demande pas.
- Pour une commune qui a peu de ventes, l'encodage de la commune s'appuie sur très peu de prix : l'estimation y est moins fiable que la MAE moyenne ne le laisse croire.

## Limites des données DVF

| Limite | Conséquence |
|---|---|
| **DVF = prix déclarés à l'acte**, pas des annonces | Le prix est celui de la vente conclue, qui peut différer du prix affiché à l'annonce |
| **Délai de publication** | Les ventes les plus récentes arrivent avec plusieurs mois de retard |
| **Pas de description du bien** | Ni état, ni étage, ni DPE, ni piscine, ni type des pièces |
| **Maison et appartement seulement** | Pas de terrains, de locaux d'activité ni de ventes en bloc |
| **Ventes de plusieurs logements écartées** | Elles biaisent peu, mais elles ne sont pas représentées |
| **Peu de ventes dans beaucoup de communes** | Une médiane sur moins de 5 ventes n'est pas fiable ; moins de 30 : prudence |
| **Les valeurs aberrantes sont filtrées par des seuils** | Un bien atypique légitime (château, studio très cher) peut être écarté |

## Licences et attributions

- **DVF** : Licence Ouverte 2.0, DGFiP, publiée par Etalab. Mentionner la source et la date.
- **Contours des communes** : GéoLoiret, Licence Ouverte 2.0.
- **Fond de carte** : OpenFreeMap, données © contributeurs OpenStreetMap (ODbL). Ne pas masquer l'attribution affichée par MapLibre.
