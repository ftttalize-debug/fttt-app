-- 013 : rattachement d'un compte (connexion) à une fiche de licencié
-- La personne crée son compte sur le site avec l'e-mail inscrit sur sa fiche,
-- confirme par le lien reçu, puis la fiche est reliée automatiquement.
-- Règles : e-mail confirmé, une seule fiche correspondante, personne majeure,
-- fiche pas déjà reliée à un autre compte.

create or replace function lier_mon_compte() returns json
language plpgsql security definer set search_path = public, auth as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_conf  timestamptz;
  v_ids   uuid[];
begin
  if v_uid is null then
    raise exception 'Connexion requise';
  end if;

  if exists (select 1 from licencies where user_id = v_uid) then
    return json_build_object('lie', true);
  end if;

  select lower(trim(email)), email_confirmed_at into v_email, v_conf
  from auth.users where id = v_uid;

  if v_email is null or v_conf is null then
    return json_build_object('lie', false, 'raison', 'email_non_confirme');
  end if;

  select array_agg(id) into v_ids
  from licencies
  where lower(trim(email)) = v_email
    and user_id is null
    and date_naissance <= current_date - interval '18 years';

  if v_ids is null then
    return json_build_object('lie', false, 'raison', 'aucune_fiche');
  end if;
  if array_length(v_ids, 1) > 1 then
    return json_build_object('lie', false, 'raison', 'ambigu');
  end if;

  perform set_config('app.recalcul', 'on', true);
  update licencies set user_id = v_uid where id = v_ids[1];
  return json_build_object('lie', true);
end $$;

revoke all on function lier_mon_compte() from public, anon;
grant execute on function lier_mon_compte() to authenticated;

-- Le cadre fédéral peut détacher un compte d'une fiche (jamais le sien)
create or replace function delier_compte(p_licencie uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not est_cadre() then
    raise exception 'Réservé au cadre fédéral';
  end if;
  if exists (select 1 from licencies where id = p_licencie and user_id = auth.uid()) then
    raise exception 'Tu ne peux pas détacher ton propre compte';
  end if;
  perform set_config('app.recalcul', 'on', true);
  update licencies set user_id = null where id = p_licencie;
end $$;

revoke all on function delier_compte(uuid) from public, anon;
grant execute on function delier_compte(uuid) to authenticated;
