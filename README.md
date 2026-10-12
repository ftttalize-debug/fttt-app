# FTTT — Gestion fédérale

Application web de la Fédération Tahitienne de Tennis de Table (licenciés, clubs, compétitions, classement).

- Site statique (Preact + htm), base et authentification Supabase.
- Hébergement : GitHub Pages (branche `main`, racine).
- `supabase/` : scripts SQL à exécuter dans l'ordre (001, 002, 003, 004, 007).
- Aucune donnée personnelle dans ce dépôt public. La clé présente dans `js/config.js` est la clé publique : la sécurité repose sur les règles d'accès (RLS) de la base.
