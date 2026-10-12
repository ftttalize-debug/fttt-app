-- =====================================================================
-- FTTT – Lot 2 / Script 4 : ajustements du modèle avant l'import
-- À exécuter après 003. ATTENTION : exécuter ce script SEUL (le nouveau type de
-- licence ne peut pas être utilisé dans la même exécution que celle qui le crée).
-- =====================================================================

-- 1) Licence « événementielle » : stages et compétitions ouvertes à tous
alter type type_licence add value if not exists 'evenementielle';

-- Une compétition peut être ouverte aux licenciés événementiels.
-- (Règle appliquée à l'inscription au lot 3 : licence compétition, ou
--  événementielle si la compétition est « ouverte à tous ».)
alter table competitions
  add column ouverte_a_tous boolean not null default false;

-- 2) Pièces du dossier, suivies par saison sur la licence
--    (présence et date uniquement, jamais le contenu médical)
alter table licences
  add column certificat_type     text check (certificat_type in ('competition', 'loisir', 'evenementiel')),
  add column certificat_date     date,
  add column certificat_fourni   boolean not null default false,
  add column questionnaire_fourni boolean not null default false,
  add column photo_fournie       boolean not null default false;

-- 3) Représentant légal d'un mineur : exigé seulement pour un licencié ACTIF
--    (les fiches archivées importées n'en ont pas ; il sera demandé au renouvellement)
create or replace function verif_representant() returns trigger
language plpgsql as $$
begin
  if new.statut = 'actif'
     and new.date_naissance > (current_date - interval '18 years')::date
     and new.representant_legal_id is null then
    raise exception 'Un représentant légal est obligatoire pour un licencié mineur actif';
  end if;
  return new;
end $$;

drop trigger trg_verif_representant on licencies;
create trigger trg_verif_representant
  before insert or update of date_naissance, representant_legal_id, statut on licencies
  for each row execute function verif_representant();

-- 4) Saisons de référence pour l'historique
insert into saisons (libelle, date_debut, date_fin) values
  ('2024-2025', '2024-07-01', '2025-06-30'),
  ('2025-2026', '2025-07-01', '2026-06-30')
on conflict (libelle) do nothing;
