-- =====================================================================
-- FTTT – Script 050 : forfait d'un joueur ou d'une paire dans une rencontre par équipes
-- À exécuter après 049. Une seule requête, rien d'autre dedans. Relançable.
--  - matchs.forfait_cote : 'A' ou 'B' = côté qui déclare forfait (rien = match joué)
--  - saisir_forfait_rencontre : enregistre le forfait (3-0 pour l'adversaire, sans manches)
--  - valider_matchs : un match forfait est validé SANS points (ni gain ni perte),
--    mais il compte dans le résultat de la rencontre (victoire de l'adversaire).
-- =====================================================================
begin;

alter table matchs add column if not exists forfait_cote text check (forfait_cote in ('A', 'B'));

-- 1) Saisir (ou corriger) un forfait dans une rencontre
create or replace function saisir_forfait_rencontre(
  p_rencontre uuid, p_type text, p_cote_a uuid[], p_cote_b uuid[], p_cote_forfait text, p_match uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  r rencontres;
  c competitions;
  ins inscriptions;
  l licencies;
  m matchs;
  v_id uuid := p_match;
  v_n int;
  v_motif text;
  v_equipe uuid;
  v_cote uuid[];
  v_attendu int := case when p_type = 'double' then 2 else 1 end;
  j uuid;
begin
  select * into r from rencontres where id = p_rencontre;
  if not found then raise exception 'Rencontre introuvable.'; end if;
  select * into c from competitions where id = r.competition_id;
  if not (est_cadre() or est_juge_de(r.competition_id)) then raise exception 'Tu n''es pas juge-arbitre de cette compétition.'; end if;
  if est_cadre() then
    if c.statut not in ('cloturee', 'terminee') then raise exception 'Les scores se saisissent une fois les inscriptions closes.'; end if;
  elsif c.statut <> 'cloturee' then
    raise exception 'La saisie des scores est fermée pour cette compétition.';
  end if;
  if p_type not in ('simple', 'double') then raise exception 'Type de match invalide.'; end if;
  if p_cote_forfait not in ('A', 'B') then raise exception 'Indique quel côté déclare forfait.'; end if;
  if coalesce(array_length(p_cote_a, 1), 0) <> v_attendu or coalesce(array_length(p_cote_b, 1), 0) <> v_attendu then
    raise exception 'Il faut % joueur(s) de chaque côté.', v_attendu;
  end if;
  if (select count(distinct x) from unnest(p_cote_a || p_cote_b) x) <> 2 * v_attendu then
    raise exception 'Un joueur ne peut pas apparaître deux fois.';
  end if;

  if exists (select 1 from unnest(p_cote_a) x
              where not exists (select 1 from composition_rencontre cr where cr.rencontre_id = p_rencontre and cr.inscription_id = r.equipe_a and cr.licencie_id = x))
     or exists (select 1 from unnest(p_cote_b) x
              where not exists (select 1 from composition_rencontre cr where cr.rencontre_id = p_rencontre and cr.inscription_id = r.equipe_b and cr.licencie_id = x)) then
    raise exception 'Les joueurs doivent être alignés dans la feuille de rencontre (équipe A à gauche, équipe B à droite).';
  end if;
  if p_match is null then
    select count(*) into v_n from matchs where rencontre_id = p_rencontre and type_match = p_type;
    if p_type = 'simple' and c.nb_simples is not null and v_n >= c.nb_simples then
      raise exception 'Cette rencontre compte déjà ses % simples.', c.nb_simples;
    end if;
    if p_type = 'double' and c.nb_doubles is not null and v_n >= c.nb_doubles then
      raise exception 'Cette rencontre compte déjà ses % doubles.', c.nb_doubles;
    end if;
  else
    select * into m from matchs where id = p_match and rencontre_id = p_rencontre;
    if not found then raise exception 'Match introuvable dans cette rencontre.'; end if;
    if m.statut = 'valide' then raise exception 'Ce match est validé : demande au cadre fédéral de l''invalider d''abord.'; end if;
  end if;

  -- rattachement à l'effectif des joueurs (mêmes contrôles que pour un match joué)
  foreach v_equipe in array array[r.equipe_a, r.equipe_b] loop
    select * into ins from inscriptions where id = v_equipe;
    v_cote := case when v_equipe = r.equipe_a then p_cote_a else p_cote_b end;
    for l in select * from licencies where id = any(v_cote) loop
      if not exists (select 1 from inscription_participants where inscription_id = v_equipe and licencie_id = l.id) then
        v_motif := _motif_joueur_equipe(c, ins, l);
        if v_motif is not null then raise exception '% % %.', l.prenom, l.nom, v_motif; end if;
        insert into inscription_participants (inscription_id, licencie_id, rang, points_reference, club_id)
        values (v_equipe, l.id, (select coalesce(max(rang), 0) + 1 from inscription_participants where inscription_id = v_equipe), l.points, l.club_id);
      end if;
    end loop;
  end loop;

  if v_id is null then
    insert into matchs (competition_id, tour, juge_id, statut, type_match, sets_gagnants, rencontre_id, forfait_cote)
    values (r.competition_id, r.tour, mon_licencie_id(), 'saisi', p_type, 3, p_rencontre, p_cote_forfait) returning id into v_id;
  else
    update matchs set statut = 'saisi', type_match = p_type, forfait_cote = p_cote_forfait,
           juge_id = coalesce(juge_id, mon_licencie_id()) where id = v_id;
    delete from participants_match where match_id = v_id;
    delete from manches where match_id = v_id;
  end if;
  -- le côté qui reste gagne 3-0, sans manches
  foreach j in array p_cote_a loop
    insert into participants_match (match_id, licencie_id, cote, sets_gagnes)
    values (v_id, j, 'A', case when p_cote_forfait = 'A' then 0 else 3 end);
  end loop;
  foreach j in array p_cote_b loop
    insert into participants_match (match_id, licencie_id, cote, sets_gagnes)
    values (v_id, j, 'B', case when p_cote_forfait = 'B' then 0 else 3 end);
  end loop;
  return v_id;
end $$;
revoke execute on function saisir_forfait_rencontre(uuid, text, uuid[], uuid[], text, uuid) from public, anon;
grant execute on function saisir_forfait_rencontre(uuid, text, uuid[], uuid[], text, uuid) to authenticated;

-- 2) Valider : un forfait ne donne aucun point (le match est validé, sans mouvement de points)
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
        select pm.licencie_id, m.id, c.saison_id, date_trunc('month', c.date_fin)::date, pm.points_finaux
          from participants_match pm where pm.match_id = m.id
        on conflict (match_id, licencie_id) do update set points = excluded.points;
    end if;
    update matchs set statut = 'valide', valide_par = mon_licencie_id(), date_validation = now() where id = m.id;
    v_nb := v_nb + 1;
  end loop;
  perform set_config('app.recalcul', 'off', true);
  return v_nb;
end $$;

select 'ok : forfait' as controle;
commit;
