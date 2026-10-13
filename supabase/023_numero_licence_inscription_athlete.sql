-- =====================================================================
-- FTTT – Script 023 : numéro de licence permanent + inscription des athlètes eux-mêmes
-- À exécuter après 022 (ou 021). Une seule requête, rien d'autre dedans. Relançable.
-- 1) Chaque fiche reçoit un numéro permanent FTTT-00001, FTTT-00002… (nouvelles fiches : automatique).
-- 2) Un athlète s'inscrit lui-même à une compétition SIMPLE ouverte, sans compte : numéro + date de naissance.
--    Il est ajouté à l'inscription de son club (créée si besoin) : la facture reste celle du club.
--    Doubles et équipes : toujours par le club. Le club ou la fédération peut annuler l'inscription.
-- 3) Protection : 5 essais ratés par numéro / 15 min, et 40 essais ratés au total / 10 min.
-- =====================================================================
begin;
select set_config('app.recalcul', 'on', true);
select set_config('app.import', 'on', true);

-- ---------- 1) Numéro de licence ----------
alter table licencies add column if not exists numero_licence text unique;
create sequence if not exists seq_numero_licence;

with base as (select coalesce(max(substr(numero_licence, 6)::int), 0) as m from licencies where numero_licence is not null),
     o as (select id, row_number() over (order by created_at, nom, prenom, id) as rn from licencies where numero_licence is null)
update licencies l set numero_licence = 'FTTT-' || lpad((o.rn + base.m)::text, 5, '0')
  from o, base where l.id = o.id;
select setval('seq_numero_licence', greatest((select coalesce(max(substr(numero_licence, 6)::int), 0) from licencies), 1));

create or replace function attribuer_numero_licence() returns trigger
language plpgsql as $$
begin
  if new.numero_licence is null then
    new.numero_licence := 'FTTT-' || lpad(nextval('seq_numero_licence')::text, 5, '0');
  end if;
  return new;
end $$;
drop trigger if exists trg_numero_licence on licencies;
create trigger trg_numero_licence before insert on licencies
  for each row execute function attribuer_numero_licence();

-- Le numéro ne change jamais une fois attribué
create or replace function figer_numero_licence() returns trigger
language plpgsql as $$
begin
  if old.numero_licence is not null and new.numero_licence is distinct from old.numero_licence then
    new.numero_licence := old.numero_licence;
  end if;
  return new;
end $$;
drop trigger if exists trg_figer_numero_licence on licencies;
create trigger trg_figer_numero_licence before update on licencies
  for each row execute function figer_numero_licence();

-- ---------- 2) Identification de l'athlète (interne) ----------
create table if not exists athlete_echecs (numero text not null, at timestamptz not null default now());
create index if not exists athlete_echecs_idx on athlete_echecs (at, numero);
alter table athlete_echecs enable row level security;   -- aucune règle : seules les fonctions ci-dessous y accèdent

create or replace function _athlete(p_numero text, p_naissance date) returns licencies
language plpgsql security definer set search_path = public as $$
declare
  l licencies;
  v_num text := upper(trim(coalesce(p_numero, '')));
begin
  delete from athlete_echecs where at < now() - interval '1 day';
  if (select count(*) from athlete_echecs where at > now() - interval '10 minutes') >= 40 then
    raise exception 'Service momentanément indisponible (trop de tentatives). Réessaie dans quelques minutes.';
  end if;
  if (select count(*) from athlete_echecs where numero = v_num and at > now() - interval '15 minutes') >= 5 then
    raise exception 'Trop de tentatives pour ce numéro. Réessaie dans 15 minutes.';
  end if;
  select * into l from licencies where numero_licence = v_num and date_naissance = p_naissance;
  if not found then
    -- l'échec est enregistré et la fonction rend une fiche vide (une erreur annulerait l'enregistrement)
    insert into athlete_echecs (numero) values (v_num);
    return null;
  end if;
  return l;
end $$;

-- ---------- 3) Ce que voit l'athlète ----------
create or replace function athlete_identifier(p_numero text, p_naissance date) returns json
language plpgsql security definer set search_path = public as $$
declare l licencies;
begin
  l := _athlete(p_numero, p_naissance);
  if l.id is null then return json_build_object('erreur', 'Numéro de licence ou date de naissance incorrect.'); end if;
  return json_build_object('prenom', l.prenom, 'nom', l.nom, 'numero', l.numero_licence, 'points', l.points,
    'actif', l.statut = 'actif', 'club', (select nom from clubs where id = l.club_id));
end $$;

create or replace function athlete_competitions(p_numero text, p_naissance date) returns json
language plpgsql security definer set search_path = public as $$
declare
  l licencies;
  v_res json;
