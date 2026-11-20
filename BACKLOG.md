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


# Contrat v3 · biens enrichis, carte des risques, marge de négociation, MCP

Décisions utilisateur (20/11) : tout dans l'appli Next.js + FastAPI (immo-orleans), testé en local avant PR. Marge de négociation = modèle ML + impact chiffré de chaque facteur. Transports = gares déjà présentes (BPE/BD TOPO), pas de nouvelle source. MCP local (stdio) sur les données regroupées. Les adresses ne sont PAS publiées dans l'appli (choix du cours : la section cadastrale est le niveau le plus fin affiché).

## Données (T0, déjà fait avant T1-T4)

- `api/data/biens.parquet` : une ligne par vente (49 884, 2021-01 → 2026-06), clé `id_mutation`. Colonnes = celles de `donnees-groupees/biens_45.parquet` SAUF `adresse`, `adresse_code_voie`, `methode_batiment`, `dpe_source`, `dpe_classe_conso_2012`, `bdnb_alea_debordement`, `hauteur_inondation_max_m`, `parcelle_trouvee` ; PLUS `dist_gare_proche_m` (distance en m à la gare la plus proche, BPE E107-E109). Booléens en bool (NaN → False pour piscine/avec_*), catégories en str.
  Colonnes clés : id_mutation, date_mutation, annee, valeur_fonciere, type, surface_reelle_bati, nombre_pieces_principales, prix_m2, surface_terrain, nombre_lots, avec_dependance, avec_jardin, avec_eau, code_commune, nom_commune, code_postal, id_parcelle, parcelles, section, longitude, latitude, batiment_groupe_id, rnb_id, bat_annee_construction, bat_materiau_murs, bat_materiau_toit, bat_nb_niveaux, bat_nb_logements, bat_hauteur_moy, bat_usage, dpe_classe (A-G), dpe_classe_ges, dpe_conso_ep_m2, dpe_energie_chauffage, dpe_date, bdnb_alea_radon, contenance_parcelles_m2, emprise_batie_m2, piscine, nb_piscines, surface_piscine_m2, alea_argile (faible|moyen|fort|null), sensibilite_nappe (aucune|inondation_cave|debordement_nappe), zone_inondable_scenario (frequent|moyen|extreme|null = hors zone TRI), hauteur_inondation_classe, bruit_lden_max_db, bruit_source, distance_site_casias_m, nb_casias_500m, distance_icpe_m, icpe_seveso_1km, distance_mh_m, perimetre_mh_500m, nb_ecoles_1km, dist_ecole_proche_m, nb_colleges_lycees_1km, nb_medecins_generalistes_1km, nb_pharmacies_1km, nb_commerces_alimentaires_1km, dist_commerce_alimentaire_proche_m, nb_gares_1km, dist_gare_proche_m, niveau_vie_moyen_carreau, part_proprietaires_carreau.
- `api/data/piscines.parquet` : id_parcelle (14 car.), surface_m2, longitude, latitude (centroïde WGS84), geometrie_wkt (polygone WGS84, simplifié 0,5 m).
- `web/public/couches/argile.geojson` (aléa moyen/fort seulement, propriété `alea`), `inondation.geojson` (TRI Orléans 2020, propriété `scenario`), `nappes.geojson` (propriété `sensibilite`, sans la classe « aucune »), `equipements.geojson` (points BPE : propriété `famille` ∈ ecole, college_lycee, medecin, pharmacie, commerce_alimentaire, gare ; `nom` si dispo) — tous WGS84, simplifiés (tolérance ~15 m), arrondis à 5 décimales, chacun < 6 Mo.
- `api/data/modele.joblib` n'est pas versionné (entraîné au build Docker par `modele.py`).

## API v3 (FastAPI) — ajouts, l'existant reste compatible

Filtres communs (une seule dépendance, appliquée à TOUTES les routes de données ; tous facultatifs) : existants (type, budget_max, annee_min, annee_max [2021-2026], surface_min, surface_max, pieces_min, jardin, dependance) + nouveaux :
`piscine` (bool), `dpe` (liste répétable de classes A-G, ex. `dpe=A&dpe=B`), `argile_max` (faible|moyen|fort : exclut les aléas au-dessus), `hors_inondable` (bool : exclut zone_inondable_scenario non null), `hors_nappe` (bool : exclut debordement_nappe), `materiau` (str, sous-chaîne insensible à la casse de bat_materiau_murs), `construit_apres`, `construit_avant` (int année), `medecins_min`, `ecoles_min`, `commerces_min` (int, à 1 km), `gare_max_m` (int).
L'API lit désormais `biens.parquet` (plus `immobilier.parquet`, à supprimer). annee max = 2026 (1er semestre seulement : le dire dans les libellés).

