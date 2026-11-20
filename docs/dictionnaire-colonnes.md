# Dictionnaire des colonnes de la base enrichie

Ce dictionnaire décrit les deux tables de travail de l'équipe données, à partir de l'export `2026-11-20T14-48_export.csv` (149 colonnes décrites : 84 pour `biens`, 65 pour `communes`). Il complète [`donnees.md`](donnees.md), qui décrit le jeu réellement embarqué dans l'application, et [`base-enrichie.md`](base-enrichie.md), qui explique d'où viennent ces données.

- **Remplissage** : part des lignes où la colonne est renseignée, telle que publiée dans l'export. Recoupée sur `biens_filtres.csv` (49 884 ventes) : les taux des 84 colonnes de la table `biens` concordent avec l'export.
- **Source** : le champ « source » de l'export, regroupé en notes numérotées à chaque groupe pour la lisibilité (« idem » dans l'export est remplacé par la source de la ligne précédente).
- Les colonnes en gras sont celles que l'application embarque déjà dans `api/data/immobilier.parquet`.


## Table `biens` : une ligne par vente d'un logement (Loiret, 2021 à juin 2026)

84 colonnes.

### Vente (24 colonnes)

Sources :
1. DVF (data.gouv.fr)

| Colonne | Description | Source | Remplissage |
|---|---|---|---|
| **`id_mutation`** | Identifiant de la mutation DVF | 1 | 100 % |
| **`date_mutation`** | Date de la vente | 1 | 100 % |
| **`annee`** | Année de la vente | 1 | 100 % |
| **`valeur_fonciere`** | Prix de vente (€) | 1 | 100 % |
| **`type`** | Type de local (Maison / Appartement) | 1 | 100 % |
| **`surface_reelle_bati`** | Surface réelle bâtie (m²) | 1 | 100 % |
| **`nombre_pieces_principales`** | Nombre de pièces principales | 1 | 100 % |
| **`prix_m2`** | Prix au m² (valeur foncière / surface bâtie) | 1 | 100 % |
| **`surface_terrain`** | Surface du terrain (m²) | 1 | 100 % |
| `lot1_surface_carrez` | Surface Carrez du lot 1 (m²) | 1 | 15,2 % |
| `nombre_lots` | Nombre de lots de la vente | 1 | 100 % |
| **`avec_dependance`** | La vente comprend une dépendance | 1 | 100 % |
| **`avec_jardin`** | La vente comprend un jardin / terrain | 1 | 100 % |
| **`avec_eau`** | La vente comprend un terrain d'eau | 1 | 100 % |
| **`code_commune`** | Code INSEE de la commune | 1 | 100 % |
| **`nom_commune`** | Nom de la commune | 1 | 100 % |
| **`code_postal`** | Code postal | 1 | 100 % |
| `adresse` | Adresse (numéro, suffixe, voie) | 1 | 100 % |
| `adresse_code_voie` | Code de la voie | 1 | 100 % |
| `id_parcelle` | Identifiant de la parcelle principale (14 car.) | 1 | 100 % |
| `parcelles` | Toutes les parcelles de la vente (séparées par ;) | 1 | 100 % |
| **`section`** | Section cadastrale | 1 | 100 % |
| **`longitude`** | Longitude WGS84 | 1 | 97,8 % |
| **`latitude`** | Latitude WGS84 | 1 | 97,8 % |

### Bâtiment & DPE (24 colonnes)

Sources :
1. BDNB batiment_groupe
2. calcul
3. BDNB ffo_bat
4. BDNB ffo_bat (Fichiers fonciers)
5. BDNB bdtopo_bat
6. BDNB synthese_propriete_usage
7. BDNB risques
8. BDNB dpe_representatif_logement, sinon ADEME par id_rnb
9. BDNB (DPE arrêté 2012)
10. RNB via BDNB rel_batiment_construction_rnb

