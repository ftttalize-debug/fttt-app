-- =====================================================================
-- FTTT – Script 030 : tours avec dates (compétitions par équipes) + affichage public (lot D)
-- À exécuter après 029. Une seule requête, rien d'autre dedans. Relançable.
-- 1) Tours d'une compétition par équipes, chacun avec sa date (Journée 1 : 12/12, Journée 2 : 19/12…)
-- 2) Une rencontre se rattache à un tour défini : sa date vient du tour
-- 3) Public : calendrier groupé par événement avec les dates des tours ; rencontres par tour avec scores
-- =====================================================================
begin;

create table if not exists tours_competition (
  id             uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions(id) on delete cascade,
  nom            text not null,
  date_tour      date not null,
  created_at     timestamptz not null default now(),
  unique (competition_id, nom)
);
create index if not exists tours_competition_idx on tours_competition (competition_id);

alter table tours_competition enable row level security;
drop policy if exists tours_cadre on tours_competition;
drop policy if exists tours_lecture on tours_competition;
create policy tours_cadre on tours_competition for all using (est_cadre()) with check (est_cadre());
create policy tours_lecture on tours_competition for select to authenticated
  using (exists (select 1 from competitions c where c.id = competition_id and c.statut <> 'brouillon'));
drop trigger if exists trg_journal on tours_competition;
create trigger trg_journal after insert or update or delete on tours_competition for each row execute function journaliser();

-- ---------- Gestion des tours ----------
create or replace function creer_tour(p_competition uuid, p_nom text, p_date date) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  c competitions;
  v_id uuid;
begin
  select * into c from competitions where id = p_competition;
  if not found then raise exception 'Compétition introuvable.'; end if;
  if not (est_cadre() or (est_juge_de(p_competition) and c.statut = 'cloturee')) then raise exception 'Droits insuffisants.'; end if;
  if c.type <> 'equipe' then raise exception 'Les tours ne concernent que les compétitions par équipes.'; end if;
  if coalesce(trim(p_nom), '') = '' or p_date is null then raise exception 'Indique le nom et la date du tour.'; end if;
  if p_date < c.date_debut or p_date > c.date_fin then
    raise exception 'La date du tour doit être comprise entre le % et le % (dates de la compétition) : modifie d''abord les dates de la compétition.',
      to_char(c.date_debut, 'DD/MM/YYYY'), to_char(c.date_fin, 'DD/MM/YYYY');
  end if;
  if exists (select 1 from tours_competition where competition_id = p_competition and lower(nom) = lower(trim(p_nom))) then
    raise exception 'Ce tour existe déjà.';
  end if;
  insert into tours_competition (competition_id, nom, date_tour) values (p_competition, trim(p_nom), p_date) returning id into v_id;
  return v_id;
end $$;

create or replace function modifier_tour(p_tour uuid, p_nom text, p_date date) returns void
language plpgsql security definer set search_path = public as $$
declare
  t tours_competition;
  c competitions;
begin
  select * into t from tours_competition where id = p_tour;
  if not found then raise exception 'Tour introuvable.'; end if;
  select * into c from competitions where id = t.competition_id;
  if not (est_cadre() or (est_juge_de(c.id) and c.statut = 'cloturee')) then raise exception 'Droits insuffisants.'; end if;
  if coalesce(trim(p_nom), '') = '' or p_date is null then raise exception 'Indique le nom et la date du tour.'; end if;
  if p_date < c.date_debut or p_date > c.date_fin then
    raise exception 'La date du tour doit être comprise entre le % et le % (dates de la compétition).',
      to_char(c.date_debut, 'DD/MM/YYYY'), to_char(c.date_fin, 'DD/MM/YYYY');
  end if;
  if exists (select 1 from tours_competition where competition_id = c.id and lower(nom) = lower(trim(p_nom)) and id <> p_tour) then
    raise exception 'Ce tour existe déjà.';
  end if;
  update matchs set tour = trim(p_nom)
   where rencontre_id in (select id from rencontres where competition_id = c.id and tour = t.nom);
  update rencontres set tour = trim(p_nom), date_rencontre = p_date where competition_id = c.id and tour = t.nom;
  update tours_competition set nom = trim(p_nom), date_tour = p_date where id = p_tour;
end $$;

