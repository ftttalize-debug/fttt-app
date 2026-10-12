-- =====================================================================
-- FTTT – Lot 5 / Script 11 : matchs, scores, validation
-- À exécuter après 010. Une seule requête, rien d'autre dedans.
-- Le juge-arbitre (ou le cadre) saisit le score de chaque manche ; la base en
-- déduit les manches gagnées et le vainqueur. Le cadre valide : les points des
-- matchs SIMPLES sont alors calculés (barème × coefficient) à partir des points
-- figés à la clôture. Les doubles sont enregistrés sans points.
-- =====================================================================

alter table matchs add column if not exists type_match text not null default 'simple'
  check (type_match in ('simple', 'double'));
alter table matchs add column if not exists sets_gagnants integer not null default 3
  check (sets_gagnants in (3, 4));
alter table participants_match drop constraint if exists participants_match_match_id_cote_key;  -- 2 joueurs par côté en double

-- 1) Saisir ou corriger un match. p_manches : [[11,7],[9,11],[11,5]] (score A, score B)
create or replace function saisir_match(
  p_competition uuid, p_tour text, p_type text, p_sets_gagnants integer,
  p_cote_a uuid[], p_cote_b uuid[], p_manches jsonb, p_match uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  c competitions;
  m matchs;
  v_id uuid := p_match;
  v_juge boolean;
  v_n integer := coalesce(p_sets_gagnants, 3);
  v_attendu integer := case when p_type = 'double' then 2 else 1 end;
  man jsonb; i integer := 0;
  a integer; b integer; sa integer := 0; sb integer := 0;
  j uuid;
begin
  select * into c from competitions where id = p_competition;
  if not found then raise exception 'Compétition introuvable.'; end if;
  v_juge := est_juge_de(p_competition);
  if not (est_cadre() or v_juge) then raise exception 'Tu n''es pas juge-arbitre de cette compétition.'; end if;
  if est_cadre() then
    if c.statut not in ('cloturee', 'terminee') then raise exception 'Les scores se saisissent une fois les inscriptions closes.'; end if;
  elsif c.statut <> 'cloturee' then
    raise exception 'La saisie des scores est fermée pour cette compétition.';
  end if;
  if p_type not in ('simple', 'double') then raise exception 'Type de match invalide.'; end if;
  if v_n not in (3, 4) then raise exception 'Le nombre de sets gagnants est 3 ou 4.'; end if;

  if coalesce(array_length(p_cote_a, 1), 0) <> v_attendu or coalesce(array_length(p_cote_b, 1), 0) <> v_attendu then
    raise exception 'Il faut % joueur(s) de chaque côté.', v_attendu;
  end if;
  if (select count(distinct x) from unnest(p_cote_a || p_cote_b) x) <> 2 * v_attendu then
    raise exception 'Un joueur ne peut pas apparaître deux fois.';
  end if;
  foreach j in array (p_cote_a || p_cote_b) loop
    if not exists (select 1 from inscription_participants ip join inscriptions ins on ins.id = ip.inscription_id
                    where ins.competition_id = p_competition and ins.statut = 'active' and ip.licencie_id = j) then
      raise exception 'Un des joueurs n''est pas inscrit à cette compétition.';
    end if;
  end loop;

  -- Contrôle des manches
  if jsonb_typeof(p_manches) <> 'array' or jsonb_array_length(p_manches) = 0 then
    raise exception 'Saisis le score des manches.';
  end if;
  for man in select * from jsonb_array_elements(p_manches) loop
    i := i + 1;
    a := (man->>0)::int; b := (man->>1)::int;
    if a is null or b is null or a < 0 or b < 0 then raise exception 'Manche %: score invalide.', i; end if;
    if greatest(a, b) < 11 or abs(a - b) < 2 or (greatest(a, b) > 11 and abs(a - b) <> 2) then
      raise exception 'Manche % (% - %) : une manche se gagne à 11 points avec 2 d''écart.', i, a, b;
    end if;
    if sa = v_n or sb = v_n then raise exception 'Manche %: le match était déjà terminé.', i; end if;
    if a > b then sa := sa + 1; else sb := sb + 1; end if;
  end loop;
  if sa <> v_n and sb <> v_n then
    raise exception 'Le match n''est pas terminé : il faut % manches gagnées (score actuel % - %).', v_n, sa, sb;
  end if;

  if v_id is null then
    insert into matchs (competition_id, tour, juge_id, statut, type_match, sets_gagnants)
    values (p_competition, nullif(trim(p_tour), ''), mon_licencie_id(), 'saisi', p_type, v_n) returning id into v_id;
  else
    select * into m from matchs where id = v_id and competition_id = p_competition;
    if not found then raise exception 'Match introuvable.'; end if;
    if m.statut = 'valide' then raise exception 'Ce match est validé : demande au cadre fédéral de l''invalider d''abord.'; end if;
    update matchs set tour = nullif(trim(p_tour), ''), type_match = p_type, sets_gagnants = v_n, statut = 'saisi',
           juge_id = coalesce(juge_id, mon_licencie_id()) where id = v_id;
    delete from participants_match where match_id = v_id;
    delete from manches where match_id = v_id;
  end if;

  foreach j in array p_cote_a loop
    insert into participants_match (match_id, licencie_id, cote, sets_gagnes) values (v_id, j, 'A', sa);
  end loop;
  foreach j in array p_cote_b loop
    insert into participants_match (match_id, licencie_id, cote, sets_gagnes) values (v_id, j, 'B', sb);
  end loop;
  i := 0;
  for man in select * from jsonb_array_elements(p_manches) loop
    i := i + 1;
    insert into manches (match_id, numero, score_a, score_b) values (v_id, i, (man->>0)::int, (man->>1)::int);
  end loop;
  return v_id;
end $$;

-- 2) Supprimer un match non validé
create or replace function supprimer_match(p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m matchs; c competitions;
begin
  select * into m from matchs where id = p_match;
  if not found then raise exception 'Match introuvable.'; end if;
  select * into c from competitions where id = m.competition_id;
  if not (est_cadre() or (est_juge_de(m.competition_id) and c.statut = 'cloturee')) then
    raise exception 'Suppression non autorisée.';
  end if;
  if m.statut = 'valide' then raise exception 'Match validé : invalide-le d''abord.'; end if;
  delete from matchs where id = p_match;
end $$;

-- 3) Rejeter un match saisi (renvoyé au juge pour correction) — cadre fédéral
create or replace function rejeter_match(p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not est_cadre() then raise exception 'Réservé au cadre fédéral'; end if;
  update matchs set statut = 'rejete' where id = p_match and statut = 'saisi';
  if not found then raise exception 'Seul un match saisi peut être rejeté.'; end if;
end $$;

-- 4) Valider les matchs saisis d'une compétition (tous, ou une liste) et calculer les points
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
    if m.type_match = 'simple' then
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

