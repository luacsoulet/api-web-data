# La base enrichie de l'équipe données

L'application n'embarque que **18 colonnes** par vente ([donnees.md](donnees.md)). L'équipe données a construit à côté une base beaucoup plus riche : **84 colonnes par vente** et **65 colonnes par commune**, qui rattachent à chaque vente le bâtiment, le DPE, les risques, le bruit et les équipements des alentours. Cette base **n'est pas dans le dépôt**. Cette page dit ce qu'elle contient, d'où viennent les données, ce qu'il faut savoir avant de s'en servir, et comment elle pourrait servir l'application.

Le détail colonne par colonne est dans [dictionnaire-colonnes.md](dictionnaire-colonnes.md).

## Les deux tables

| Table | Lignes | Colonnes | Fichier de travail | Clé |
|---|---|---|---|---|
| `biens` | 49 884 ventes | 84 | `biens_filtres.csv` (30 Mo) | `id_mutation` ; `code_commune` pour relier aux communes |
| `communes` | 325 communes | 65 | export `…14-49_export.csv` | `code_commune` |

Les noms de fichiers sont ceux des exports du 20 novembre 2026. La note de l'équipe données désigne la table des ventes sous le nom `biens_45.parquet` (45 est le code du Loiret) ; `biens_filtres.csv` en a les 84 colonnes.

### Lien avec le jeu embarqué

Les ventes de 2021 à 2025 de la base enrichie sont **exactement celles du Parquet de l'application** : les 46 022 `id_mutation` sont identiques, et le prix, la surface, la commune et la section concordent sans écart sur chacune. La base enrichie ajoute :

- **3 862 ventes du premier semestre 2026** (jusqu'au 30 juin 2026), que l'application n'a pas ;
- **66 colonnes** de plus par vente.

| | Parquet embarqué | Base enrichie |
|---|---|---|
| Ventes | 46 022 | 49 884 |
| Période | 2 janv. 2021 au 31 déc. 2025 | 2 janv. 2021 au 30 juin 2026 |
| Maisons / appartements | 32 820 / 13 202 | 35 512 / 14 372 |
| Colonnes par vente | 18 | 84 |
| Données par commune | non | 65 colonnes |

## Inventaire des sources

Les bases ci-dessous viennent du fichier `donnees-brutes/INVENTAIRE.md` de l'équipe données (hors dépôt). Tout est limité au Loiret (45). La colonne « Colonnes alimentées » est un recoupement avec le dictionnaire.

### 1. Prix et transactions

| Base | Producteur | Ce qu'on en tire | Colonnes alimentées |
|---|---|---|---|
| DVF géolocalisées 2021 à 2025 | DGFiP, publié par Etalab | Prix, surface, pièces, parcelle, position | groupe *Vente* (24 colonnes) |
| DVF 2026, 1er semestre | DGFiP, fichier national filtré sur le 45 | Ventes de janvier à juin 2026 | mêmes colonnes, `annee = 2026` (3 862 ventes) |
| Carte des loyers 2024 | Ministère du Logement (DHUP) | Loyer estimé au m² par commune | `loyer_*` (20 colonnes) |

### 2. Bâtiments

| Base | Producteur | Ce qu'on en tire | Colonnes alimentées |
|---|---|---|---|
| BDNB, millésime 2026-02 | CSTB | Année de construction, matériaux, nombre de logements, risques, DPE | `bat_*`, `bdnb_alea_*`, `dpe_*`, `batiment_groupe_id` |
| RNB | Référentiel national des bâtiments | Identifiant `rnb_id`, qui relie les bases entre elles | `rnb_id`, et la jointure au DPE ADEME |
| BD TOPO 3.5 | IGN | Hauteur et usage des bâtiments, gares, voies ferrées | `bat_hauteur_moy`, `bat_hauteur_max` (via la BDNB) |

### 3. Caractéristiques du bien

| Base | Producteur | Ce qu'on en tire | Colonnes alimentées |
|---|---|---|---|
| DPE logements existants (jusqu'au 11/11/2026) | ADEME | Étiquette énergie et GES, chauffage | `dpe_*` (`dpe_source = ademe_par_rnb` quand la BDNB n'a pas de DPE représentatif) |
| DPE logements neufs | ADEME | La même chose pour le neuf | idem |
| Registre des copropriétés (RNC) | ANAH | Nombre de lots, syndic, difficultés | `rnc_nb_coproprietes`, `rnc_nb_lots_habitation` (par commune) |
| Cadastre Etalab (GeoJSON) | DGFiP, publié par Etalab | Parcelles, bâtiments, sections, contenance | `contenance_parcelles_m2`, `emprise_batie_*`, `parcelle_trouvee` |
| Cadastre EDIGÉO | DGFiP | Les piscines : 8 773 objets (TSURF, SYM=65) | `nb_piscines`, `surface_piscine_m2`, `piscine` |

### 4. Risques

| Base | Producteur | Ce qu'on en tire | Colonnes alimentées |
|---|---|---|---|
| GASPAR | Géorisques | Arrêtés de catastrophe naturelle, plans de prévention par commune | `catnat_*`, `pprn_*`, `ddrm_*`, `azi_existe`, `dicrim_existe`, `pprt_existe` |
| RGA 2020 et 2025 | BRGM | Aléa retrait-gonflement des argiles | `alea_argile` (le dictionnaire ne cite que RGA 2025) |
| TRI Orléans 2013 et 2020 | DREAL | Zones inondables par la Loire, par scénario | `zone_inondable_scenario`, `hauteur_inondation_*` (le dictionnaire ne cite que 2020) |
| Remontées de nappes | BRGM | Caves et sous-sols qui peuvent être inondés | `sensibilite_nappe`, `sensibilite_nappe_fiabilite` |
| CASIAS | BRGM | Anciens sites industriels (sols potentiellement pollués) | `distance_site_casias_m`, `nb_casias_500m`, `casias_*` (commune) |
| ICPE | Géorisques | Installations classées, dont les sites Seveso | `distance_icpe_m`, `icpe_seveso_1km`, `icpe_*` (commune) |

### 5. Environnement et attractivité

| Base | Producteur | Ce qu'on en tire | Colonnes alimentées |
|---|---|---|---|
| BPE 2025 | Insee | Écoles, médecins, pharmacies, commerces, gares | `nb_*_1km`, `dist_*_proche_m` (par vente), `bpe_nb_*` (par commune) |
| Filosofi communes 2021 | Insee | Niveau de vie, pauvreté | `filosofi_*` (par commune) |
| Filosofi carreaux de 200 m (2019) | Insee | Revenus au carreau | `niveau_vie_moyen_carreau`, `part_menages_pauvres_carreau`, `part_proprietaires_carreau`, `nb_habitants_carreau` |
| Monuments historiques | Ministère de la Culture | Périmètre de protection de 500 m | `distance_mh_m`, `perimetre_mh_500m` (source : Mérimée) |
| Cartes de bruit 2017 (autoroutes, voies ferrées, routes départementales) | État et Département | Exposition au bruit en dB | `bruit_lden_max_db`, `bruit_source` |
| PEB | Géoportail | Presque vide : aucun aéroport concerné | aucune colonne |

### 6. Référentiel

| Base | Producteur | Ce qu'on en tire | Colonnes alimentées |
|---|---|---|---|
| BAN | Base Adresse Nationale | Géocodage et identifiant d'adresse | pas de colonne dédiée (`adresse_code_voie` vient de DVF) |
| Contours des communes | GéoLoiret | Fond de carte des 325 communes | `api/data/communes.geojson` (dans le dépôt) |

### Non récupérées

- le **PLU**, abandonné à la demande de l'équipe ;
- **DVF+** du Cerema, qui se télécharge à la main ;
- les **équipements Insee en Parquet**, doublon de la BPE ;
- le **RGA national en tuiles**, remplacé par le Shapefile du département.

Selon la note de l'équipe données, les tuiles du cadastre affichées sur la carte viennent de `openmaptiles.data.gouv.fr`, servies par la DINUM (l'application du dépôt utilise, elle, OpenFreeMap).

