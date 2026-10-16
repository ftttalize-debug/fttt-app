-- 047 : le juge-arbitre gère ses compétitions
--   · crée des compétitions (en brouillon, coefficient fixé par la fédération) et en devient juge
--   · ouvre / clôture les inscriptions (pas « terminée », réservé au cadre)
--   · inscrit et désinscrit les clubs sur ses compétitions
--   · choisit les autres juges de ses compétitions
-- Il ne voit ni factures ni paiements, ni téléphone / e-mail / représentant légal des licenciés.
-- Seul le cadre fédéral donne le rôle « juge-arbitre » (page Comptes) ; ce rôle ouvre le droit de créer des compétitions.
-- Script rejouable sans risque.
begin;

-- ---------- 1) Outils de droits ----------
-- Qui a déjà été désigné juge sur une compétition reçoit le rôle (pour ne rien perdre)
insert into attributions_roles (licencie_id, role)
select distinct cj.licencie_id, 'juge_arbitre'::role_app from competition_juges cj
 where not exists (select 1 from attributions_roles r where r.licencie_id = cj.licencie_id and r.role = 'juge_arbitre');

create or replace function est_juge_arbitre() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from attributions_roles ar
    join licencies l on l.id = ar.licencie_id
    where l.user_id = auth.uid() and ar.role = 'juge_arbitre')
$$;

create or replace function a_role_juge_arbitre(p_lic uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from attributions_roles r where r.licencie_id = p_lic and r.role = 'juge_arbitre')
$$;

-- Auteur d'une compétition (un juge ne supprime que les brouillons qu'il a créés)
alter table competitions add column if not exists created_by uuid references licencies(id) on delete set null;

-- Le juge ne lit plus la fiche complète des licenciés (contacts, représentant) : il passe par annuaire_juge().
create or replace function juge_voit_licencie(p_lic uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select false
$$;

-- ---------- 2) Annuaire restreint pour le juge (aucune donnée de contact) ----------
create or replace function annuaire_juge() returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not (est_juge_arbitre() or est_cadre()) then return json '{"licencies":[],"licences":[]}'; end if;
  return json_build_object(
    'licencies', coalesce((select json_agg(json_build_object(
        'id', l.id, 'nom', l.nom, 'prenom', l.prenom, 'date_naissance', l.date_naissance, 'sexe', l.sexe,
        'club_id', l.club_id, 'points', l.points, 'statut', l.statut,
        'juge_arbitre', exists (select 1 from attributions_roles r where r.licencie_id = l.id and r.role = 'juge_arbitre'))) from licencies l), '[]'::json),
    'licences', coalesce((select json_agg(json_build_object(
        'id', x.id, 'licencie_id', x.licencie_id, 'saison_id', x.saison_id, 'club_id', x.club_id,
        'type', x.type, 'statut', x.statut)) from licences x), '[]'::json));
end $$;
revoke execute on function annuaire_juge() from public, anon;
grant execute on function annuaire_juge() to authenticated;

-- ---------- 3) Compétitions : lecture, modification, suppression du brouillon par ses juges ----------
drop policy if exists competitions_juge_lecture on competitions;
create policy competitions_juge_lecture on competitions for select to authenticated using (est_juge_de(id));
drop policy if exists competitions_juge_maj on competitions;
create policy competitions_juge_maj on competitions for update to authenticated
  using (est_juge_de(id) and statut <> 'terminee')
  with check (est_juge_de(id) and statut <> 'terminee');
drop policy if exists competitions_juge_suppr on competitions;
create policy competitions_juge_suppr on competitions for delete to authenticated
  using (est_juge_de(id) and statut = 'brouillon' and created_by is not null and created_by = mon_licencie_id());

-- Un juge ne peut pas déclarer une compétition terminée (réservé à la fédération)
create or replace function verrou_competition_juge() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not est_cadre() then
    if new.statut = 'terminee' and old.statut is distinct from 'terminee' then
      raise exception 'Seule la fédération peut déclarer une compétition terminée.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_verrou_competition_juge on competitions;
create trigger trg_verrou_competition_juge before update on competitions
  for each row execute function verrou_competition_juge();

-- ---------- 4) Création par un juge-arbitre ----------
create or replace function creer_competition_juge(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  r competitions;
  v_moi uuid := mon_licencie_id();
begin
  if not (est_cadre() or est_juge_arbitre()) then
    raise exception 'Réservé aux juges-arbitres et à la fédération.';
  end if;
  r := jsonb_populate_record(null::competitions, p - 'id' - 'statut' - 'created_at' - 'evenement_id' - 'created_by');
  r.id := gen_random_uuid();
  r.statut := 'brouillon';
  r.created_at := now();
  r.evenement_id := null;
  r.coefficient := coalesce((p->>'coefficient')::numeric, 1.00);
  r.created_by := v_moi;
  r.montant_xpf := coalesce(r.montant_xpf, 0);
  r.ouverte_a_tous := coalesce(r.ouverte_a_tous, false);
  r.genre := coalesce(r.genre, 'ouvert');
  r.inscription_federation := coalesce(r.inscription_federation, false);
  r.inscription_athletes := coalesce(r.inscription_athletes, true);
  insert into competitions select r.*;
  if not est_cadre() and v_moi is not null then
    insert into competition_juges (competition_id, licencie_id) values (r.id, v_moi);
  end if;
  return r.id;
end $$;
revoke execute on function creer_competition_juge(jsonb) from public, anon;
grant execute on function creer_competition_juge(jsonb) to authenticated;

-- ---------- 5) Choix des juges par les juges de la compétition ----------
drop policy if exists juges_juge_lecture on competition_juges;
create policy juges_juge_lecture on competition_juges for select to authenticated using (est_juge_de(competition_id));
drop policy if exists juges_juge_ajout on competition_juges;
create policy juges_juge_ajout on competition_juges for insert to authenticated
  with check (est_juge_de(competition_id) and a_role_juge_arbitre(licencie_id));
