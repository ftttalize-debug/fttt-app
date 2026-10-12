-- =====================================================================
-- FTTT – Lot 3 / Script 8 : inscriptions aux compétitions
-- À exécuter après 007. Une seule requête, rien d'autre dedans.
-- Les clubs n'écrivent plus directement dans les tables d'inscription :
-- tout passe par deux fonctions qui contrôlent les règles (« tout ou rien »).
-- =====================================================================

-- 1) Contrôle d'une liste de joueurs pour une inscription
create or replace function _controle_inscription(
  p_comp competitions, p_club uuid, p_joueurs uuid[], p_exclure uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_n int := coalesce(array_length(p_joueurs, 1), 0);
  r record;
begin
  if v_n = 0 then raise exception 'Choisis au moins un joueur.'; end if;
  if (select count(distinct x) from unnest(p_joueurs) x) <> v_n then
    raise exception 'Un joueur est choisi deux fois.';
  end if;
  if p_comp.type = 'double' and v_n <> 2 then
    raise exception 'Un double comporte exactement 2 joueurs.';
  end if;
  if p_comp.type = 'equipe' and v_n < 2 then
    raise exception 'Une équipe comporte au moins 2 joueurs.';
  end if;

  for r in
    select l.id, l.nom, l.prenom, l.club_id, l.statut,
           (select lc.type from licences lc
             where lc.licencie_id = l.id and lc.saison_id = p_comp.saison_id and lc.statut = 'active') as type_licence
      from licencies l where l.id = any(p_joueurs)
  loop
    if r.club_id is distinct from p_club then
      raise exception '% % n''appartient pas à ce club.', r.prenom, r.nom;
    end if;
    if r.statut <> 'actif' then
      raise exception '% % n''est pas licencié(e) cette saison.', r.prenom, r.nom;
    end if;
    if r.type_licence is null then
      raise exception '% % n''a pas de licence pour la saison de cette compétition.', r.prenom, r.nom;
    end if;
    if not p_comp.ouverte_a_tous and r.type_licence <> 'competition' then
      raise exception '% % n''a pas une licence compétition.', r.prenom, r.nom;
    end if;
    if exists (select 1 from inscription_participants ip
                 join inscriptions i on i.id = ip.inscription_id
                where i.competition_id = p_comp.id and i.statut = 'active'
                  and ip.licencie_id = r.id and i.id is distinct from p_exclure) then
      raise exception '% % est déjà inscrit(e) à cette compétition.', r.prenom, r.nom;
    end if;
  end loop;
end $$;

-- 2) Créer ou modifier une inscription (p_inscription = null pour créer)
create or replace function enregistrer_inscription(
  p_competition uuid, p_club uuid, p_joueurs uuid[], p_inscription uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  c competitions;
  v_id uuid := p_inscription;
  v_moi uuid := mon_licencie_id();
  v_type type_inscription;
  i int;
begin
  select * into c from competitions where id = p_competition;
  if not found then raise exception 'Compétition introuvable.'; end if;
  if not (est_cadre() or est_responsable_de(p_club)) then
    raise exception 'Tu ne peux pas inscrire les joueurs de ce club.';
  end if;
  if est_cadre() then
    if c.statut not in ('ouverte', 'cloturee') then
      raise exception 'Les inscriptions ne sont possibles que compétition ouverte ou close.';
    end if;
  elsif not competition_ouverte(p_competition) then
    raise exception 'Les inscriptions sont fermées pour cette compétition.';
  end if;

  v_type := case c.type when 'simple' then 'individuelle' when 'double' then 'paire' else 'equipe' end;

  if v_id is null then
    if c.type = 'simple' and exists (select 1 from inscriptions
         where competition_id = p_competition and club_id = p_club and statut = 'active') then
      raise exception 'Ce club a déjà une inscription : modifie-la pour ajouter des joueurs.';
    end if;
  else
    if not exists (select 1 from inscriptions where id = v_id and competition_id = p_competition
                    and club_id = p_club and statut = 'active') then
      raise exception 'Inscription introuvable.';
    end if;
  end if;

  perform _controle_inscription(c, p_club, p_joueurs, v_id);

  if v_id is null then
    insert into inscriptions (competition_id, club_id, type, statut, saisi_par)
    values (p_competition, p_club, v_type, 'active', v_moi) returning id into v_id;
  else
    delete from inscription_participants where inscription_id = v_id;
  end if;

  for i in 1 .. array_length(p_joueurs, 1) loop
    insert into inscription_participants (inscription_id, licencie_id, rang, points_reference)
    select v_id, l.id, i, l.points from licencies l where l.id = p_joueurs[i];
  end loop;
  return v_id;
end $$;

-- 3) Annuler une inscription
create or replace function annuler_inscription(p_inscription uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  i inscriptions;
  c competitions;
begin
  select * into i from inscriptions where id = p_inscription;
  if not found then raise exception 'Inscription introuvable.'; end if;
  select * into c from competitions where id = i.competition_id;
  if not (est_cadre() or est_responsable_de(i.club_id)) then
    raise exception 'Tu ne peux pas annuler cette inscription.';
  end if;
  if est_cadre() then
    if c.statut = 'terminee' then raise exception 'Compétition terminée.'; end if;
  elsif not competition_ouverte(c.id) then
    raise exception 'Les inscriptions sont fermées : contacte la fédération.';
  end if;
  update inscriptions set statut = 'annulee' where id = p_inscription;
end $$;

-- 4) À la clôture, les points de référence sont figés à la valeur du jour
create or replace function figer_points_cloture() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.statut = 'cloturee' and old.statut = 'ouverte' then
    update inscription_participants ip
       set points_reference = l.points
      from licencies l, inscriptions i
     where i.competition_id = new.id and i.statut = 'active'
       and ip.inscription_id = i.id and l.id = ip.licencie_id;
  end if;
  return new;
end $$;
drop trigger if exists trg_figer_points_cloture on competitions;
create trigger trg_figer_points_cloture after update of statut on competitions
  for each row execute function figer_points_cloture();

-- 5) Les clubs ne peuvent plus écrire directement : uniquement via les fonctions
drop policy if exists inscriptions_ajout on inscriptions;
drop policy if exists inscriptions_maj on inscriptions;
drop policy if exists participants_ajout on inscription_participants;
drop policy if exists participants_maj on inscription_participants;
drop policy if exists participants_suppr on inscription_participants;

revoke execute on function _controle_inscription(competitions, uuid, uuid[], uuid) from public, anon, authenticated;
revoke execute on function enregistrer_inscription(uuid, uuid, uuid[], uuid) from public, anon;
revoke execute on function annuler_inscription(uuid) from public, anon;
revoke execute on function figer_points_cloture() from public, anon, authenticated;
grant execute on function enregistrer_inscription(uuid, uuid, uuid[], uuid) to authenticated;
grant execute on function annuler_inscription(uuid) to authenticated;
