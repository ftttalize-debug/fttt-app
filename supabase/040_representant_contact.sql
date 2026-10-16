-- =====================================================================
-- FTTT – Script 040 : téléphone et e-mail du représentant légal d'un mineur (facultatifs)
-- À exécuter après 039. Une seule requête, rien d'autre dedans. Relançable.
-- =====================================================================
alter table licencies add column if not exists representant_telephone text;
alter table licencies add column if not exists representant_email text;
select count(*) as licencies from licencies;
