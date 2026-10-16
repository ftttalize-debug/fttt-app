-- =====================================================================
-- FTTT – Script 052 : les points d'une rencontre comptent dans le mois de la rencontre
-- À exécuter après 051. Relançable. Jusqu'ici le mois comptable était la date de FIN de la compétition
-- (ex. juin 2027 pour un championnat par équipes) : les points d'octobre n'apparaissaient pas en octobre.
-- Désormais : mois de la date de la rencontre (sinon date de fin de la compétition).
-- Les mouvements déjà créés mais pas encore appliqués sont déplacés au bon mois.
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
  perform set_config('app.recalcul', 'off', true);
  return v_nb;
end $$;

update mouvements_points mp
   set mois = date_trunc('month', r.date_rencontre)::date
  from matchs m join rencontres r on r.id = m.rencontre_id
 where mp.match_id = m.id and not mp.applique and r.date_rencontre is not null;

select mois, count(*) as mouvements, count(*) filter (where applique) as deja_appliques
  from mouvements_points group by mois order by mois;
commit;