drop policy if exists juges_juge_suppr on competition_juges;
create policy juges_juge_suppr on competition_juges for delete to authenticated using (est_juge_de(competition_id));

-- Un juge ne peut pas retirer le dernier juge (la compétition n'aurait plus personne pour la gérer)
create or replace function garde_dernier_juge() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not est_cadre()
     and exists (select 1 from competitions where id = old.competition_id)
     and not exists (select 1 from competition_juges where competition_id = old.competition_id and id <> old.id) then
    raise exception 'Une compétition doit garder au moins un juge-arbitre.';
  end if;
  return old;
end $$;
drop trigger if exists trg_garde_dernier_juge on competition_juges;
create trigger trg_garde_dernier_juge before delete on competition_juges
  for each row execute function garde_dernier_juge();

-- ---------- 6) Inscriptions : le juge agit comme la fédération sur ses compétitions ----------
do $$
declare
  v_def text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'enregistrer_inscription';
  if position('est_juge_de' in v_def) = 0 then
    v_new := replace(v_def, 'if not (est_cadre() or est_responsable_de(p_club)) then',
                            'if not (est_cadre() or est_juge_de(p_competition) or est_responsable_de(p_club)) then');
    if v_new = v_def then raise exception 'enregistrer_inscription : point 1 introuvable'; end if;
    v_def := v_new;
    v_new := replace(v_def, E'if est_cadre() then\n    if c.statut not in', E'if est_cadre() or est_juge_de(p_competition) then\n    if c.statut not in');
    if v_new = v_def then raise exception 'enregistrer_inscription : point 2 introuvable'; end if;
    execute v_new;
  end if;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'annuler_inscription';
  if position('est_juge_de' in v_def) = 0 then
    v_new := replace(v_def, 'if not (est_cadre() or est_responsable_de(i.club_id)) then',
                            'if not (est_cadre() or est_juge_de(i.competition_id) or est_responsable_de(i.club_id)) then');
    if v_new = v_def then raise exception 'annuler_inscription : point 1 introuvable'; end if;
    v_def := v_new;
    v_new := replace(v_def, E'if est_cadre() then\n    if c.statut = ''terminee''', E'if est_cadre() or est_juge_de(c.id) then\n    if c.statut = ''terminee''');
    if v_new = v_def then raise exception 'annuler_inscription : point 2 introuvable'; end if;
    execute v_new;
  end if;
end $$;

create or replace function retirer_joueur_equipe(p_inscription uuid, p_licencie uuid) returns void
language plpgsql security definer set search_path = public as $$
declare ins inscriptions;
begin
  select * into ins from inscriptions where id = p_inscription and type = 'equipe';
  if not found then raise exception 'Équipe introuvable.'; end if;
  if not (est_cadre() or est_juge_de(ins.competition_id)) then raise exception 'Réservé au cadre fédéral et aux juges-arbitres.'; end if;
  if exists (select 1 from participants_match pm join matchs m on m.id = pm.match_id
              where m.competition_id = ins.competition_id and pm.licencie_id = p_licencie) then
    raise exception 'Ce joueur a déjà un match dans cette compétition : supprime ses matchs d''abord.';
  end if;
  delete from composition_rencontre where inscription_id = p_inscription and licencie_id = p_licencie;
  delete from inscription_participants where inscription_id = p_inscription and licencie_id = p_licencie;
end $$;

-- ---------- 7) Ouvrir / clôturer (jamais « terminée » pour un juge) ----------
create or replace function changer_statut_evenement(p_competition uuid, p_statut statut_competition) returns integer
language plpgsql security definer set search_path = public as $$
declare
  c competitions;
  v_n integer;
begin
  select * into c from competitions where id = p_competition;
  if not found then raise exception 'Compétition introuvable.'; end if;
  if not (est_cadre() or est_juge_de(p_competition)) then raise exception 'Réservé au cadre fédéral et aux juges-arbitres.'; end if;
  if not est_cadre() and (p_statut = 'terminee' or c.statut = 'terminee') then
    raise exception 'Seule la fédération peut terminer une compétition ou la rouvrir.';
  end if;
  if c.evenement_id is null then
    update competitions set statut = p_statut where id = c.id;
    return 1;
  end if;
  update competitions set statut = p_statut
   where evenement_id = c.evenement_id and statut = c.statut and (est_cadre() or est_juge_de(id));
  get diagnostics v_n = row_count;
  return v_n;
end $$;

select 'ok : ' || count(*) || ' compétitions' as controle from competitions;
commit;