> **Réserve de l'équipe données :** cette liste vient de l'inventaire et n'a pas été vérifiée base par base contre le contenu final de `biens_45.parquet`. Le **dictionnaire de colonnes est la référence** de ce qui est réellement dans la table : il dit, colonne par colonne, quelle source l'alimente. Les deux écarts relevés ci-dessus (RGA 2020, TRI 2013) sont des sources inventoriées que le dictionnaire ne cite pas.

## Ce que la base apporte, par groupe de colonnes

| Groupe | Colonnes | Remplissage typique | Apport pour l'acheteur |
|---|---|---|---|
| **Vente** | 24 | 100 % (97,8 % pour les coordonnées) | Prix, surface, adresse, parcelle |
| **Bâtiment et DPE** | 24 | 94 à 98 % pour le bâtiment (11 % pour l'aléa de débordement) ; **72 % pour le DPE** ; 5 % pour l'ancien DPE | Âge, matériaux, hauteur, étiquette énergie et GES, énergie de chauffage |
| **Parcelle et piscine** | 8 | 98 % | Surface de la parcelle, emprise au sol, piscine |
| **Risques** | 14 | 98 % ; 40 % pour l'inondation (périmètre d'Orléans) ; 11 % pour le bruit | Argile, nappe, crue de la Loire, bruit, pollution, Seveso, monuments |
| **Quartier** | 14 | 98 % ; 97 % pour les revenus au carreau | Écoles, médecins, pharmacies, commerces, gares, niveau de vie du carreau |
| **Commune** | 65 | 100 %, sauf Filosofi (voir plus bas) | Loyers, revenus, catastrophes naturelles, équipements, copropriétés |

### Quelques mesures