| Route | Réponse |
|---|---|
| existantes (`/kpis`, `/communes`, `/evolution`, `/evolution/tranches`, `/carte`, `/ventes`, `/communes/{code}`, `/sections`, `/communes/{code}/ventes`) | inchangées + filtres v3 ; `/ventes` et `/communes/{code}/ventes` ajoutent dans properties : piscine, dpe_classe, alea_argile, zone_inondable_scenario, bat_annee_construction |
| `GET /biens/{id_mutation}` | fiche complète : toutes les colonnes de biens.parquet (NaN → null) + `"parcelles": [...]` + `"piscines": GeoJSON FeatureCollection` des piscines de ses parcelles + `"attention": [{"facteur", "niveau" (info|vigilance|alerte), "texte"}]` (points à vérifier : argile fort/moyen, zone inondable, nappe, DPE F/G, bruit ≥ 65 dB, Seveso à 1 km, périmètre MH, CASIAS < 200 m, construction avant 1948/1975 amiante-plomb…) ; 404 si inconnu |
| `GET /estimation?...` | paramètres existants + facultatifs : `annee_construction`, `dpe` (A-G), `materiau_murs`, `piscine`, `alea_argile`, `zone_inondable` (frequent|moyen|extreme), `sensibilite_nappe`, `bruit_db`, `longitude`, `latitude` (si fournis : l'API calcule elle-même argile/inondation/nappe/équipements au point à partir des données du voisinage = ventes à < 150 m, sinon valeurs de la commune) ; réponse = existante + `"facteurs": [{"facteur", "valeur", "impact_eur" (négatif = fait baisser le prix), "impact_pct"}]` triés par impact, `"marge_negociation": {"basse_eur", "haute_eur", "pct", "explication"}`, `"a_verifier": [...]` (mêmes règles que attention), `"variables_modele": [...]`, `"mae"`, `"mape"` du NOUVEAU modèle |
| `GET /contexte?longitude=&latitude=` | ce que le point donne : alea_argile, zone_inondable_scenario, sensibilite_nappe, bruit, nb_ecoles_1km… (valeurs de la vente la plus proche à < 150 m sinon null) + code_commune |

Modèle (`modele.py`) : HistGradientBoosting sur log1p(prix) + TargetEncoder(code_commune), features : type, surface, pièces, terrain, année vente, jardin, dépendance, piscine, bat_annee_construction, dpe_classe (ordinal A=1…G=7, NaN géré nativement), matériau murs (catégoriel simplifié), alea_argile (ordinal), zone_inondable (ordinal), sensibilite_nappe, bruit_lden_max_db, distance_mh_m, perimetre_mh_500m, nb_medecins/écoles/commerces 1 km, dist_gare_proche_m, niveau_vie_moyen_carreau. Split 80/20 seed 42 ; MAE/MAPE test.
Impact d'un facteur pour un bien = prédiction(bien) − prédiction(bien avec ce facteur ramené à la valeur de référence « sans défaut » : argile faible, hors zone inondable, nappe aucune, DPE D, bruit < 55 dB, hors périmètre MH…). Marge de négociation = somme des impacts négatifs (en valeur absolue) bornée, + rappel de l'erreur du modèle ; en texte : « jusqu'à X € (Y %) de négociation justifiée par : … ».

## Front (Next.js)

- Filtres : dépendance, jardin, piscine, DPE (cases A-G), argile max, hors zone inondable, hors nappe, matériau, année de construction, attractivité (médecins/écoles/commerces min à 1 km, gare à moins de X m). Formulaire GET, URL = état, appliqués partout.
- Carte : nouvelles couches activables (cases à cocher, légende) : « Argile (aléa) », « Zones inondables (Loire) », « Remontées de nappe », « Attractivité » (heatmap MapLibre des équipements, avec sous-choix médecins / écoles / commerces / gares) — depuis `/couches/*.geojson` (servis par Next, donc accessibles au navigateur). Cadastre : source vecteur `https://openmaptiles.data.gouv.fr/data/cadastre/{z}/{x}/{y}.pbf` (couches `parcelles`, `batiments`, `sections`, zoom 11-16, attribution « © DINUM - cadastre »), visible à partir du zoom 15.
- Fiche vente `/vente/[id]` (clic sur un point de vente ou une ligne) : plan cadastral centré sur la parcelle (zoom 17-18, parcelles de la vente surlignées, bâtiments, piscines dessinées), toutes les infos groupées (Vente, Bâtiment & DPE, Parcelle & piscine, Risques, Quartier), bloc « Points d'attention » (niveau info/vigilance/alerte, en texte et icône, pas la couleur seule), bouton « Estimer un bien comme celui-ci » qui pré-remplit /estimer.
- Estimer : nouveaux champs (année de construction, DPE, matériau, piscine, et argile / inondable / nappe / bruit) + mini-carte : clic → `/contexte` pré-remplit les risques ; résultat : prix estimé, fourchette, **marge de négociation** (montant et %, explication), tableau des facteurs avec impact €, liste « À vérifier avant d'acheter ».