| Colonne | Description | Source | Remplissage |
|---|---|---|---|
| `batiment_groupe_id` | Identifiant du groupe de bâtiments BDNB retenu pour la vente | 1 | 97,7 % |
| `methode_batiment` | Méthode de jointure : a_dvf_date_valeur (parcelle + même date et valeur dans BDNB DVF open), b_parcelle (parcelle, groupe résidentiel/principal), c_spatial_30m (groupe le plus proche < 30 m) | 2 | 97,7 % |
| `bat_nb_niveaux` | Nombre de niveaux | 3 | 96,2 % |
| `bat_annee_construction` | Année de construction | 4 | 95,6 % |
| `bat_usage` | Usage principal (niveau 1) | 3 | 96,2 % |
| `bat_materiau_murs` | Matériau des murs | 3 | 96,2 % |
| `bat_materiau_toit` | Matériau du toit | 3 | 96,2 % |
| `bat_nb_logements` | Nombre de logements du groupe | 3 | 96,2 % |
| `bat_hauteur_moy` | Hauteur moyenne (m) | 5 | 97,4 % |
| `bat_hauteur_max` | Hauteur maximale (m) | 5 | 97,4 % |
| `bat_usage_principal` | Usage principal BDNB open | 6 | 96,2 % |
| `bdnb_alea_radon` | Aléa radon | 7 | 97,7 % |
| `bdnb_alea_argile` | Aléa retrait-gonflement argile | 7 | 93,8 % |
| `bdnb_alea_debordement` | Aléa débordement de cours d'eau | 7 | 10,6 % |
| `bdnb_alea_sismique` | Aléa sismique | 7 | 97,7 % |
| `dpe_date` | Date d'établissement du DPE | 7 | 72,2 % |
| `dpe_conso_ep_m2` | Consommation 5 usages en énergie primaire (kWh/m2/an) | 7 | 72,1 % |
| `dpe_ges_m2` | Émissions GES 5 usages (kgCO2/m2/an) | 7 | 72,1 % |
| `dpe_classe` | Classe DPE (bilan) | 8 | 72,2 % |
| `dpe_classe_ges` | Classe GES | 8 | 72,2 % |
| `dpe_classe_conso_2012` | Classe de consommation énergie, ancien DPE | 9 | 5,2 % |
| `dpe_energie_chauffage` | Énergie de chauffage | 9 | 74,8 % |
| `dpe_source` | bdnb_representatif ou ademe_par_rnb | 2 | 77,4 % |
| `rnb_id` | Identifiant RNB du bâtiment du groupe le plus proche du point de vente | 10 | 97,4 % |

### Parcelle & piscine (8 colonnes)

Sources :
1. cadastre Etalab (parcelles, batiments, etat 2026) + piscines extraites de EDIGEO

| Colonne | Description | Source | Remplissage |
|---|---|---|---|
| `parcelle_trouvee` | Au moins une parcelle de la vente retrouvee dans le cadastre Etalab (les ventes non trouvees sont absentes du fichier) | 1 | 98 % |
| `contenance_parcelles_m2` | Somme de la contenance cadastrale (m2) des parcelles de la vente retrouvees | 1 | 98 % |
| `emprise_batie_m2` | Emprise au sol des batiments du cadastre (m2) sur les parcelles de la vente, decoupee a la limite des parcelles. Cadastre 2026: un batiment construit apres la vente peut apparaitre | 1 | 98 % |
| `emprise_batie_dur_m2` | Part de emprise_batie_m2 en batiment dur (type cadastre 01) | 1 | 98 % |
| `emprise_batie_leger_m2` | Part de emprise_batie_m2 en batiment leger (type cadastre 02) | 1 | 98 % |
| `nb_piscines` | Nombre de piscines intersectant les parcelles de la vente. Cadastre 2026: une piscine construite apres la vente peut apparaitre | 1 | 98 % |
| `surface_piscine_m2` | Surface cumulee des piscines (m2) sur les parcelles; peut etre posterieure a la vente | 1 | 98 % |
| `piscine` | Vrai si au moins une piscine intersecte une parcelle de la vente (etat 2026, possiblement posterieure a la vente) | 1 | 98 % |

### Risques (14 colonnes)

Sources :
1. RGA 2025 (BRGM), AleaRG_2025_45_L93.shp
2. BRGM remontées de nappes, Re_Nappe_fr.shp
3. BRGM remontées de nappes, FIAB_TOT
4. TRI Orléans 2020 (DDT), inondable_01_*
5. TRI Orléans 2020, iso_ht_01_*
6. Cartes de bruit stratégiques 2017 (autoroutes, ferroviaire, départementales), indicateur Lden
7. CASIAS/BASIAS, casias_45.csv (sites géolocalisés)
8. Géorisques ICPE, icpe_45.csv (hors régime 'Non ICPE')
9. Géorisques ICPE, icpe_45.csv (hors régime 'Non ICPE'), champ seveso
10. Mérimée, merimee_45.csv (coordonnées WGS84)

