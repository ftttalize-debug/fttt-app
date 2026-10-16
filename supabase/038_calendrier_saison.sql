-- =====================================================================
-- FTTT – Script 038 : vue « Saison » (grille des 12 mois) – stages, événements ITTF et autres dates du calendrier
-- À exécuter après 037. Une seule requête, rien d'autre dedans. Relançable.
-- Les compétitions viennent déjà de calendrier_public(). Cette table ajoute les dates sans inscription ni facture :
-- stages, événements ITTF / internationaux, événements. Lecture publique par fonction ; écriture par le cadre.
-- =====================================================================
begin;

create table if not exists evenements_calendrier (
  id         uuid primary key default gen_random_uuid(),
  nom        text not null,
  categorie  text not null check (categorie in ('stage', 'ittf', 'evenement')),
  date_debut date not null,
  date_fin   date not null,
  lieu       text,
  annule     boolean not null default false,
  created_at timestamptz not null default now(),
  check (date_fin >= date_debut),
  unique (nom, date_debut)
);
alter table evenements_calendrier enable row level security;
drop policy if exists evenements_calendrier_cadre on evenements_calendrier;
create policy evenements_calendrier_cadre on evenements_calendrier for all using (est_cadre()) with check (est_cadre());
drop trigger if exists trg_journal on evenements_calendrier;
create trigger trg_journal after insert or update or delete on evenements_calendrier for each row execute function journaliser();

create or replace function evenements_calendrier_public()
returns table (id uuid, nom text, categorie text, date_debut date, date_fin date, lieu text, annule boolean)
language sql stable security definer set search_path = public as $$
  select e.id, e.nom, e.categorie, e.date_debut, e.date_fin, e.lieu, e.annule
    from evenements_calendrier e order by e.date_debut, e.nom
$$;
revoke execute on function evenements_calendrier_public() from public;
grant execute on function evenements_calendrier_public() to anon, authenticated;

insert into evenements_calendrier (nom, categorie, date_debut, date_fin, lieu, annule) values
  ('Stage des grandes vacances 1', 'stage', '2026-07-06', '2026-07-10', 'Salle Pater, Pirae', false),
  ('Stage des grandes vacances 2', 'stage', '2026-07-13', '2026-07-17', 'Salle Pater, Pirae', false),
  ('Oceania Hopes and Challenge', 'ittf', '2026-07-20', '2026-07-25', 'Salle Pater, Pirae', false),
  ('Stage d''arbitrage', 'stage', '2026-07-22', '2026-07-25', 'Salle Pater, Pirae', false),
  ('Stage de juge arbitrage', 'stage', '2026-07-27', '2026-07-31', 'Salle Pater, Pirae', false),
  ('Stage vac 3', 'stage', '2026-07-27', '2026-07-31', 'Salle Pater, Pirae', false),
  ('Stage vac 4', 'stage', '2026-08-03', '2026-08-07', 'Salle Pater, Pirae', false),
  ('Oceania Senior Champ', 'ittf', '2026-08-26', '2026-08-30', 'Australie', false),
  ('Oceania Youth Champ', 'ittf', '2026-09-01', '2026-09-05', 'Australie', false),
  ('Stage de septembre', 'stage', '2026-09-14', '2026-09-18', 'Salle Pater, Pirae', true),
  ('Stage d''octobre', 'stage', '2026-10-26', '2026-10-30', 'Salle Pater, Pirae', false),
  ('Stage de novembre', 'stage', '2026-11-02', '2026-11-06', 'Salle Pater, Pirae', false),
  ('Stage de Noël', 'stage', '2026-12-14', '2026-12-18', 'Salle Pater, Pirae', false),
  ('Ping Pong Festival', 'evenement', '2026-12-22', '2026-12-22', 'Salle Pater, Pirae', false),
  ('Stage de reprise', 'stage', '2027-01-04', '2027-01-08', 'Salle Pater, Pirae', false),
  ('ITTF Oceania Cup', 'ittf', '2027-01-30', '2027-01-31', 'Australie', false),
  ('Stage de février', 'stage', '2027-02-15', '2027-02-19', 'Salle Pater, Pirae', false),
  ('Semaine polynésienne des espoirs', 'evenement', '2027-03-29', '2027-04-02', 'Salle Pater, Pirae', false),
  ('Stage de Pâques 1', 'stage', '2027-03-30', '2027-04-02', 'Salle Pater, Pirae', false),
  ('Stage de Pâques 2', 'stage', '2027-04-05', '2027-04-09', 'Salle Pater, Pirae', false),
  ('Stage de mai', 'stage', '2027-05-18', '2027-05-21', 'Salle Pater, Pirae', false),
  ('ITTF Oceania Youth Championships', 'ittf', '2027-06-15', '2027-06-19', null, false),
  ('Remise des prix des championnats', 'evenement', '2027-07-02', '2027-07-02', 'Salle Pater, Pirae', false),
  ('XVIIIe Jeux du Pacifique', 'ittf', '2027-07-24', '2027-08-08', 'Tahiti', false),
  ('ITTF Oceania Para Championships', 'ittf', '2027-08-30', '2027-08-31', 'Gold Coast, Australie', false),
  ('ITTF Oceania Championships', 'ittf', '2027-09-06', '2027-09-10', 'Brisbane, Australie', false)
on conflict (nom, date_debut) do nothing;

select count(*) as evenements_calendrier, 'attendu 26 au premier lancement' as remarque from evenements_calendrier;
commit;
