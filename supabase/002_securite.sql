-- =====================================================================
-- FTTT – Lot 1 / Script 2 : droits par rôle (RLS) et journal
-- À exécuter après 001_schema.sql.
-- =====================================================================

-- ---------- Fonctions d'identité et de droits ----------
create function mon_licencie_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from licencies where user_id = auth.uid()
$$;

create function est_cadre() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from attributions_roles ar
    join licencies l on l.id = ar.licencie_id
    where l.user_id = auth.uid() and ar.role = 'cadre_federal')
$$;

create function est_responsable_de(p_club uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_club is not null and exists (
    select 1 from attributions_roles ar
    join licencies l on l.id = ar.licencie_id
    where l.user_id = auth.uid() and ar.role = 'responsable_club' and ar.club_id = p_club)
$$;

create function est_juge_de(p_comp uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from competition_juges cj
    join licencies l on l.id = cj.licencie_id
    where l.user_id = auth.uid() and cj.competition_id = p_comp)
$$;

create function competition_ouverte(p_comp uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from competitions c
    where c.id = p_comp and c.statut = 'ouverte'
      and (c.date_limite_inscription is null or current_date <= c.date_limite_inscription))
$$;

-- Le juge-arbitre saisit pendant la compétition (inscriptions clôturées, pas encore terminée)
create function juge_peut_saisir(p_comp uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select est_juge_de(p_comp)
     and exists (select 1 from competitions c where c.id = p_comp and c.statut = 'cloturee')
$$;

create function juge_voit_licencie(p_lic uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from inscription_participants ip
    join inscriptions i on i.id = ip.inscription_id
    where ip.licencie_id = p_lic and est_juge_de(i.competition_id))
$$;

create function peut_voir_inscription(p_insc uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select est_cadre()
    or exists (select 1 from inscriptions i
               where i.id = p_insc and (est_responsable_de(i.club_id) or est_juge_de(i.competition_id)))
    or exists (select 1 from inscription_participants ip
               where ip.inscription_id = p_insc and ip.licencie_id = mon_licencie_id())
$$;

create function peut_gerer_inscription(p_insc uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select est_cadre()
    or exists (select 1 from inscriptions i
               where i.id = p_insc and est_responsable_de(i.club_id) and competition_ouverte(i.competition_id))
$$;

-- Un licencié ne voit un match que s'il est validé ; le juge voit les matchs de ses compétitions
create function peut_voir_match(p_match uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select est_cadre()
    or exists (select 1 from matchs m where m.id = p_match and est_juge_de(m.competition_id))
    or exists (select 1 from matchs m
               join participants_match pm on pm.match_id = m.id
               join licencies l on l.id = pm.licencie_id
               where m.id = p_match and m.statut = 'valide'
                 and (l.id = mon_licencie_id() or est_responsable_de(l.club_id)))
$$;

create function peut_ecrire_match(p_match uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select est_cadre()
    or exists (select 1 from matchs m
               where m.id = p_match and m.statut in ('saisi', 'rejete') and juge_peut_saisir(m.competition_id))
$$;

-- ---------- Journal automatique ----------
create function journaliser() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into journal (user_id, table_name, enregistrement_id, action, avant, apres)
  values (
    auth.uid(), tg_table_name,
    coalesce(to_jsonb(new) ->> 'id', to_jsonb(old) ->> 'id'),
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'clubs','saisons','licencies','licences','attributions_roles','competitions',
    'competition_juges','inscriptions','inscription_participants','factures','matchs',
    'participants_match','manches','bareme','mouvements_points','classements_mensuels']
  loop
    execute format('create trigger trg_journal after insert or update or delete on %I
                    for each row execute function journaliser()', t);
  end loop;
end $$;

-- Le journal est en ajout seul : personne ne peut le modifier ni l'effacer
revoke update, delete, truncate on journal from public, anon, authenticated;

-- ---------- Garde-fous sur les données ----------
-- Mineur : représentant légal obligatoire
create function verif_representant() returns trigger
language plpgsql as $$
begin
  if new.date_naissance > (current_date - interval '18 years')::date
     and new.representant_legal_id is null then
    raise exception 'Un représentant légal est obligatoire pour un licencié mineur';
  end if;
  return new;
end $$;

create trigger trg_verif_representant
  before insert or update of date_naissance, representant_legal_id on licencies
  for each row execute function verif_representant();

-- Points : modifiables uniquement par la fonction de recalcul (qui pose app.recalcul = 'on').
-- Non-cadre : seuls e-mail et téléphone sont modifiables sur sa propre fiche.
create function protege_licencie() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or current_setting('app.recalcul', true) = 'on' then
    return new;
  end if;
  if new.points is distinct from old.points then
    raise exception 'Les points ne se modifient que par le recalcul';
  end if;
  if not est_cadre()
     and (to_jsonb(new) - 'email' - 'telephone') is distinct from (to_jsonb(old) - 'email' - 'telephone') then
    raise exception 'Seuls l''e-mail et le téléphone sont modifiables';
  end if;
  return new;
end $$;

create trigger trg_protege_licencie
  before update on licencies
  for each row execute function protege_licencie();

-- Calculs de points sur un match : jamais saisis à la main
create function protege_points_match() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or current_setting('app.recalcul', true) = 'on' then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' and (new.points_avant is not null or new.ecart is not null
      or new.points_bruts is not null or new.points_finaux is not null) then
    raise exception 'Les points d''un match sont calculés à la validation';
  end if;
  if tg_op = 'UPDATE' and (new.points_avant, new.ecart, new.points_bruts, new.points_finaux)
      is distinct from (old.points_avant, old.ecart, old.points_bruts, old.points_finaux) then
    raise exception 'Les points d''un match sont calculés à la validation';
  end if;
  return new;
end $$;

create trigger trg_protege_points_match
  before insert or update on participants_match
  for each row execute function protege_points_match();

-- ---------- Activation de la sécurité ligne par ligne ----------
do $$
declare t text;
begin
  foreach t in array array[
    'clubs','saisons','licencies','licences','attributions_roles','competitions',
    'competition_juges','inscriptions','inscription_participants','factures','matchs',
    'participants_match','manches','bareme','mouvements_points','classements_mensuels','journal']
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- Aucun accès sans compte (l'affichage public passera par des vues dédiées, lot 6)
revoke all on all tables in schema public from anon;

-- ---------- Politiques d'accès ----------
-- Clubs
create policy clubs_cadre on clubs for all using (est_cadre()) with check (est_cadre());
create policy clubs_lecture on clubs for select to authenticated
  using (est_responsable_de(id) or id = (select club_id from licencies where user_id = auth.uid()));

-- Saisons et barème : lisibles par tout compte connecté, modifiables par le cadre
create policy saisons_cadre on saisons for all using (est_cadre()) with check (est_cadre());
create policy saisons_lecture on saisons for select to authenticated using (true);
create policy bareme_cadre on bareme for all using (est_cadre()) with check (est_cadre());
create policy bareme_lecture on bareme for select to authenticated using (true);

-- Licenciés
create policy licencies_cadre on licencies for all using (est_cadre()) with check (est_cadre());
create policy licencies_lecture on licencies for select to authenticated
  using (user_id = auth.uid()
      or est_responsable_de(club_id)
      or representant_legal_id = mon_licencie_id()
      or juge_voit_licencie(id));
create policy licencies_maj_perso on licencies for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Licences et rôles
create policy licences_cadre on licences for all using (est_cadre()) with check (est_cadre());
create policy licences_lecture on licences for select to authenticated
  using (licencie_id = mon_licencie_id() or est_responsable_de(club_id));
create policy roles_cadre on attributions_roles for all using (est_cadre()) with check (est_cadre());
create policy roles_lecture on attributions_roles for select to authenticated
  using (licencie_id = mon_licencie_id());

-- Compétitions et juges affectés
create policy competitions_cadre on competitions for all using (est_cadre()) with check (est_cadre());
create policy competitions_lecture on competitions for select to authenticated
  using (statut <> 'brouillon');
create policy juges_cadre on competition_juges for all using (est_cadre()) with check (est_cadre());
create policy juges_lecture on competition_juges for select to authenticated
  using (licencie_id = mon_licencie_id());

-- Inscriptions : le responsable de club agit sur son club, compétition ouverte uniquement
create policy inscriptions_cadre on inscriptions for all using (est_cadre()) with check (est_cadre());
create policy inscriptions_lecture on inscriptions for select to authenticated
  using (peut_voir_inscription(id));
create policy inscriptions_ajout on inscriptions for insert to authenticated
  with check (est_responsable_de(club_id) and competition_ouverte(competition_id));
create policy inscriptions_maj on inscriptions for update to authenticated
  using (peut_gerer_inscription(id))
  with check (est_responsable_de(club_id) and competition_ouverte(competition_id));

create policy participants_cadre on inscription_participants for all
  using (est_cadre()) with check (est_cadre());
create policy participants_lecture on inscription_participants for select to authenticated
  using (peut_voir_inscription(inscription_id));
create policy participants_ajout on inscription_participants for insert to authenticated
  with check (peut_gerer_inscription(inscription_id));
create policy participants_maj on inscription_participants for update to authenticated
  using (peut_gerer_inscription(inscription_id)) with check (peut_gerer_inscription(inscription_id));
create policy participants_suppr on inscription_participants for delete to authenticated
  using (peut_gerer_inscription(inscription_id));

-- Factures : lecture par le responsable du club concerné, création/modification par le cadre
create policy factures_cadre on factures for all using (est_cadre()) with check (est_cadre());
create policy factures_lecture on factures for select to authenticated
  using (est_responsable_de(club_id));

-- Matchs : saisie par le juge (statut 'saisi'), validation par le cadre
create policy matchs_cadre on matchs for all using (est_cadre()) with check (est_cadre());
create policy matchs_lecture on matchs for select to authenticated using (peut_voir_match(id));
create policy matchs_ajout on matchs for insert to authenticated
  with check (juge_peut_saisir(competition_id) and statut = 'saisi');
create policy matchs_maj on matchs for update to authenticated
  using (statut in ('saisi', 'rejete') and juge_peut_saisir(competition_id))
  with check (statut = 'saisi' and juge_peut_saisir(competition_id));

create policy pmatch_cadre on participants_match for all using (est_cadre()) with check (est_cadre());
create policy pmatch_lecture on participants_match for select to authenticated
  using (peut_voir_match(match_id));
create policy pmatch_ecriture on participants_match for all to authenticated
  using (peut_ecrire_match(match_id)) with check (peut_ecrire_match(match_id));

create policy manches_cadre on manches for all using (est_cadre()) with check (est_cadre());
create policy manches_lecture on manches for select to authenticated using (peut_voir_match(match_id));
create policy manches_ecriture on manches for all to authenticated
  using (peut_ecrire_match(match_id)) with check (peut_ecrire_match(match_id));

-- Points et classements : lecture seule (écriture réservée aux fonctions de recalcul)
create policy mouvements_lecture on mouvements_points for select to authenticated
  using (est_cadre() or licencie_id = mon_licencie_id()
         or exists (select 1 from licencies l where l.id = licencie_id and est_responsable_de(l.club_id)));
create policy classements_lecture on classements_mensuels for select to authenticated
  using (est_cadre() or licencie_id = mon_licencie_id()
         or exists (select 1 from licencies l where l.id = licencie_id and est_responsable_de(l.club_id)));

-- Journal : lisible par le cadre fédéral seul
create policy journal_lecture on journal for select to authenticated using (est_cadre());