| Mesure | Valeur |
|---|---|
| Ventes avec un DPE | 72 % ; classes D 13 332, C 8 614, E 7 627, F 2 964, G 2 046, B 931, A 480 |
| Énergie de chauffage (hors vide) | électricité 18 174, gaz 13 024, fioul 2 588, réseau de chaleur 1 572, bois 1 187 |
| Année de construction | médiane 1972 |
| Consommation DPE (énergie primaire) | médiane 213 kWh/m²/an |
| Ventes avec piscine | 1 073 (2,2 %) |
| Ventes à moins de 500 m d'un monument historique | 13 025 (26 %) |
| Ventes à moins de 1 km d'un site Seveso | 1 962 (3,9 %) |
| Argile : aléa fort / moyen / faible ou nul | 28 187 / 18 707 / 1 911 ventes |
| Écoles à moins de 1 km | médiane de 2 |
| Communes avec un PPRN (plan de prévention des risques naturels) | 93 sur 325 |
| Communes avec un site Seveso | 22 |

## Précautions d'usage

Ce sont les pièges les plus probables, lus dans le dictionnaire et mesurés sur les fichiers.

| Colonne ou famille | Précaution |
|---|---|
| `piscine`, `nb_piscines`, `emprise_batie_*` | Issus du **cadastre 2026** : une piscine ou un bâtiment construits **après** la vente apparaissent quand même |
| `alea_argile` | La source ne contient que les niveaux moyen et fort : `faible_ou_nul` regroupe deux cas indistinguables |
| `bdnb_alea_radon` | **Quasiment constante** : « Faible » partout où elle est remplie (48 747 ventes). N'apprend rien |
| `zone_inondable_scenario` | `aucun` : dans le périmètre du TRI d'Orléans mais non inondé. **Vide : hors périmètre, non évalué**, pas « sans risque » (60 % des ventes sont vides) |
| `bruit_lden_max_db` | Vide = hors zones cartographiées (moins de 55 dB **ou axe non cartographié**). Une valeur de 68 désigne une zone de dépassement |
| `dpe_*` | 72 % des ventes seulement. Le DPE est celui du **bâtiment ou du logement représentatif**, pas forcément celui du bien vendu, et il peut être postérieur à la vente |
| `nb_*_1km`, `dist_*_m` | Distances **à vol d'oiseau** en Lambert-93, pas des temps de trajet |
| `niveau_vie_moyen_carreau` et voisines | Millésime **2019**, lissé, au carreau de 200 m ; le nombre d'habitants peut être fractionnaire |
| `loyer_*` | Prévisions d'annonces (millésime 2024), pas des loyers constatés. **276 communes sur 325 ont un loyer de type `maille`** pour les appartements (estimation reprise des communes voisines faute d'annonces) et 259 pour les maisons : seuls 49 et 66 communes ont une estimation propre |
| `filosofi_taux_pauvrete_pct` et déciles | Renseignés pour **48 communes seulement** sur 325 (secret statistique des petites communes) ; le niveau de vie médian l'est pour 317 |
| `catnat_*`, `pprn_*` | Arrêtés et plans par commune : un indicateur de **passé et de procédure**, pas une mesure de l'exposition d'un bien précis |
| `lot1_surface_carrez` | 15 % de remplissage : ne pas en dépendre |
| Millésimes | Les sources n'ont pas le même âge (DVF 2021-2026, Filosofi 2019 et 2021, BPE 2025, bruit 2017). Les rapprocher n'est pas une photo à une date |

## Pistes pour l'application

Aucune de ces options n'est décidée ; elles sont ici pour trancher.

| Option | Avantage | Inconvénient |
|---|---|---|
| **Livrer un Parquet enrichi dans le dépôt** | Simple, Docker n'a rien à télécharger | Alourdit le dépôt public ; mélange vente et adresse précise (voir ci-dessous) |
| **Publier le Parquet comme pièce jointe d'une release GitHub** et le télécharger au build | Dépôt léger, version identifiée | Une étape de plus au build, un réseau à fiabiliser |
| **Ne livrer que des agrégats par commune** (une table `communes`) | Léger, sans donnée précise, suffit à la personnalisation | Perd le détail à la vente (DPE, piscine) |
| **Ajouter des colonnes choisies au Parquet** (`bat_annee_construction`, `dpe_classe`, `piscine`…) et réentraîner | Améliore l'estimation et les filtres | Contrat d'API à étendre, modèle à réévaluer |

**Adresses :** la base enrichie contient `adresse`, `id_parcelle` et `parcelles`. Ce sont des données DVF publiques, mais l'application a choisi de **ne garder aucune adresse** (niveau le plus fin : la section cadastrale). Ce choix de minimisation devrait être maintenu si la base est publiée.

**Reproductibilité :** les scripts de construction de la base enrichie (jointures spatiales, calcul des distances, pivots Filosofi) **ne sont pas dans ce dépôt** ; cette documentation décrit le résultat, pas le pipeline.
