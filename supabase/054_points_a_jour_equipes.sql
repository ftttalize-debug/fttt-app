-- =====================================================================
-- FTTT – Script 054 : championnats par équipes — le barème part des points d'AVANT la date de la journée
-- À exécuter après 053. Relançable.
--  · Toutes les rencontres d'un même jour (Élite, D2…) partent des mêmes points, quel que soit l'ordre
--    ou le moment où tu valides : les points déjà appliqués ce jour-là sont retirés du calcul.
--  · Une journée plus tardive part des points à jour (résultats des journées précédentes inclus).
-- Compétitions individuelles et doubles : inchangé (points figés à la clôture des inscriptions).
-- =====================================================================
begin;
select set_config('app.recalcul', 'on', true);

create or replace function valider_matchs(p_competition uuid, p_matchs uuid[] default null) returns integer
language plpgsql security definer set search_path = public as $$
declare
  c competitions;
  m record; pa record; pb record;
  v_nb integer := 0;
  v_vict_a boolean;
  v_ref_a numeric; v_ref_b numeric;
  v_date date;
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

      -- Championnat par équipes : points d'AVANT la date de la rencontre.
      -- Les rencontres d'un même jour partent des mêmes points (quel que soit l'ordre de validation) ;
      -- une journée plus tardive part des points à jour, résultats des journées précédentes inclus.
      if c.type = 'equipe' then
        select r.date_rencontre into v_date from rencontres r where r.id = m.rencontre_id;
        if v_date is not null then
          select l.points - coalesce((select sum(mp.points) from mouvements_points mp
                   join matchs m2 on m2.id = mp.match_id join rencontres r2 on r2.id = m2.rencontre_id
                  where mp.licencie_id = l.id and mp.applique and r2.date_rencontre >= v_date), 0)
            into v_ref_a from licencies l where l.id = pa.licencie_id;
          select l.points - coalesce((select sum(mp.points) from mouvements_points mp
                   join matchs m2 on m2.id = mp.match_id join rencontres r2 on r2.id = m2.rencontre_id
                  where mp.licencie_id = l.id and mp.applique and r2.date_rencontre >= v_date), 0)
            into v_ref_b from licencies l where l.id = pb.licencie_id;
        end if;
      end if;

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

select 'ok : points d''avant la date de la journée' as controle;
commit;
