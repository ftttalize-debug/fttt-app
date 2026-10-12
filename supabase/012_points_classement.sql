-- =====================================================================
-- FTTT – Lot 6 / Script 12 : points, classement mensuel, nouvelle saison, pages publiques
-- À exécuter après 011. Une seule requête, rien d'autre dedans.
--  - cloturer_mois : applique les points validés du mois et fige le classement du mois
--  - passer_saison : au 1er juillet, archive les non-renouvelés et remonte à 500 les points inférieurs
--  - fonctions publiques (sans connexion) : classement, compétitions, résultats (nom, club, catégorie, points)
-- =====================================================================

alter table mouvements_points add column if not exists applique boolean not null default false;

-- 1) Clôturer un mois (p_mois = 1er jour du mois). Peut être relancé : seuls les nouveaux mouvements s'ajoutent.
create or replace function cloturer_mois(p_mois date) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_mois date := date_trunc('month', p_mois)::date;
  v_saison uuid;
  v_nb integer;
begin
  if not est_cadre() then raise exception 'Réservé au cadre fédéral'; end if;
  if v_mois > date_trunc('month', current_date)::date then raise exception 'Ce mois n''est pas commencé.'; end if;
  select id into v_saison from saisons where v_mois between date_debut and date_fin limit 1;
  if v_saison is null then raise exception 'Aucune saison ne couvre ce mois.'; end if;

  perform set_config('app.recalcul', 'on', true);
  update licencies l set points = round(l.points + s.total, 1)
    from (select licencie_id, sum(points) total from mouvements_points
           where mois = v_mois and not applique group by licencie_id) s
   where l.id = s.licencie_id;
  update mouvements_points set applique = true where mois = v_mois and not applique;

  delete from classements_mensuels where mois = v_mois;
  insert into classements_mensuels (licencie_id, saison_id, mois, points, rang, categorie)
  select l.id, v_saison, v_mois, l.points,
         rank() over (order by l.points desc), categorie_age(l.date_naissance, v_mois)
    from licencies l where l.statut = 'actif';
  get diagnostics v_nb = row_count;
  perform set_config('app.recalcul', 'off', true);
  return v_nb;
end $$;

-- 2) Un match validé dont les points sont déjà appliqués ne peut plus être invalidé
create or replace function invalider_match(p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not est_cadre() then raise exception 'Réservé au cadre fédéral'; end if;
  if exists (select 1 from mouvements_points where match_id = p_match and applique) then
    raise exception 'Les points de ce match sont déjà dans le classement d''un mois clôturé.';
  end if;
  perform set_config('app.recalcul', 'on', true);
  delete from mouvements_points where match_id = p_match;
  update participants_match set points_avant = null, ecart = null, points_bruts = null, points_finaux = null where match_id = p_match;
  update matchs set statut = 'saisi', valide_par = null, date_validation = null where id = p_match and statut = 'valide';
  if not found then raise exception 'Ce match n''est pas validé.'; end if;
  perform set_config('app.recalcul', 'off', true);
end $$;

-- 3) Passage à la nouvelle saison (à lancer à partir du 1er juillet)
create or replace function passer_saison() returns json
language plpgsql security definer set search_path = public as $$
declare
  v_saison uuid;
  v_archives integer;
  v_remontes integer;
begin
  if not est_cadre() then raise exception 'Réservé au cadre fédéral'; end if;
  select id into v_saison from saisons where current_date between date_debut and date_fin limit 1;
  if v_saison is null then raise exception 'Crée d''abord la saison en cours.'; end if;
  perform set_config('app.recalcul', 'on', true);
  update licencies l set statut = 'archive', date_archivage = current_date
   where l.statut = 'actif'
     and not exists (select 1 from licences lc where lc.licencie_id = l.id and lc.saison_id = v_saison and lc.statut = 'active');
  get diagnostics v_archives = row_count;
  update licencies set points = 500 where points < 500;
  get diagnostics v_remontes = row_count;
  perform set_config('app.recalcul', 'off', true);
  return json_build_object('archives', v_archives, 'remontes', v_remontes);
end $$;

-- 4) Pages publiques : seulement nom, club, catégorie, points, résultats validés
create or replace function mois_publies() returns table (mois date)
language sql stable security definer set search_path = public as $$
  select distinct mois from classements_mensuels order by mois desc
$$;

create or replace function classement_public(p_mois date default null)
returns table (rang integer, nom text, prenom text, club text, categorie text, sexe text, points numeric)
language sql stable security definer set search_path = public as $$
  select cm.rang, l.nom, l.prenom, c.nom, cm.categorie, l.sexe::text, cm.points
    from classements_mensuels cm
    join licencies l on l.id = cm.licencie_id
    left join clubs c on c.id = l.club_id
   where cm.mois = coalesce(p_mois, (select max(mois) from classements_mensuels))
   order by cm.rang, l.nom
$$;

create or replace function competitions_publiques()
returns table (id uuid, nom text, lieu text, date_debut date, date_fin date, type text, statut text)
language sql stable security definer set search_path = public as $$
  select id, nom, lieu, date_debut, date_fin, type::text, statut::text
    from competitions where statut in ('cloturee', 'terminee') order by date_debut desc
$$;

create or replace function resultats_publics(p_competition uuid)
returns table (match_id uuid, tour text, type_match text, cote text, joueurs text, sets_gagnes integer, manches text)
language sql stable security definer set search_path = public as $$
  select m.id, m.tour, m.type_match, pm.cote,
         string_agg(l.prenom || ' ' || l.nom, ' / ' order by l.nom), max(pm.sets_gagnes),
         (select string_agg(x.score_a || '-' || x.score_b, ', ' order by x.numero) from manches x where x.match_id = m.id)
    from matchs m
    join participants_match pm on pm.match_id = m.id
    join licencies l on l.id = pm.licencie_id
   where m.competition_id = p_competition and m.statut = 'valide'
     and exists (select 1 from competitions c where c.id = p_competition and c.statut in ('cloturee', 'terminee'))
   group by m.id, m.tour, m.type_match, pm.cote, m.created_at
   order by m.created_at, pm.cote
$$;

revoke execute on function cloturer_mois(date) from public, anon;
revoke execute on function invalider_match(uuid) from public, anon;
revoke execute on function passer_saison() from public, anon;
grant execute on function cloturer_mois(date) to authenticated;
grant execute on function invalider_match(uuid) to authenticated;
grant execute on function passer_saison() to authenticated;
grant execute on function mois_publies() to anon, authenticated;
grant execute on function classement_public(date) to anon, authenticated;
grant execute on function competitions_publiques() to anon, authenticated;
grant execute on function resultats_publics(uuid) to anon, authenticated;