-- 5) Invalider un match validé (correction) : retire ses points et le repasse en « saisi »
create or replace function invalider_match(p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not est_cadre() then raise exception 'Réservé au cadre fédéral'; end if;
  perform set_config('app.recalcul', 'on', true);
  delete from mouvements_points where match_id = p_match;
  update participants_match set points_avant = null, ecart = null, points_bruts = null, points_finaux = null where match_id = p_match;
  update matchs set statut = 'saisi', valide_par = null, date_validation = null where id = p_match and statut = 'valide';
  if not found then raise exception 'Ce match n''est pas validé.'; end if;
  perform set_config('app.recalcul', 'off', true);
end $$;

-- 6) Plus d'écriture directe par les juges : uniquement via les fonctions
drop policy if exists matchs_ajout on matchs;
drop policy if exists matchs_maj on matchs;
drop policy if exists pmatch_ecriture on participants_match;
drop policy if exists manches_ecriture on manches;

revoke execute on function saisir_match(uuid, text, text, integer, uuid[], uuid[], jsonb, uuid) from public, anon;
revoke execute on function supprimer_match(uuid) from public, anon;
revoke execute on function rejeter_match(uuid) from public, anon;
revoke execute on function valider_matchs(uuid, uuid[]) from public, anon;
revoke execute on function invalider_match(uuid) from public, anon;
grant execute on function saisir_match(uuid, text, text, integer, uuid[], uuid[], jsonb, uuid) to authenticated;
grant execute on function supprimer_match(uuid) to authenticated;
grant execute on function rejeter_match(uuid) to authenticated;
grant execute on function valider_matchs(uuid, uuid[]) to authenticated;
grant execute on function invalider_match(uuid) to authenticated;
