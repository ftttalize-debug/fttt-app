-- =====================================================================
-- FTTT – Script 035 : catégories par année de naissance, U12, points maximum, inscriptions réservées à la fédération
-- À exécuter après 034. Une seule requête, rien d'autre dedans. Relançable.
-- 1) Catégorie d'âge = année de la compétition (ou du jour) − année de naissance, quel que soit le mois
--    (ex. U13 en 2026 : né(e) en 2013 ou après). Remplace l'âge réel au 1er janvier. Touche aussi seniors / vétérans.
-- 2) Catégorie U12 pour un tableau
-- 3) Points maximum par tableau (ex. 599 points et moins) : contrôle sur les points actuels du joueur
-- 4) Inscriptions réservées à la fédération (sélectives) : ni clubs ni athlètes ; le cadre inscrit
-- 5) creer_tableaux copie ces deux nouveautés
-- =====================================================================
begin;
select set_config('app.recalcul', 'on', true);

-- ---------- 1) Âge de catégorie ----------
create or replace function age_categorie(p_naissance date, p_ref date default current_date) returns integer
language sql immutable as $$
  select extract(year from p_ref)::int - extract(year from p_naissance)::int
$$;

create or replace function categorie_age(p_naissance date, p_ref date default current_date)
returns text
language sql immutable as $$
  select case
    when a <= 9  then 'poussin'
    when a <= 11 then 'benjamin'
    when a <= 13 then 'minime'
    when a <= 15 then 'cadet'
    when a <= 19 then 'junior'
    when a <= 40 then 'senior'
    else 'veteran'
  end
  from (select age_categorie(p_naissance, p_ref) as a) t
$$;

-- ---------- 2) et 3) et 4) Colonnes ----------
alter table competitions drop constraint if exists competitions_categorie_max_check;
alter table competitions add constraint competitions_categorie_max_check
  check (categorie_max is null or categorie_max in ('U11', 'U12', 'U13', 'U15', 'U19'));
alter table competitions add column if not exists points_max integer;
alter table competitions drop constraint if exists competitions_points_max_check;
alter table competitions add constraint competitions_points_max_check check (points_max is null or points_max > 0);
alter table competitions add column if not exists inscription_federation boolean not null default false;

-- ---------- Contrôle âge, points et genre ----------
create or replace function _motif_genre_age(c competitions, l licencies) returns text
language sql stable set search_path = public as $$
  select case
    when c.categorie_min = 'veteran' and categorie_age(l.date_naissance, c.date_debut) <> 'veteran'
      then 'Tableau réservé aux vétérans'
    when c.categorie_max is not null
         and age_categorie(l.date_naissance, c.date_debut) > substr(c.categorie_max, 2)::int
      then 'Trop âgé(e) pour ce tableau (' || c.categorie_max || ' et moins)'
    when c.points_max is not null and l.points > c.points_max
      then 'Trop de points pour ce tableau (' || c.points_max || ' points et moins)'
    when c.genre = 'dames' and l.sexe::text <> 'F' then 'Tableau réservé aux dames'
    when c.genre = 'messieurs' and l.sexe::text <> 'M' then 'Tableau réservé aux messieurs'
    else null
  end
$$;
revoke execute on function _motif_genre_age(competitions, licencies) from public, anon, authenticated;

-- ---------- Inscriptions fermées aux clubs et aux athlètes si réservées à la fédération ----------
create or replace function competition_ouverte(p_comp uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from competitions c
    where c.id = p_comp and c.statut = 'ouverte' and not c.inscription_federation
      and (c.date_limite_inscription is null or current_date <= c.date_limite_inscription))
$$;

-- ---------- 5) creer_tableaux copie la réservation fédération et accepte points_max ----------
create or replace function creer_tableaux(p_modele uuid, p_tableaux jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare
  m competitions;
  t jsonb;
  v_evt uuid;
  v_new uuid;
  v_n integer := 0;
begin
  if not est_cadre() then raise exception 'Réservé au cadre fédéral.'; end if;
  select * into m from competitions where id = p_modele;
  if not found then raise exception 'Compétition modèle introuvable.'; end if;
  if jsonb_typeof(p_tableaux) <> 'array' or jsonb_array_length(p_tableaux) = 0 then
    raise exception 'Aucun tableau à créer.';
  end if;
  v_evt := coalesce(m.evenement_id, m.id);
  if m.evenement_id is null then update competitions set evenement_id = v_evt where id = m.id; end if;

  for t in select * from jsonb_array_elements(p_tableaux) loop
    if coalesce(trim(t->>'nom'), '') = '' then raise exception 'Chaque tableau doit avoir un nom.'; end if;
    insert into competitions (nom, saison_id, lieu, date_debut, date_fin, type, coefficient, montant_xpf,
                              date_limite_inscription, statut, ouverte_a_tous, evenement_id, genre, categorie_max, categorie_min,
                              points_max, inscription_federation)
    values (trim(t->>'nom'), m.saison_id, m.lieu, m.date_debut, m.date_fin,
            coalesce(nullif(t->>'type', ''), m.type::text)::type_competition, m.coefficient,
            coalesce((t->>'montant_xpf')::integer, m.montant_xpf), m.date_limite_inscription, 'brouillon', m.ouverte_a_tous, v_evt,
            coalesce(nullif(t->>'genre', ''), 'ouvert'), nullif(t->>'categorie_max', ''), nullif(t->>'categorie_min', ''),
            nullif(t->>'points_max', '')::integer, m.inscription_federation)
    returning id into v_new;
    insert into competition_juges (competition_id, licencie_id)
      select v_new, licencie_id from competition_juges where competition_id = m.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke execute on function creer_tableaux(uuid, jsonb) from public, anon;
grant execute on function creer_tableaux(uuid, jsonb) to authenticated;

select 'ok : ' || count(*) || ' compétitions ; catégories recalculées par année de naissance' as controle from competitions;
commit;
