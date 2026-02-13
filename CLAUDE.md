# Guide de développement

## Pré-commit

- Prettier, oxlint et type-check sont exécutés automatiquement.

## Structure

- Composants : `$lib/components`
- Hooks : `$lib/hooks`
- Schémas : `$lib/schema`
- API : `src/app/api`

## Déploiement

- Vercel est configuré pour déployer automatiquement depuis la branche main.

## Constraints :

- The interface should be thinking mobile-first and responsive
- Think about A11Y upfront

## Documentation

- You should create if it not exit an ARCHITECTURE.MD that use mermaid syntax and show how the project behave from a product/high end perspective Divided in FRONTEND / BACKEND
- On the FRONTEND the document should track the different pages used - keep the frontend representation to pages only. Do not go into the details of all the interaction of the components
- On the BACKEND the document should track the different ENDPOINT, and also show the external provider used
- Always update it if needed after each change of the code - kept it in synchronisation with the code

## Testing doctrine

- Create the TEST first, before the implementation, ask for subsidiaries question if what is asked is not clear
- For the FRONTEND always create for page.tsx - The goal is mainly to get the dependencies graph and a fast view of what the pages does
- For the BACKEND test it in ISOLATION using unit test only - test the various error (validation - network - server failing to answer)
