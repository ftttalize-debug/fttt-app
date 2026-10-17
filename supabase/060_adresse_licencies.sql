-- 060 : adresse des licenciés (obligatoire pour la liste réglementaire au 31 mai).
-- Trois champs : adresse libre (quartier, rue, PK, lieu-dit…), commune et île (liste des îles de Polynésie française).
-- Données de contact : jamais affichées sur le site public (les vues publiques et l'annuaire du juge listent leurs colonnes une à une).
alter table licencies add column if not exists adresse text;
alter table licencies add column if not exists commune text;
alter table licencies add column if not exists ile text;

select 'ok : adresse, commune et île ajoutées aux licenciés' as resultat;
