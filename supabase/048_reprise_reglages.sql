-- 048 : « Reprendre une saison » et « Ajouter des tableaux » recopient aussi
--       les points maximum et les réglages « Qui peut inscrire ? ».
begin;

create or replace function reprendre_competitions(p_competitions uuid[], p_saison uuid, p_decalage integer) returns integer
language plpgsql security definer set search_path = public as $$
declare
  c competitions;
  v_new uuid;
  v_evt uuid;
  v_map jsonb := '{}'::jsonb;
  v_n integer := 0;
begin
  if not est_cadre() then raise exception 'Réservé au cadre fédéral.'; end if;
  if coalesce(array_length(p_competitions, 1), 0) = 0 then raise exception 'Choisis au moins une compétition.'; end if;
  if not exists (select 1 from saisons where id = p_saison) then raise exception 'Saison introuvable.'; end if;

  for c in select * from competitions where id = any(p_competitions) order by date_debut, nom loop
    v_evt := null;
    if c.evenement_id is not null then
      if v_map ? c.evenement_id::text then
        v_evt := (v_map ->> c.evenement_id::text)::uuid;
      else
        v_evt := gen_random_uuid();
        v_map := v_map || jsonb_build_object(c.evenement_id::text, v_evt);
      end if;
    end if;
    insert into competitions (nom, saison_id, lieu, date_debut, date_fin, type, coefficient, montant_xpf,
                              date_limite_inscription, statut, ouverte_a_tous, evenement_id, genre, categorie_max, categorie_min,
                              nb_simples, nb_doubles, points_max, inscription_federation, inscription_athletes)
    values (c.nom, p_saison, c.lieu, c.date_debut + p_decalage, c.date_fin + p_decalage, c.type, c.coefficient, c.montant_xpf,
            c.date_limite_inscription + p_decalage, 'brouillon', c.ouverte_a_tous, v_evt, c.genre, c.categorie_max, c.categorie_min,
            c.nb_simples, c.nb_doubles, c.points_max, c.inscription_federation, c.inscription_athletes)
    returning id into v_new;
    insert into tours_competition (competition_id, nom, date_tour)
      select v_new, t.nom, t.date_tour + p_decalage from tours_competition t where t.competition_id = c.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke execute on function reprendre_competitions(uuid[], uuid, integer) from public, anon;
grant execute on function reprendre_competitions(uuid[], uuid, integer) to authenticated;

-- Les tableaux ajoutés à un événement reprennent aussi « Qui peut inscrire ? » du modèle
do $$
declare v_def text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'creer_tableaux' order by p.oid desc limit 1;
  if v_def is null or position('inscription_athletes' in v_def) > 0 then return; end if;
  v_new := regexp_replace(v_def, 'points_max,\s*inscription_federation\)', 'points_max, inscription_federation, inscription_athletes)');
  v_new := regexp_replace(v_new, 'm\.inscription_federation\)', 'm.inscription_federation, m.inscription_athletes)');
  if v_new <> v_def and position('m.inscription_athletes' in v_new) > 0 then
    execute v_new;
  else
    raise notice 'creer_tableaux : point d''insertion introuvable, fonction laissée telle quelle.';
  end if;
end $$;

select 'ok : ' || count(*) || ' compétitions' as controle from competitions;
commit;
