-- 017 : passage automatique à la nouvelle saison le 1er juillet (heure de Tahiti)
-- Ce que fait le 1er juillet : crée la saison qui commence ce jour-là si elle n'existe pas, archive les licenciés
-- actifs sans licence pour cette saison, remonte à 500 points ceux qui sont en dessous.
-- La clôture du dernier mois (juin) reste à faire par le cadre fédéral.
-- Le bouton manuel « Passer à la nouvelle saison » (page Points) continue de fonctionner.

create or replace function passer_saison_auto(p_date date default null) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_jour date := coalesce(p_date, (now() at time zone 'Pacific/Tahiti')::date);
  v_saison uuid;
  v_cree boolean := false;
  v_archives integer;
  v_remontes integer;
begin
  if extract(month from v_jour) <> 7 or extract(day from v_jour) <> 1 then
    return json_build_object('execute', false, 'raison', 'Pas le 1er juillet');
  end if;

  select id into v_saison from saisons where v_jour between date_debut and date_fin limit 1;
  if v_saison is null then
    insert into saisons (libelle, date_debut, date_fin)
    values (extract(year from v_jour)::int || '-' || (extract(year from v_jour)::int + 1),
            v_jour, make_date(extract(year from v_jour)::int + 1, 6, 30))
    returning id into v_saison;
    v_cree := true;
  end if;

  perform set_config('app.recalcul', 'on', true);
  update licencies l set statut = 'archive', date_archivage = v_jour
   where l.statut = 'actif'
     and not exists (select 1 from licences lc where lc.licencie_id = l.id and lc.saison_id = v_saison and lc.statut = 'active');
  get diagnostics v_archives = row_count;
  update licencies set points = 500 where points < 500;
  get diagnostics v_remontes = row_count;
  perform set_config('app.recalcul', 'off', true);
  return json_build_object('execute', true, 'saison_creee', v_cree, 'archives', v_archives, 'remontes', v_remontes);
end $$;

revoke all on function passer_saison_auto(date) from public, anon, authenticated;

-- Planification : tous les 1er juillet à 00 h 05 heure de Tahiti (= 10 h 05 UTC)
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('passage-saison', '5 10 1 7 *', 'select public.passer_saison_auto()');
exception when others then
  raise notice 'pg_cron indisponible (%). Active l''extension pg_cron dans Database > Extensions puis relance ce script.', sqlerrm;
end $$;