| Colonne | Description | Source | Remplissage |
|---|---|---|---|
| `alea_argile` | Aléa retrait-gonflement des argiles au point : moyen, fort, ou faible_ou_nul (le fichier ne contient que les niveaux 2 et 3 ; faible et nul ne sont pas distinguables). | 1 | 97,8 % |
| `sensibilite_nappe` | Sensibilité : aucune, inondation_cave, debordement_nappe. | 2 | 97,8 % |
| `sensibilite_nappe_fiabilite` | Fiabilité de la carte de sensibilité (faible/moyenne/forte). | 3 | 97,8 % |
| `zone_inondable_scenario` | Scénario le plus fréquent inondant le point : frequent, moyen, extreme ; aucun si dans le périmètre TRI mais non inondé ; vide hors périmètre TRI Orléans (non évalué). | 4 | 40,3 % |
| `hauteur_inondation_classe` | Classe de hauteur d'eau (m) pour le scénario retenu. | 5 | 10,6 % |
| `hauteur_inondation_max_m` | Borne haute de la classe de hauteur d'eau (m). | 5 | 10,6 % |
| `bruit_lden_max_db` | Borne basse (dB) de la classe Lden la plus élevée couvrant le point (55 = 55-60 ... 75 = >75 ; 68 = zone de dépassement). Vide = hors zones cartographiées (< 55 dB ou axe non cartographié). | 6 | 10,7 % |
| `bruit_source` | Type et code de l'infrastructure donnant le max (autoroute/ferroviaire/departementale:code). | 6 | 10,7 % |
| `distance_site_casias_m` | Distance (m, Lambert-93) au site industriel ancien le plus proche. | 7 | 97,8 % |
| `nb_casias_500m` | Nombre de sites CASIAS géolocalisés à moins de 500 m. | 7 | 97,8 % |
| `distance_icpe_m` | Distance (m) à l'installation classée la plus proche. | 8 | 97,8 % |
| `icpe_seveso_1km` | Vrai si un site Seveso (seuil bas ou haut) est à moins de 1 km. | 9 | 97,8 % |
| `distance_mh_m` | Distance (m) au monument historique le plus proche. | 10 | 97,8 % |
| `perimetre_mh_500m` | Vrai si un monument est à moins de 500 m (approximation circulaire du périmètre ABF). | 10 | 97,8 % |

### Quartier (14 colonnes)

Sources :
1. BPE 2025 (INSEE), bpe25_45.csv
2. Filosofi carreaux 200 m 2019 (INSEE)

| Colonne | Description | Source | Remplissage |
|---|---|---|---|
| `nb_ecoles_1km` | Nombre d'équipements « ecoles » (TYPEQU C107,C108,C109) à moins de 1 km à vol d'oiseau (Lambert-93). | 1 | 97,8 % |
| `dist_ecole_proche_m` | Distance (m) à l'école (maternelle/primaire/élémentaire) la plus proche. | 1 | 97,8 % |
| `nb_colleges_lycees_1km` | Nombre d'équipements « colleges lycees » (TYPEQU C201,C301,C302,C303) à moins de 1 km à vol d'oiseau (Lambert-93). | 1 | 97,8 % |
| `nb_medecins_generalistes_1km` | Nombre d'équipements « medecins generalistes » (TYPEQU D265) à moins de 1 km à vol d'oiseau (Lambert-93). | 1 | 97,8 % |
| `nb_pharmacies_1km` | Nombre d'équipements « pharmacies » (TYPEQU D307) à moins de 1 km à vol d'oiseau (Lambert-93). | 1 | 97,8 % |
| `nb_supermarches_1km` | Nombre d'équipements « supermarches » (TYPEQU B104) à moins de 1 km à vol d'oiseau (Lambert-93). | 1 | 97,8 % |
| `nb_boulangeries_1km` | Nombre d'équipements « boulangeries » (TYPEQU B207) à moins de 1 km à vol d'oiseau (Lambert-93). | 1 | 97,8 % |
| `nb_commerces_alimentaires_1km` | Nombre d'équipements « commerces alimentaires » (TYPEQU B104,B201,B202,B204,B206,B207) à moins de 1 km à vol d'oiseau (Lambert-93). | 1 | 97,8 % |
| `dist_commerce_alimentaire_proche_m` | Distance (m) au commerce alimentaire le plus proche (super/hypermarché, supérette, épicerie, boucherie, poissonnerie, boulangerie). | 1 | 97,8 % |
| `nb_gares_1km` | Nombre d'équipements « gares » (TYPEQU E107,E108,E109) à moins de 1 km à vol d'oiseau (Lambert-93). | 1 | 97,8 % |
| `niveau_vie_moyen_carreau` | Niveau de vie moyen (EUR/an/UC, 2019) du carreau de 200 m = ind_snv / ind. | 2 | 96,6 % |
| `part_menages_pauvres_carreau` | Part des ménages pauvres du carreau = men_pauv / men (2019). | 2 | 96,6 % |
| `part_proprietaires_carreau` | Part de ménages propriétaires du carreau = men_prop / men (2019). | 2 | 96,6 % |
| `nb_habitants_carreau` | Nombre d'individus du carreau (valeur Filosofi lissée, peut être fractionnaire). | 2 | 96,6 % |

