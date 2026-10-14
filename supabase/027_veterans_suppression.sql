-- =====================================================================
-- FTTT – Script 027 : tableaux vétérans + suppression d'un événement entier
-- À exécuter après 026. Une seule requête, rien d'autre dedans. Relançable.
-- 1) Colonne categorie_min : « veteran » réserve le tableau aux vétérans (41 ans et plus, âge au 1er janvier)
-- 2) creer_tableaux accepte categorie_min
-- 3) supprimer_evenement : supprime tous les tableaux en brouillon du même événement
-- =====================================================================
begin;

alter table competitions add column if not exists categorie_min text;
alter table competitions drop constraint if exists competitions_categorie_min_check;
alter table competitions add constraint competitions_categorie_min_check check (categorie_min is null or categorie_min = 'veteran');

create or replace function _motif_genre_age(c competitions, l licencies) returns text
language sql stable set search_path = public as $$
  select case
    when c.categorie_min = 'veteran' and categorie_age(l.date_naissance, c.date_debut) <> 'veteran'
      then 'Tableau réservé aux vétérans'
    when c.categorie_max is not null
         and _rang_categorie(categorie_age(l.date_naissance, c.date_debut))
             > case c.categorie_max when 'U11' then 2 when 'U13' then 3 when 'U15' then 4 else 5 end
      then 'Trop âgé(e) pour ce tableau (' || c.categorie_max || ' et moins)'
    when c.genre = 'dames' and l.sexe::text <> 'F' then 'Tableau réservé aux dames'
    when c.genre = 'messieurs' and l.sexe::text <> 'M' then 'Tableau réservé aux messieurs'
    else null
  end
$$;
revoke execute on function _motif_genre_age(competitions, licencies) from public, anon, authenticated;

create or replace function creer_tableaux(p_modele uuid, p_tableaux jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare
  m competitions;
  t jsonb;
  v_evt uuid;
  v_new uuid;
  v_n integer := 0;
begin
  if not est_cadre() then raise exception 'Réservé au cadre fédéral.'; end if;
  select * into m from competitions where id = p_modele;
  if not found then raise exception 'Compétition modèle introuvable.'; end if;
  if jsonb_typeof(p_tableaux) <> 'array' or jsonb_array_length(p_tableaux) = 0 then
    raise exception 'Aucun tableau à créer.';
  end if;
  v_evt := coalesce(m.evenement_id, m.id);
  if m.evenement_id is null then update competitions set evenement_id = v_evt where id = m.id; end if;

  for t in select * from jsonb_array_elements(p_tableaux) loop
    if coalesce(trim(t->>'nom'), '') = '' then raise exception 'Chaque tableau doit avoir un nom.'; end if;
    insert into competitions (nom, saison_id, lieu, date_debut, date_fin, type, coefficient, montant_xpf,
                              date_limite_inscription, statut, ouverte_a_tous, evenement_id, genre, categorie_max, categorie_min)
    values (trim(t->>'nom'), m.saison_id, m.lieu, m.date_debut, m.date_fin,
            coalesce(nullif(t->>'type', ''), m.type::text)::type_competition, m.coefficient,
            coalesce((t->>'montant_xpf')::integer, m.montant_xpf), m.date_limite_inscription, 'brouillon', m.ouverte_a_tous, v_evt,
            coalesce(nullif(t->>'genre', ''), 'ouvert'), nullif(t->>'categorie_max', ''), nullif(t->>'categorie_min', ''))
    returning id into v_new;
    insert into competition_juges (competition_id, licencie_id)
      select v_new, licencie_id from competition_juges where competition_id = m.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke execute on function creer_tableaux(uuid, jsonb) from public, anon;
grant execute on function creer_tableaux(uuid, jsonb) to authenticated;

-- Supprime tous les tableaux en brouillon du même événement (ceux qui ont déjà été ouverts sont conservés)
create or replace function supprimer_evenement(p_competition uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare
  c competitions;
  v_n integer;
begin
  if not est_cadre() then raise exception 'Réservé au cadre fédéral.'; end if;
  select * into c from competitions where id = p_competition;
  if not found then raise exception 'Compétition introuvable.'; end if;
  if c.statut <> 'brouillon' then raise exception 'Seuls les brouillons se suppriment.'; end if;
  if c.evenement_id is null then
    delete from competitions where id = c.id;
    return 1;
  end if;
  delete from competitions where evenement_id = c.evenement_id and statut = 'brouillon';
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function supprimer_evenement(uuid) from public, anon;
grant execute on function supprimer_evenement(uuid) to authenticated;

select 'ok : ' || count(*) || ' compétitions' as controle from competitions;
commit;
