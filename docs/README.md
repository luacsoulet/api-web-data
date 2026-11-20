# Documentation · Immo Orléans

Immo Orléans aide un couple, une famille ou des colocataires qui cherchent à acheter dans le Loiret à décider **dans quelle commune chercher, pour quel budget et quel logement**. L'application affiche les prix médians des communes sur une carte, détaille chaque commune jusqu'aux sections cadastrales et aux ventes, et estime le prix d'un bien avec un modèle statistique.

Cette documentation décrit l'application telle qu'elle est dans le dépôt, les bases de données qui l'alimentent, et les pistes pour la **personnaliser** selon la situation du ménage (sport, enfants, emploi, mobilité, santé, budget).

## Plan

| Document | Contenu | Pour qui |
|---|---|---|
| [architecture.md](architecture.md) | Composants, flux de données, choix de conception, limites connues | Toute l'équipe |
| [api.md](api.md) | Référence de l'API FastAPI : filtres, routes, exemples, erreurs | Développeurs front et back |
| [frontend.md](frontend.md) | Pages Next.js, composants, état dans l'URL, carte, accessibilité | Développeurs front |
| [donnees.md](donnees.md) | Jeu de données embarqué (`immobilier.parquet`, contours), pipeline `prepare.py`, modèle d'estimation | Data et back |
| [base-enrichie.md](base-enrichie.md) | La base enrichie de l'équipe données (84 colonnes par vente, 65 par commune) et l'inventaire des sources | Data |
| [dictionnaire-colonnes.md](dictionnaire-colonnes.md) | Dictionnaire complet des 149 colonnes, avec source et taux de remplissage | Data |
| [personnalisation-datagouv.md](personnalisation-datagouv.md) | Catalogue de jeux data.gouv.fr pour adapter le résultat à la situation du couple, par profil | Produit et data |
| [extension-chrome.md](extension-chrome.md) | Piste d'évolution : analyser une annonce Leboncoin avec une extension Chrome (non implémentée) | Produit |
| [developpement.md](developpement.md) | Installation, tests, qualité, workflow Git, tâches courantes | Contributeurs |
| [deploiement.md](deploiement.md) | Docker, Dokploy, variables d'environnement, exploitation | Contributeurs |

## L'application en chiffres

| Mesure | Valeur | Origine |
|---|---|---|
| Ventes embarquées | 46 022 (2021 à 2025) | `api/data/immobilier.parquet` |
| Communes couvertes | 325, dont 217 avec au moins 30 ventes (tous types confondus) | idem |
| Prix médian de vente, tous types | 150 000 € | idem |
| Prix médian au m², tous types | 1 930 € | idem |
| Erreur du modèle d'estimation | MAE 41 881 €, MAPE 28,5 % sur 9 205 ventes de test | `uv run python modele.py` |
| Tests de l'API | 17, tous verts | `uv run pytest -q` |

Ces valeurs ont été recalculées sur le dépôt, pas recopiées : elles changent si le fichier de données change.

## Lexique

| Sigle | Signification |
|---|---|
| **DVF** | Demandes de valeurs foncières : les ventes immobilières déclarées aux notaires, publiées par la DGFiP |
| **COG** | Code officiel géographique de l'Insee : les codes communes, qui changent quand des communes fusionnent |
| **Code INSEE** | Code à 5 caractères d'une commune (45234 pour Orléans) : la clé de jointure de tout le projet |
| **IRIS** | Découpage infra-communal de l'Insee, d'environ 2 000 habitants |
| **Carreau** | Maille de 200 m de côté pour les statistiques de revenus (Filosofi) |
| **EPCI** | Intercommunalité (par exemple Orléans Métropole) |
| **BDNB** | Base de données nationale des bâtiments (CSTB) |
| **RNB** | Référentiel national des bâtiments, qui donne l'identifiant `rnb_id` |
| **DPE** | Diagnostic de performance énergétique (ADEME) |
| **BPE** | Base permanente des équipements (Insee) : écoles, médecins, commerces, gares |
| **Filosofi** | Fichier localisé social et fiscal de l'Insee : niveau de vie, pauvreté |
| **GASPAR** | Base de gestion assistée des procédures administratives relatives aux risques (Géorisques) |
| **CASIAS** | Anciens sites industriels et activités de service (BRGM) |
| **ICPE** | Installations classées pour la protection de l'environnement ; **Seveso** désigne les plus dangereuses |
| **PPRN, PPRI** | Plans de prévention des risques naturels, des risques d'inondation |
| **APL** | Accessibilité potentielle localisée : indicateur de la DREES sur l'accès aux soins |
| **MAE, MAPE** | Erreur absolue moyenne (en €), erreur absolue moyenne en pourcentage |

## Conventions de cette documentation

- Les noms de colonnes, routes et fichiers sont en `code`.
- Quand une information vient du code, le fichier est cité. Quand elle vient d'un export de l'équipe données, l'export est cité.
- Les dates de mise à jour des jeux data.gouv.fr sont celles relevées sur l'API data.gouv.fr le 20 novembre 2026.
- Ce qui est une proposition (non implémentée) est marqué comme tel.