begin
  l := _athlete(p_numero, p_naissance);
  if l.id is null then return json_build_object('erreur', 'Numéro de licence ou date de naissance incorrect.'); end if;
  select coalesce(json_agg(x order by x.date_debut), '[]'::json) into v_res from (
    select c.id, c.nom, c.lieu, c.date_debut, c.date_fin, c.type::text as type, c.coefficient, c.montant_xpf,
           c.date_limite_inscription as date_limite,
           exists (select 1 from inscription_participants ip join inscriptions i on i.id = ip.inscription_id
                    where i.competition_id = c.id and i.statut = 'active' and ip.licencie_id = l.id) as inscrit,
           case
             when c.type <> 'simple' then 'Inscription par ton club'
             when l.statut <> 'actif' then 'Licence non active cette saison'
             when l.club_id is null then 'Aucun club'
             when not exists (select 1 from licences lc where lc.licencie_id = l.id and lc.saison_id = c.saison_id and lc.statut = 'active')
               then 'Pas de licence pour la saison de cette compétition'
             when not c.ouverte_a_tous and not exists (select 1 from licences lc where lc.licencie_id = l.id and lc.saison_id = c.saison_id
                                                         and lc.statut = 'active' and lc.type = 'competition')
               then 'Licence compétition requise'
             else null
           end as indisponible
      from competitions c
     where c.statut = 'ouverte' and competition_ouverte(c.id)
  ) x;
  return json_build_object('competitions', v_res);
end $$;

create or replace function athlete_inscrire(p_numero text, p_naissance date, p_competition uuid) returns json
language plpgsql security definer set search_path = public as $$
declare
  l licencies; c competitions; v_ins uuid;
begin
  l := _athlete(p_numero, p_naissance);
  if l.id is null then return json_build_object('erreur', 'Numéro de licence ou date de naissance incorrect.'); end if;
  select * into c from competitions where id = p_competition;
  if not found then raise exception 'Compétition introuvable.'; end if;
  if c.type <> 'simple' then raise exception 'Les doubles et les équipes sont inscrits par ton club.'; end if;
  if not competition_ouverte(c.id) then raise exception 'Les inscriptions sont fermées pour cette compétition.'; end if;
  if l.club_id is null then raise exception 'Ta fiche n''est rattachée à aucun club.'; end if;

  perform _controle_inscription(c, l.club_id, array[l.id], null);

  select id into v_ins from inscriptions
   where competition_id = c.id and club_id = l.club_id and statut = 'active' order by created_at limit 1;
  if v_ins is null then
    insert into inscriptions (competition_id, club_id, type, statut, saisi_par)
    values (c.id, l.club_id, 'individuelle', 'active', l.id) returning id into v_ins;
  end if;
  insert into inscription_participants (inscription_id, licencie_id, rang, points_reference)
  values (v_ins, l.id, (select coalesce(max(rang), 0) + 1 from inscription_participants where inscription_id = v_ins), l.points);
  return json_build_object('ok', true);
end $$;

create or replace function athlete_desinscrire(p_numero text, p_naissance date, p_competition uuid) returns json
language plpgsql security definer set search_path = public as $$
declare
  l licencies; v_ins uuid;
begin
  l := _athlete(p_numero, p_naissance);
  if l.id is null then return json_build_object('erreur', 'Numéro de licence ou date de naissance incorrect.'); end if;
  if not competition_ouverte(p_competition) then
    raise exception 'Les inscriptions sont fermées : contacte ton club ou la fédération.';
  end if;
  select i.id into v_ins from inscriptions i join inscription_participants ip on ip.inscription_id = i.id
   where i.competition_id = p_competition and i.statut = 'active' and ip.licencie_id = l.id and i.type = 'individuelle';
  if v_ins is null then raise exception 'Tu n''es pas inscrit(e) à cette compétition (ou elle est inscrite en double/équipe par ton club).'; end if;
  delete from inscription_participants where inscription_id = v_ins and licencie_id = l.id;
  if not exists (select 1 from inscription_participants where inscription_id = v_ins) then
    update inscriptions set statut = 'annulee' where id = v_ins;
  end if;
  return json_build_object('ok', true);
end $$;

revoke execute on function _athlete(text, date) from public, anon, authenticated;
revoke execute on function athlete_identifier(text, date), athlete_competitions(text, date),
  athlete_inscrire(text, date, uuid), athlete_desinscrire(text, date, uuid) from public;
grant execute on function athlete_identifier(text, date), athlete_competitions(text, date),
  athlete_inscrire(text, date, uuid), athlete_desinscrire(text, date, uuid) to anon, authenticated;

-- Contrôle : fiches numérotées / total, et premier / dernier numéro
select count(numero_licence) || ' / ' || count(*) as fiches_numerotees, min(numero_licence) as premier, max(numero_licence) as dernier
  from licencies;
commit;