## Table `communes` : une ligne par commune (325 communes du Loiret)

65 colonnes.

### Commune (65 colonnes)

Sources :
1. —
2. DVF
3. Loyers 2024 (pred-app-mef-dhup_45.csv)
4. Loyers 2024 (pred-app12-mef-dhup_45.csv)
5. Loyers 2024 (pred-app3-mef-dhup_45.csv)
6. Loyers 2024 (pred-mai-mef-dhup_45.csv)
7. Filosofi communes 2021 (filosofi_cc_2021_45.csv, pivoté)
8. GASPAR catnat (arrêtés CatNat, dédoublonnés par arrêté x commune)
9. GASPAR pprn (plans de prévention des risques naturels)
10. GASPAR ddrm_risq (DDRM, risques recensés par commune)
11. GASPAR azi / dicrim / pprt
12. BPE 2025 (bpe25_45.csv)
13. RNC copropriétés (rnc_45.csv)
14. CASIAS (casias_45.csv)
15. ICPE (icpe_45.csv)

| Colonne | Description | Source | Remplissage |
|---|---|---|---|
| `code_commune` | Code INSEE | 1 | 100 % |
| `nom_commune` | Nom de la commune | 2 | 100 % |
| `loyer_app_m2` | Loyer d'annonce prédit appartement (EUR/m2/mois, charges comprises). | 3 | 100 % |
| `loyer_app_m2_min` | Borne basse de l'intervalle de prédiction à 95 %. | 3 | 100 % |
| `loyer_app_m2_max` | Borne haute de l'intervalle de prédiction à 95 %. | 3 | 100 % |
| `loyer_app_type_pred` | commune = estimé sur la commune (assez d'annonces) ; maille = estimation reprise de la maille de communes voisines (peu d'annonces). | 3 | 100 % |
| `loyer_app_nb_obs_commune` | Nombre d'annonces observées dans la commune (nbobs_com). | 3 | 100 % |
| `loyer_app12_m2` | Loyer d'annonce prédit appartement T1-T2 (EUR/m2/mois, charges comprises). | 4 | 100 % |
| `loyer_app12_m2_min` | Borne basse de l'intervalle de prédiction à 95 %. | 4 | 100 % |
| `loyer_app12_m2_max` | Borne haute de l'intervalle de prédiction à 95 %. | 4 | 100 % |
| `loyer_app12_type_pred` | commune = estimé sur la commune (assez d'annonces) ; maille = estimation reprise de la maille de communes voisines (peu d'annonces). | 4 | 100 % |
| `loyer_app12_nb_obs_commune` | Nombre d'annonces observées dans la commune (nbobs_com). | 4 | 100 % |
| `loyer_app3_m2` | Loyer d'annonce prédit appartement T3 et plus (EUR/m2/mois, charges comprises). | 5 | 100 % |
| `loyer_app3_m2_min` | Borne basse de l'intervalle de prédiction à 95 %. | 5 | 100 % |
| `loyer_app3_m2_max` | Borne haute de l'intervalle de prédiction à 95 %. | 5 | 100 % |
| `loyer_app3_type_pred` | commune = estimé sur la commune (assez d'annonces) ; maille = estimation reprise de la maille de communes voisines (peu d'annonces). | 5 | 100 % |
| `loyer_app3_nb_obs_commune` | Nombre d'annonces observées dans la commune (nbobs_com). | 5 | 100 % |
| `loyer_mai_m2` | Loyer d'annonce prédit maison (EUR/m2/mois, charges comprises). | 6 | 100 % |
| `loyer_mai_m2_min` | Borne basse de l'intervalle de prédiction à 95 %. | 6 | 100 % |
| `loyer_mai_m2_max` | Borne haute de l'intervalle de prédiction à 95 %. | 6 | 100 % |
| `loyer_mai_type_pred` | commune = estimé sur la commune (assez d'annonces) ; maille = estimation reprise de la maille de communes voisines (peu d'annonces). | 6 | 100 % |
| `loyer_mai_nb_obs_commune` | Nombre d'annonces observées dans la commune (nbobs_com). | 6 | 100 % |
| `filosofi_niveau_vie_median` | Médiane du niveau de vie (EUR/an/UC, 2021). | 7 | 97,5 % |
| `filosofi_taux_pauvrete_pct` | Taux de pauvreté à 60 % (%, 2021). | 7 | 14,8 % |
| `filosofi_niveau_vie_d1` | 1er décile du niveau de vie (EUR). | 7 | 20,3 % |
| `filosofi_niveau_vie_d9` | 9e décile du niveau de vie (EUR). | 7 | 20,3 % |
| `filosofi_rapport_interdecile` | Rapport interdécile D9/D1. | 7 | 20,3 % |
| `filosofi_nb_menages` | Nombre de ménages fiscaux. | 7 | 97,5 % |
| `filosofi_nb_personnes` | Nombre de personnes dans les ménages fiscaux. | 7 | 97,5 % |
| `filosofi_nb_unites_conso` | Nombre d'unités de consommation. | 7 | 97,5 % |
| `filosofi_part_revenus_activite_pct` | Part dans le revenu disponible (%) : filosofi_part_revenus_activite_pct | 7 | 20,3 % |
| `filosofi_part_retraites_pct` | Part dans le revenu disponible (%) : filosofi_part_retraites_pct | 7 | 20,3 % |
| `filosofi_part_prestations_sociales_pct` | Part dans le revenu disponible (%) : filosofi_part_prestations_sociales_pct | 7 | 20,3 % |
| `filosofi_part_impots_pct` | Part dans le revenu disponible (%) : filosofi_part_impots_pct | 7 | 20,3 % |
| `filosofi_part_revenus_patrimoine_pct` | Part dans le revenu disponible (%) : filosofi_part_revenus_patrimoine_pct | 7 | 20,3 % |
| `catnat_nb_total` | Nombre d'arrêtés de catastrophe naturelle depuis l'origine. | 8 | 100 % |
| `catnat_nb_depuis_2010` | Idem, début d'événement depuis 2010. | 8 | 100 % |
| `catnat_date_dernier` | Date de début du dernier événement reconnu. | 8 | 100 % |
| `catnat_types` | Types d'aléas reconnus (liste ';'). | 8 | 100 % |
| `catnat_nb_secheresse` | Arrêtés sécheresse (retrait-gonflement argiles). | 8 | 100 % |
| `catnat_nb_inondation` | Arrêtés inondation/coulées de boue. | 8 | 100 % |
| `catnat_nb_mouvement_terrain` | Arrêtés mouvement de terrain. | 8 | 100 % |
| `pprn_existe` | Au moins un PPRN (prescrit, approuvé...) sur la commune ; absent du fichier = False. | 9 | 100 % |
| `pprn_nb_procedures` | Nombre de procédures PPRN distinctes. | 9 | 100 % |
| `pprn_opposable` | Au moins un PPRN à l'état « Opposable ». | 9 | 100 % |
| `pprn_types` | Risques couverts (libellé risque 2), liste ';'. | 9 | 28,6 % |
| `ddrm_nb_risques` | Nombre de risques listés au dossier départemental des risques majeurs. | 10 | 100 % |
| `ddrm_risques` | Libellés des risques (liste ';'). | 10 | 100 % |
| `azi_existe` | Atlas de zones inondables couvrant la commune. | 11 | 100 % |
| `dicrim_existe` | DICRIM publié par la commune. | 11 | 100 % |
| `pprt_existe` | Plan de prévention des risques technologiques sur la commune. | 11 | 100 % |
| `bpe_nb_a` | Nombre d'équipements, famille services. | 12 | 100 % |
| `bpe_nb_b` | Nombre d'équipements, famille commerces. | 12 | 100 % |
| `bpe_nb_c` | Nombre d'équipements, famille enseignement. | 12 | 100 % |
| `bpe_nb_d` | Nombre d'équipements, famille santé/action sociale. | 12 | 100 % |
| `bpe_nb_e` | Nombre d'équipements, famille transports. | 12 | 100 % |
| `bpe_nb_f` | Nombre d'équipements, famille sports/loisirs/culture. | 12 | 100 % |
| `bpe_nb_g` | Nombre d'équipements, famille tourisme. | 12 | 100 % |
| `bpe_nb_total` | Nombre total d'équipements. | 12 | 100 % |
| `rnc_nb_coproprietes` | Nombre de copropriétés immatriculées. | 13 | 100 % |
| `rnc_nb_lots_habitation` | Somme des lots d'habitation de ces copropriétés. | 13 | 100 % |
| `casias_nb_sites` | Anciens sites industriels / activités de services inventoriés. | 14 | 100 % |
| `casias_nb_sites_en_activite` | Dont état « En activité ». | 14 | 100 % |
| `icpe_nb` | Installations classées (toutes, y compris « Non ICPE »/en arrêt). | 15 | 100 % |
| `icpe_nb_seveso` | Dont Seveso seuil bas ou haut. | 15 | 100 % |
