# Front-end · Immo Orléans

Application [Next.js](https://nextjs.org) 16 (App Router, React 19, TypeScript) qui affiche les prix médians des communes du Loiret, détaille chaque commune et estime le prix d'un bien. Elle ne calcule rien : elle appelle l'API FastAPI du dossier `../api`.

## Lancer

```bash
pnpm install
API_URL=http://127.0.0.1:8000 pnpm dev    # http://localhost:3000
pnpm lint
pnpm build
```

`API_URL` est lue à chaque requête (par défaut `http://127.0.0.1:8000`). Lancer l'API d'abord : voir le [README du dépôt](../README.md#lancer-en-local).

## Documentation

- [Front-end : pages, composants, état dans l'URL, accessibilité](../docs/frontend.md)
- [Référence de l'API](../docs/api.md)
- [Guide de développement](../docs/developpement.md)

`AGENTS.md` rappelle que cette version de Next.js a des changements incompatibles avec les précédentes : lire le guide de `node_modules/next/dist/docs/` avant d'en modifier l'usage.
