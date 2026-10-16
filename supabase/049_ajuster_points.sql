-- =====================================================================
-- FTTT – Script 49 : ajustement manuel des points (cadre fédéral)
-- Une seule requête, rien d'autre dedans.
--  - journal.motif : motif de l'ajustement, lisible dans la page Journal
--  - ajuster_points(licencié, nouveau total, motif) : réservé au cadre, motif obligatoire,
--    appliqué tout de suite sur la fiche ; le classement publié ne change qu'au « Relancer » du mois
-- =====================================================================

alter table journal add column if not exists motif text;

create or replace function ajuster_points(p_licencie uuid, p_points numeric, p_motif text)
returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_motif text := btrim(coalesce(p_motif, ''));
  v_avant numeric;
  v_id bigint;
begin
  if not est_cadre() then raise exception 'Réservé au cadre fédéral'; end if;
  if length(v_motif) < 3 then raise exception 'Le motif est obligatoire.'; end if;
  if p_points is null or p_points < 0 or p_points > 9999.9 then
    raise exception 'Points invalides (entre 0 et 9999,9).';
  end if;
  select points into v_avant from licencies where id = p_licencie for update;
  if not found then raise exception 'Licencié introuvable.'; end if;
  p_points := round(p_points, 1);
  if p_points = v_avant then raise exception 'Les points sont déjà de %.', v_avant; end if;

  perform set_config('app.recalcul', 'on', true);
  update licencies set points = p_points where id = p_licencie;
  perform set_config('app.recalcul', 'off', true);

  -- le déclencheur du journal vient d'écrire la ligne « avant → après » : on y joint le motif
  select max(id) into v_id from journal
   where table_name = 'licencies' and enregistrement_id = p_licencie::text and action = 'UPDATE';
  update journal set motif = v_motif where id = v_id;
  return p_points;
end $$;

revoke all on function ajuster_points(uuid, numeric, text) from public, anon;
grant execute on function ajuster_points(uuid, numeric, text) to authenticated;