create or replace function supprimer_tour(p_tour uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  t tours_competition;
  c competitions;
begin
  select * into t from tours_competition where id = p_tour;
  if not found then raise exception 'Tour introuvable.'; end if;
  select * into c from competitions where id = t.competition_id;
  if not (est_cadre() or (est_juge_de(c.id) and c.statut = 'cloturee')) then raise exception 'Droits insuffisants.'; end if;
  if exists (select 1 from rencontres where competition_id = c.id and tour = t.nom) then
    raise exception 'Ce tour a des rencontres : supprime-les d''abord.';
  end if;
  delete from tours_competition where id = p_tour;
end $$;

-- ---------- Une rencontre se rattache à un tour défini ----------
create or replace function creer_rencontre(p_competition uuid, p_tour text, p_date date, p_equipe_a uuid, p_equipe_b uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  c competitions;
  t tours_competition;
  v_id uuid;
begin
  select * into c from competitions where id = p_competition;
  if not found then raise exception 'Compétition introuvable.'; end if;
  if not (est_cadre() or est_juge_de(p_competition)) then raise exception 'Tu n''es pas juge-arbitre de cette compétition.'; end if;
  if c.type <> 'equipe' then raise exception 'Les rencontres ne concernent que les compétitions par équipes.'; end if;
  if est_cadre() then
    if c.statut not in ('cloturee', 'terminee') then raise exception 'Les rencontres se créent une fois les inscriptions closes.'; end if;
  elsif c.statut <> 'cloturee' then
    raise exception 'La saisie est fermée pour cette compétition.';
  end if;
  select * into t from tours_competition where competition_id = p_competition and lower(nom) = lower(trim(coalesce(p_tour, '')));
  if not found then raise exception 'Choisis un tour défini dans « Tours et dates » de la compétition.'; end if;
  if p_equipe_a = p_equipe_b then raise exception 'Choisis deux équipes différentes.'; end if;
  if (select count(*) from inscriptions where id in (p_equipe_a, p_equipe_b) and competition_id = p_competition
        and statut = 'active' and type = 'equipe') <> 2 then
    raise exception 'Équipe introuvable dans cette compétition.';
  end if;
  if exists (select 1 from rencontres where competition_id = p_competition and tour = t.nom
              and ((equipe_a = p_equipe_a and equipe_b = p_equipe_b) or (equipe_a = p_equipe_b and equipe_b = p_equipe_a))) then
    raise exception 'Cette rencontre existe déjà pour ce tour.';
  end if;
  insert into rencontres (competition_id, tour, date_rencontre, equipe_a, equipe_b)
  values (p_competition, t.nom, t.date_tour, p_equipe_a, p_equipe_b) returning id into v_id;
  return v_id;
end $$;

revoke execute on function creer_tour(uuid, text, date), modifier_tour(uuid, text, date), supprimer_tour(uuid) from public, anon;
grant execute on function creer_tour(uuid, text, date), modifier_tour(uuid, text, date), supprimer_tour(uuid) to authenticated;

-- ---------- Public : calendrier groupé par événement, avec les dates des tours ----------
drop function if exists calendrier_public();
create function calendrier_public()
returns table (id uuid, nom text, lieu text, date_debut date, date_fin date, type text, coefficient numeric, statut text,
               evenement_id uuid, genre text, categorie_max text, categorie_min text, tours jsonb)
language sql stable security definer set search_path = public as $$
  select c.id, c.nom, c.lieu, c.date_debut, c.date_fin, c.type::text, c.coefficient, c.statut::text,
         c.evenement_id, c.genre, c.categorie_max, c.categorie_min,
         (select jsonb_agg(jsonb_build_object('nom', t.nom, 'date', t.date_tour) order by t.date_tour, t.nom)
            from tours_competition t where t.competition_id = c.id)
    from competitions c where c.statut <> 'brouillon' order by c.date_debut desc, c.nom
$$;
revoke execute on function calendrier_public() from public;
grant execute on function calendrier_public() to anon, authenticated;

-- ---------- Public : rencontres par équipes (matchs validés, joueurs masqués respectés) ----------
create or replace function rencontres_publiques(p_competition uuid)
returns table (rencontre_id uuid, tour text, date_rencontre date, equipe_a text, equipe_b text, score_a integer, score_b integer, matchs jsonb)
language sql stable security definer set search_path = public as $$
  select r.id, r.tour, r.date_rencontre,
         coalesce(ia.nom_equipe, ca.nom), coalesce(ib.nom_equipe, cb.nom),
         coalesce(sum((v.sa > v.sb)::int), 0)::int,
         coalesce(sum((v.sb > v.sa)::int), 0)::int,
         coalesce(jsonb_agg(jsonb_build_object('type', v.type_match, 'sets_a', v.sa, 'sets_b', v.sb, 'manches', v.manches,
                                               'a', v.la, 'b', v.lb) order by v.created_at) filter (where v.id is not null), '[]'::jsonb)
    from rencontres r
    join inscriptions ia on ia.id = r.equipe_a join clubs ca on ca.id = ia.club_id
    join inscriptions ib on ib.id = r.equipe_b join clubs cb on cb.id = ib.club_id
    left join lateral (
      select m.id, m.type_match, m.created_at,
             (select max(p.sets_gagnes) from participants_match p where p.match_id = m.id and p.cote = 'A') as sa,
             (select max(p.sets_gagnes) from participants_match p where p.match_id = m.id and p.cote = 'B') as sb,
             (select string_agg(x.score_a || '-' || x.score_b, ', ' order by x.numero) from manches x where x.match_id = m.id) as manches,
             (select jsonb_agg(jsonb_build_object('id', case when l.masque_public then null else l.id end,
                                                  'nom', case when l.masque_public then 'Joueur masqué' else l.prenom || ' ' || l.nom end) order by l.nom)
                from participants_match p join licencies l on l.id = p.licencie_id where p.match_id = m.id and p.cote = 'A') as la,
             (select jsonb_agg(jsonb_build_object('id', case when l.masque_public then null else l.id end,
                                                  'nom', case when l.masque_public then 'Joueur masqué' else l.prenom || ' ' || l.nom end) order by l.nom)
                from participants_match p join licencies l on l.id = p.licencie_id where p.match_id = m.id and p.cote = 'B') as lb
        from matchs m where m.rencontre_id = r.id and m.statut = 'valide'
    ) v on true
   where r.competition_id = p_competition
     and exists (select 1 from competitions c where c.id = p_competition and c.statut in ('cloturee', 'terminee'))
   group by r.id, r.tour, r.date_rencontre, r.created_at, ia.nom_equipe, ca.nom, ib.nom_equipe, cb.nom
   order by r.date_rencontre nulls last, r.tour, r.created_at
$$;
revoke execute on function rencontres_publiques(uuid) from public;
grant execute on function rencontres_publiques(uuid) to anon, authenticated;

select 'ok : ' || count(*) || ' compétitions' as controle from competitions;
commit;
