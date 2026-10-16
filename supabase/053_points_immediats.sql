-- =====================================================================
-- FTTT – Script 053 : les points s'appliquent dès la validation des matchs
-- À exécuter après 052. Relançable. Plus besoin de « clôturer le mois » :
--  · valider les matchs ajoute les points aux joueurs et remet à jour le classement du mois en cours ;
--  · invalider un match retire ses points ;
--  · les points déjà validés mais pas encore appliqués (octobre) sont appliqués maintenant.
-- =====================================================================
begin;
select set_config('app.recalcul', 'on', true);

-- Photographie du classement du mois (même calcul que l'ancienne clôture du mois)
create or replace function _publier_classement(p_mois date) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_mois date := date_trunc('month', p_mois)::date;
  v_saison uuid;
begin
  select id into v_saison from saisons where v_mois between date_debut and date_fin limit 1;
  if v_saison is null then return; end if;
  delete from classements_mensuels where mois = v_mois;
  insert into classements_mensuels (licencie_id, saison_id, mois, points, rang, categorie)
  select l.id, v_saison, v_mois, l.points, rank() over (order by l.points desc), categorie_age(l.date_naissance, v_mois)
    from licencies l where l.statut = 'actif';
end $$;
revoke execute on function _publier_classement(date) from public, anon, authenticated;

create or replace function valider_matchs(p_competition uuid, p_matchs uuid[] default null) returns integer
language plpgsql security definer set search_path = public as $$
declare
  c competitions;
  m record; pa record; pb record;
  v_nb integer := 0;
  v_vict_a boolean;
  v_ref_a numeric; v_ref_b numeric;
begin
  if not est_cadre() then raise exception 'Réservé au cadre fédéral'; end if;
  select * into c from competitions where id = p_competition;
  if not found then raise exception 'Compétition introuvable.'; end if;
  if c.statut not in ('cloturee', 'terminee') then raise exception 'Compétition non close.'; end if;
  perform set_config('app.recalcul', 'on', true);

  for m in select * from matchs where competition_id = p_competition and statut = 'saisi'
            and (p_matchs is null or id = any(p_matchs)) order by created_at loop
    if m.type_match = 'simple' and m.forfait_cote is null then
      select * into pa from participants_match where match_id = m.id and cote = 'A';
      select * into pb from participants_match where match_id = m.id and cote = 'B';
      v_vict_a := pa.sets_gagnes > pb.sets_gagnes;
      select coalesce(ip.points_reference, l.points) into v_ref_a
        from licencies l left join (select ip2.licencie_id, ip2.points_reference from inscription_participants ip2
              join inscriptions i2 on i2.id = ip2.inscription_id where i2.competition_id = p_competition and i2.statut = 'active') ip
          on ip.licencie_id = l.id where l.id = pa.licencie_id;
      select coalesce(ip.points_reference, l.points) into v_ref_b
        from licencies l left join (select ip2.licencie_id, ip2.points_reference from inscription_participants ip2
              join inscriptions i2 on i2.id = ip2.inscription_id where i2.competition_id = p_competition and i2.statut = 'active') ip
          on ip.licencie_id = l.id where l.id = pb.licencie_id;

      update participants_match set points_avant = v_ref_a, ecart = v_ref_b - v_ref_a,
             points_bruts = points_match(v_ref_b - v_ref_a, v_vict_a, 1),
             points_finaux = points_match(v_ref_b - v_ref_a, v_vict_a, c.coefficient) where id = pa.id;
      update participants_match set points_avant = v_ref_b, ecart = v_ref_a - v_ref_b,
             points_bruts = points_match(v_ref_a - v_ref_b, not v_vict_a, 1),
             points_finaux = points_match(v_ref_a - v_ref_b, not v_vict_a, c.coefficient) where id = pb.id;
      insert into mouvements_points (licencie_id, match_id, saison_id, mois, points)
        select pm.licencie_id, m.id, c.saison_id, date_trunc('month', coalesce((select r.date_rencontre from rencontres r where r.id = m.rencontre_id), c.date_fin))::date, pm.points_finaux
          from participants_match pm where pm.match_id = m.id
        on conflict (match_id, licencie_id) do update set points = excluded.points;
    end if;
    update matchs set statut = 'valide', valide_par = mon_licencie_id(), date_validation = now() where id = m.id;
    v_nb := v_nb + 1;
  end loop;
  -- Points appliqués tout de suite : le classement bouge dès la validation
  update licencies l set points = round(l.points + s.total, 1)
    from (select licencie_id, sum(points) total from mouvements_points where not applique group by licencie_id) s
   where l.id = s.licencie_id;
  update mouvements_points set applique = true where not applique;
  perform _publier_classement(date_trunc('month', current_date)::date);
  perform set_config('app.recalcul', 'off', true);
  return v_nb;
end $$;
revoke execute on function valider_matchs(uuid, uuid[]) from public, anon;
grant execute on function valider_matchs(uuid, uuid[]) to authenticated;

-- Invalider un match validé : ses points sont retirés des joueurs
create or replace function invalider_match(p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not est_cadre() then raise exception 'Réservé au cadre fédéral'; end if;
  perform set_config('app.recalcul', 'on', true);
  update licencies l set points = round(l.points - s.total, 1)
    from (select licencie_id, sum(points) total from mouvements_points where match_id = p_match and applique group by licencie_id) s
   where l.id = s.licencie_id;
  delete from mouvements_points where match_id = p_match;
  update participants_match set points_avant = null, ecart = null, points_bruts = null, points_finaux = null where match_id = p_match;
  update matchs set statut = 'saisi', valide_par = null, date_validation = null where id = p_match and statut = 'valide';
  if not found then raise exception 'Ce match n''est pas validé.'; end if;
  perform _publier_classement(date_trunc('month', current_date)::date);
  perform set_config('app.recalcul', 'off', true);
end $$;
revoke execute on function invalider_match(uuid) from public, anon;
grant execute on function invalider_match(uuid) to authenticated;

-- Une fois : applique les points déjà validés et pas encore appliqués
update licencies l set points = round(l.points + s.total, 1)
  from (select licencie_id, sum(points) total from mouvements_points where not applique group by licencie_id) s
 where l.id = s.licencie_id;
update mouvements_points set applique = true where not applique;
select _publier_classement(date_trunc('month', current_date)::date);

select count(*) filter (where applique) as mouvements_appliques, count(*) filter (where not applique) as restants from mouvements_points;
commit;
