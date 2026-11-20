# Front-end

Le front est une application **Next.js 16** (App Router, React 19, TypeScript) dans `web/`. Il ne calcule rien : il valide les filtres, appelle l'API et met en forme les réponses.

> `web/AGENTS.md` rappelle que cette version de Next.js a des changements incompatibles avec les précédentes. Avant d'écrire du code, lire le guide concerné dans `node_modules/next/dist/docs/`.

## Pages

| Route | Fichier | Contenu |
|---|---|---|
| `/` | `app/page.tsx` | Filtres, trois indicateurs, carte, évolution des prix, classement des communes |
| `/commune/[code]` | `app/commune/[code]/page.tsx` | Fil d'Ariane, filtres, indicateurs de la commune, carte zoomée, sections cadastrales, tableau des ventes |
| `/estimer` | `app/estimer/page.tsx` | Formulaire d'estimation, fourchette, verdict, carte des comparables |

Chaque page a un état de chargement (`loading.tsx`) ; `app/error.tsx` affiche l'erreur si l'API est injoignable.

### Accueil (`/`)

1. **Filtres** : type, budget maximum, période, surface, jardin, dépendance, avec un récapitulatif « Recherche : maison · jusqu'à 250 000 € · de 2021 à 2025 ».
2. **Indicateurs** : prix médian au m², prix médian de vente, nombre de ventes et de communes.
3. **Carte** avec trois vues : *Communes* (colorées par prix médian au m²), *Ventes* (points de la recherche) ou *Les deux*.
4. **Évolution** du prix médian par année, par tranche de surface (par défaut) ou toutes surfaces confondues (`?evo=tout`).
5. **Classement** des 15 communes les plus chères parmi celles qui ont au moins 30 ventes, avec un titre qui énonce le constat et un texte alternatif qui décrit le graphique.

Les ventes affichées en points sont limitées à 3 000 (les plus récentes) ; un message indique le nombre masqué et invite à affiner les filtres.

### Commune (`/commune/[code]`)

Même barre de filtres, qui garde la section choisie quand on change un filtre. Les sections cadastrales sont classées par prix. Cliquer sur une section filtre le tableau et la carte (`?section=AB`). Le titre cite la section la plus chère **parmi celles d'au moins 10 ventes**, parce qu'un constat sur une vente ne vaut rien. Le tableau montre les 200 ventes les plus récentes ; un code inconnu mène à la page 404.

### Estimer (`/estimer`)

Formulaire : commune (liste de saisie avec recherche sans accents, navigable au clavier), type, surface (9 à 400 m²), pièces (1 à 8), jardin, dépendance et prix demandé facultatif. Il appelle une **server action** (`app/estimer/actions.ts`) qui valide les valeurs, interroge `/estimation` sans cache et renvoie soit un résultat, soit un message d'erreur en français. Le résultat affiche le prix estimé, la fourchette, l'erreur du modèle (MAE, MAPE, taille de l'échantillon de test), les comparables, un verdict et une carte des comparables avec l'écart au budget saisi. Une mention rappelle que DVF ne dit rien de la piscine, de l'étage ni du DPE.

## L'URL porte l'état

Les filtres sont un formulaire `GET` : l'état de la recherche est dans l'URL, ce qui permet de la partager, de la mettre en favori, et de la faire fonctionner sans JavaScript.

`filtres(sp)` dans `web/lib/api.ts` transforme les paramètres d'URL en filtres de l'API :

- toute valeur invalide est **ignorée** (jamais d'erreur) ;
- les valeurs par défaut ne sont pas répétées (`annee_min=2021` n'est pas envoyée) ;
- des bornes inversées (années ou surfaces) sont abandonnées pour éviter un `422` ;
- le type retombe sur `Maison`.

L'API revalide ensuite les mêmes bornes : le front adoucit, l'API fait foi.

## Appels à l'API

`web/lib/api.ts` regroupe le client. L'adresse vient de la variable d'environnement `API_URL` (par défaut `http://127.0.0.1:8000`), lue **à chaque requête** et non au build : l'image Docker du front se construit sans l'API.

| Fonction | Route appelée | Cache |
|---|---|---|
| `kpis`, `communes`, `evolution`, `evolutionTranches`, `carte`, `sections`, `commune`, `ventes`, `ventesCommune` | routes de données | `revalidate: 3600` (une heure) |
| `estimer` (server action) | `/estimation` | `no-store` |

`next.config.ts` active `output: "standalone"` (image légère, `node server.js`), `cacheComponents` et `partialPrefetching`.

## Composants

| Composant | Type | Rôle |
|---|---|---|
| `Carte.tsx` | client | Carte MapLibre GL : communes colorées par quantiles (5 classes, un seul ton), communes de moins de 5 ventes hachurées, ventes en points regroupés en grappes jusqu'au zoom 13, fenêtre d'information par vente |
| `Evolution.tsx` | serveur | Courbes SVG des prix par année, avec motifs de traits distincts : l'information ne repose jamais sur la couleur seule |
| `Filtres.tsx` | serveur | Formulaire `GET` et récapitulatif des filtres actifs (`aria-live`) |
| `ThemeToggle.tsx` | client | Bascule clair et sombre, mémorisée dans `localStorage` ; un script du `layout` applique le thème avant le premier rendu pour éviter un éclair clair |
| `estimer/Estimateur.tsx` | client | Formulaire, liste de saisie accessible, affichage du résultat |

### La carte

- Fond de carte **OpenFreeMap** (styles `positron` en clair, `dark` en sombre), sans clé d'API.
- Les couleurs de la carte sont définies en JavaScript parce que le canvas ne lit pas les variables CSS ; la rampe s'inverse en thème sombre pour que les prix élevés ressortent.
- Le worker de MapLibre 6 est déclaré explicitement (`setWorkerUrl`), car Turbopack ne le résout pas seul.
- Cadrage initial sur le Loiret : `[1,51 ; 47,48 ; 3,13 ; 48,35]` (ouest, sud, est, nord).

## Design et accessibilité

Direction « Cadastre » : esprit plan cadastral et grille de géomètre, typographies IBM Plex Sans et IBM Plex Mono (chargées par `next/font`), encre bleue, surligneur jaune pour le constat. Le thème clair est le thème par défaut.

Mesures d'accessibilité présentes dans le code :

- langue `fr` sur `<html>` et fil d'Ariane balisé ;
- chaque graphique a un titre qui énonce le constat et un texte alternatif qui le décrit (classements : paragraphe `alternative` ; évolution : SVG `role="img"` avec `<desc>` et détail chiffré dans un tableau sous la courbe) ;
- formulaires natifs, étiquettes associées, récapitulatif annoncé (`aria-live="polite"`) ;
- liste de saisie conforme au motif ARIA `combobox` (flèches, Entrée, Échap) ;
- tableau de ventes dans une région défilante focalisable ;
- aucune information portée par la couleur seule (motifs de traits, texte « n/d ») ;
- fonctionne sans JavaScript pour tout sauf la carte, l'estimateur et le thème.

## Ajouter un filtre

Un filtre traverse les deux services, il faut le déclarer aux deux endroits :

1. `api/main.py` : paramètre de `filtres()` avec ses bornes ;
2. `api/calculs.py` : condition dans `filtrer()` ;
3. `web/lib/api.ts` : lecture et validation dans `filtres()` ;
4. `web/app/Filtres.tsx` : champ du formulaire et récapitulatif ;
5. `api/tests/test_api.py` : un test qui montre que le filtre réduit `n_ventes`, et un cas `422` ;
6. [api.md](api.md) et le tableau des routes du `README.md`.
