-- 014 : renouvellement des licences en masse (cadre fédéral)
-- Reçoit une liste de personnes à renouveler pour une saison. Chaque personne est
-- traitée séparément : une erreur sur l'une (ex. mineur sans représentant légal)
-- n'empêche pas les autres. Réutilise prendre_licence (réactivation, plancher 500).

create or replace function renouveler_licences(p_saison uuid, p_items jsonb)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_item   jsonb;
  v_ok     integer := 0;
  v_erreurs jsonb := '[]'::jsonb;
begin
  if not est_cadre() then
    raise exception 'Réservé au cadre fédéral';
  end if;
  if not exists (select 1 from saisons where id = p_saison) then
    raise exception 'Saison introuvable';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    begin
      perform prendre_licence(
        (v_item->>'licencie_id')::uuid,
        p_saison,
        (v_item->>'club_id')::uuid,
        (v_item->>'type')::type_licence,
        nullif(v_item->>'cert_type', ''),
        nullif(v_item->>'cert_date', '')::date,
        coalesce((v_item->>'cert_fourni')::boolean, false),
        coalesce((v_item->>'questionnaire')::boolean, false),
        coalesce((v_item->>'photo')::boolean, false)
      );
      v_ok := v_ok + 1;
    exception when others then
      v_erreurs := v_erreurs || jsonb_build_object(
        'licencie_id', v_item->>'licencie_id', 'message', sqlerrm);
    end;
  end loop;

  return json_build_object('renouveles', v_ok, 'erreurs', v_erreurs);
end $$;

revoke all on function renouveler_licences(uuid, jsonb) from public, anon;
grant execute on function renouveler_licences(uuid, jsonb) to authenticated;
