-- =====================================================================
-- FTTT – Script 043 : suivi de la fiche d'inscription signée (stages)
-- À exécuter après 042. Une seule requête, rien d'autre dedans. Relançable.
-- Le cadre fédéral coche « fiche signée reçue » quand le parent ou le participant a remis la fiche signée.
-- =====================================================================
alter table inscriptions_stage add column if not exists fiche_recue boolean not null default false;
select count(*) as inscriptions_stage from inscriptions_stage;
