# MCP Immo Loiret

Serveur MCP local (stdio) qui laisse un assistant (Claude Code…) interroger les ventes immobilières du Loiret (DVF) et le contexte des communes.

## Outils

| Outil | Usage |
|---|---|
| `chercher_biens` | ventes filtrées (commune, type, budget, surface, piscine, DPE max, hors inondable, argile max), max 50 lignes |
| `fiche_bien` | fiche complète d'une vente + points d'attention (via l'API) |
| `stats_commune` | médianes par type et année + loyers, revenus, CatNat, risques |
| `comparer_communes` | 2 à 10 communes côte à côte pour un type de bien |
| `estimer_bien` | estimation, fourchette, facteurs chiffrés et marge de négociation (via l'API) |
| `colonnes_disponibles` | dictionnaire des colonnes |

Les communes se donnent par nom (accents et casse ignorés) ou par code INSEE.

## Installation

Dans le dossier du projet (le `uv run --directory` rend la commande indépendante du dossier courant) :

```bash
claude mcp add --transport stdio immo-loiret -- uv run --directory /Users/luacsoulet/Desktop/Cours/api-web-data/immo-orleans/.claude/worktrees/sprint-1 --with "mcp[cli]<2" --with pandas --with pyarrow --with "numpy>=2" python -I mcp/serveur.py
```

`mcp[cli]<2` est volontaire : la v2 du SDK a renommé `FastMCP`.

Pour une API qui n'est pas sur le port 8000, ajouter `--env IMMO_API_URL=http://127.0.0.1:9000` avant le `--`.

## Variable d'environnement

- `IMMO_API_URL` (défaut `http://127.0.0.1:8000`) : API FastAPI utilisée par `estimer_bien` et `fiche_bien`.

## Exemples de questions

- « Trouve 5 maisons à Olivet sous 300 000 € hors zone inondable, argile faible. »
- « Compare Olivet, Saran et Fleury-les-Aubrais pour les appartements. »
- « Quels prix au m² à Gien par année ? »
- « Estime une maison de 100 m², 5 pièces à Olivet, DPE F, argile fort : combien négocier ? »
- « Détaille la vente 2022-776061 : à quoi faire attention ? »

## Limites

- Local uniquement, sans authentification : à ne pas exposer sur un réseau.
- Données DVF de 2021-06 à 2026-06 (2026 = premier semestre), Loiret seulement, prix de ventes passées et non des annonces.
- `estimer_bien` échoue avec un message clair si l'API est arrêtée ; `fiche_bien` se replie sur les données brutes, sans points d'attention.
- Les chemins vers `donnees-groupees` sont en dur (machine de l'auteur). `biens.parquet` est lu dans `api/data/`, sinon dans `biens_45.parquet`.
- Données chargées une fois au démarrage (quelques secondes, environ 100 Mo de mémoire).
