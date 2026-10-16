-- =====================================================================
-- FTTT – Script 042 : stages ouverts au public (inscription sans compte, licence événementielle, liste d'attente, facture acquittée)
-- À exécuter après 041. Une seule requête, rien d'autre dedans. Relançable.
-- - Une personne de l'extérieur s'inscrit sur la page publique « Stages » : une fiche et une licence événementielle (sans club) sont créées,
--   ou retrouvées si la personne existe déjà. Tarifs : 8 000 XPF licencié, 9 000 XPF non licencié (modifiables par stage).
-- - 45 places par défaut ; au-delà, liste d'attente validée par le cadre fédéral.
-- - Après le stage, la licence événementielle expire et la fiche est archivée (retrouvée à l'inscription suivante).
-- =====================================================================
begin;

-- Une licence événementielle n'a pas de club
alter table licences alter column club_id drop not null;

create table if not exists stages (
  id                uuid primary key default gen_random_uuid(),
  nom               text not null,
  date_debut        date not null,
  date_fin          date not null,
  lieu              text,
  tarif_licencie    integer not null default 8000 check (tarif_licencie >= 0),
  tarif_non_licencie integer not null default 9000 check (tarif_non_licencie >= 0),
  places_max        integer not null default 45 check (places_max > 0),
  statut            text not null default 'ouvert' check (statut in ('brouillon', 'ouvert', 'clos')),
  evenement_id      uuid references evenements_calendrier(id) on delete set null,
  created_at        timestamptz not null default now(),
  check (date_fin >= date_debut)
);
alter table stages enable row level security;
drop policy if exists stages_cadre on stages;
create policy stages_cadre on stages for all using (est_cadre()) with check (est_cadre());
drop trigger if exists trg_journal on stages;
create trigger trg_journal after insert or update or delete on stages for each row execute function journaliser();

create table if not exists inscriptions_stage (
  id                     uuid primary key default gen_random_uuid(),
  stage_id               uuid not null references stages(id) on delete cascade,
  licencie_id            uuid references licencies(id),
  prenom                 text not null,
  nom                    text not null,
  date_naissance         date not null,
  sexe                   sexe_licencie not null,
  email                  text,
  telephone              text,
  mineur                 boolean not null,
  representant_nom       text,
  representant_telephone text,
  representant_email     text,
  autorisation_parentale boolean not null default false,
  autorisation_photo     boolean not null default false,
  tarif                  text not null check (tarif in ('licencie', 'non_licencie')),
  montant_xpf            integer not null check (montant_xpf >= 0),
  statut                 text not null check (statut in ('inscrit', 'attente', 'annule')),
  mode_paiement          text check (mode_paiement in ('sur_place', 'virement')),
  paye                   boolean not null default false,
  date_paiement          date,
  numero_facture         text unique,
  cle                    text not null,
  created_at             timestamptz not null default now()
);
create index if not exists inscriptions_stage_stage on inscriptions_stage (stage_id, statut);
create unique index if not exists inscriptions_stage_unique on inscriptions_stage (stage_id, cle) where statut <> 'annule';
alter table inscriptions_stage enable row level security;
drop policy if exists inscriptions_stage_cadre on inscriptions_stage;
create policy inscriptions_stage_cadre on inscriptions_stage for all using (est_cadre()) with check (est_cadre());
drop trigger if exists trg_journal on inscriptions_stage;
create trigger trg_journal after insert or update or delete on inscriptions_stage for each row execute function journaliser();

-- Les stages déjà dans le calendrier (script 038) deviennent des stages ouverts aux inscriptions, en brouillon (à ouvrir par le cadre)
insert into stages (nom, date_debut, date_fin, lieu, statut, evenement_id)
select e.nom, e.date_debut, e.date_fin, e.lieu, 'brouillon', e.id
  from evenements_calendrier e
 where e.categorie = 'stage' and not e.annule and e.date_fin >= current_date
   and not exists (select 1 from stages s where s.evenement_id = e.id);

-- ---------- Lecture publique : stages ouverts et places restantes (aucune donnée personnelle) ----------
create or replace function stages_publics()
returns table (id uuid, nom text, date_debut date, date_fin date, lieu text, tarif_licencie integer, tarif_non_licencie integer,
               places_max integer, places_prises integer, en_attente integer, evenement_id uuid)
language sql stable security definer set search_path = public as $$
  select s.id, s.nom, s.date_debut, s.date_fin, s.lieu, s.tarif_licencie, s.tarif_non_licencie, s.places_max,
         (select count(*)::int from inscriptions_stage i where i.stage_id = s.id and i.statut = 'inscrit'),
         (select count(*)::int from inscriptions_stage i where i.stage_id = s.id and i.statut = 'attente'),
         s.evenement_id
    from stages s
   where s.statut = 'ouvert' and s.date_fin >= (now() at time zone 'Pacific/Tahiti')::date
   order by s.date_debut, s.nom
$$;
revoke execute on function stages_publics() from public;
grant execute on function stages_publics() to anon, authenticated;

-- ---------- Interne : crée ou retrouve la fiche, réactive si besoin, donne la licence événementielle ----------
create or replace function _stage_confirmer(p_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  i inscriptions_stage; s stages; l licencies;
  v_saison uuid; v_n int;
begin
  select * into i from inscriptions_stage where id = p_id;
  select * into s from stages where id = i.stage_id;
  select id into v_saison from saisons where s.date_debut between date_debut and date_fin limit 1;
  if v_saison is null then select id into v_saison from saisons order by date_debut desc limit 1; end if;
  if v_saison is null then raise exception 'Aucune saison n''est créée'; end if;

  select count(*) into v_n from licencies
   where _norm_texte(prenom || nom) = _norm_texte(i.prenom || i.nom) and date_naissance = i.date_naissance;
  if v_n > 0 then
    select * into l from licencies
     where _norm_texte(prenom || nom) = _norm_texte(i.prenom || i.nom) and date_naissance = i.date_naissance
     order by created_at limit 1;
    perform set_config('app.recalcul', 'on', true);
    update licencies set
        statut = 'actif', date_archivage = null,
        points = greatest(points, 500),
        email = coalesce(nullif(trim(email), ''), nullif(trim(i.email), '')),
        telephone = coalesce(nullif(trim(telephone), ''), nullif(trim(i.telephone), '')),
        representant_nom = coalesce(nullif(trim(representant_nom), ''), nullif(trim(i.representant_nom), '')),
        representant_telephone = coalesce(nullif(trim(representant_telephone), ''), nullif(trim(i.representant_telephone), '')),
        representant_email = coalesce(nullif(trim(representant_email), ''), nullif(trim(i.representant_email), ''))
     where id = l.id;
    perform set_config('app.recalcul', 'off', true);
  else
    insert into licencies (nom, prenom, date_naissance, sexe, club_id, email, telephone, handicap, statut,
                           representant_nom, representant_telephone, representant_email)
    values (upper(trim(i.nom)), trim(i.prenom), i.date_naissance, i.sexe, null, nullif(trim(i.email), ''), nullif(trim(i.telephone), ''), false, 'actif',
            nullif(trim(i.representant_nom), ''), nullif(trim(i.representant_telephone), ''), nullif(trim(i.representant_email), ''))
    returning * into l;
  end if;

  -- Licence événementielle seulement si la personne n'a pas déjà une licence cette saison
  if not exists (select 1 from licences where licencie_id = l.id and saison_id = v_saison) then
    insert into licences (licencie_id, saison_id, club_id, type, statut, photo_fournie)
    values (l.id, v_saison, null, 'evenementielle', 'active', i.autorisation_photo);
  else
    update licences set statut = 'active' where licencie_id = l.id and saison_id = v_saison and statut <> 'active' and type = 'evenementielle';
  end if;

  update inscriptions_stage set licencie_id = l.id where id = i.id;
  return l.id;
end $$;
revoke all on function _stage_confirmer(uuid) from public, anon, authenticated;

-- ---------- Inscription publique (sans compte) ----------
create or replace function sinscrire_stage(
  p_stage uuid, p_prenom text, p_nom text, p_naissance date, p_sexe sexe_licencie,
  p_email text, p_telephone text,
  p_representant_nom text, p_representant_telephone text, p_representant_email text,
  p_autorisation_parentale boolean, p_autorisation_photo boolean,
  p_mode_paiement text, p_site text default null
) returns json
language plpgsql security definer set search_path = public as $$
declare
  s stages; v_mineur boolean; v_cle text; v_licencie boolean := false; v_saison uuid; v_prises int;
  v_statut text; v_montant int; v_id uuid; v_paiement jsonb;
begin
  if coalesce(trim(p_site), '') <> '' then raise exception 'Inscription impossible.'; end if;
  select * into s from stages where id = p_stage for update;
  if s.id is null or s.statut <> 'ouvert' or s.date_fin < (now() at time zone 'Pacific/Tahiti')::date then
    raise exception 'Les inscriptions à ce stage ne sont pas ouvertes.';
  end if;
  if coalesce(trim(p_prenom), '') = '' or coalesce(trim(p_nom), '') = '' then raise exception 'Le nom et le prénom sont obligatoires.'; end if;
  if p_naissance is null or p_naissance > current_date or p_naissance < date '1900-01-01' then raise exception 'Date de naissance invalide.'; end if;
  if p_mode_paiement not in ('sur_place', 'virement') then raise exception 'Choisis un mode de règlement.'; end if;
  v_mineur := p_naissance > (current_date - interval '18 years')::date;
  if v_mineur then
    if coalesce(trim(p_representant_nom), '') = '' then raise exception 'Le nom du parent ou tuteur est obligatoire pour un mineur.'; end if;
    if coalesce(trim(p_representant_telephone), '') = '' and coalesce(trim(p_representant_email), '') = '' then
      raise exception 'Indique un téléphone ou une adresse e-mail du parent ou tuteur.';
    end if;
    if not coalesce(p_autorisation_parentale, false) then raise exception 'L''autorisation parentale est obligatoire pour un mineur.'; end if;
  elsif coalesce(trim(p_telephone), '') = '' and coalesce(trim(p_email), '') = '' then
    raise exception 'Indique un téléphone ou une adresse e-mail.';
  end if;
  if p_email is not null and trim(p_email) <> '' and trim(p_email) !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' then raise exception 'Adresse e-mail invalide.'; end if;
  if p_representant_email is not null and trim(p_representant_email) <> '' and trim(p_representant_email) !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' then
    raise exception 'Adresse e-mail du parent invalide.';
  end if;

  if (select count(*) from inscriptions_stage where created_at > now() - interval '10 minutes') >= 40 then
    raise exception 'Service momentanément indisponible (trop de demandes). Réessaie dans quelques minutes.';
  end if;
  v_cle := _norm_texte(p_prenom || p_nom) || p_naissance::text;
  if exists (select 1 from inscriptions_stage where stage_id = s.id and cle = v_cle and statut <> 'annule') then
    raise exception 'Cette personne est déjà inscrite à ce stage (ou sur la liste d''attente).';
  end if;

  -- Tarif licencié : licence de la saison autre qu'événementielle
  select id into v_saison from saisons where s.date_debut between date_debut and date_fin limit 1;
  select exists (
    select 1 from licencies l join licences lc on lc.licencie_id = l.id
     where _norm_texte(l.prenom || l.nom) = _norm_texte(p_prenom || p_nom) and l.date_naissance = p_naissance
       and lc.saison_id = v_saison and lc.statut = 'active' and lc.type <> 'evenementielle') into v_licencie;
  v_montant := case when v_licencie then s.tarif_licencie else s.tarif_non_licencie end;

  select count(*) into v_prises from inscriptions_stage where stage_id = s.id and statut = 'inscrit';
  v_statut := case when v_prises < s.places_max then 'inscrit' else 'attente' end;

  insert into inscriptions_stage (stage_id, prenom, nom, date_naissance, sexe, email, telephone, mineur,
                                  representant_nom, representant_telephone, representant_email,
                                  autorisation_parentale, autorisation_photo, tarif, montant_xpf, statut, mode_paiement, cle)
  values (s.id, trim(p_prenom), upper(trim(p_nom)), p_naissance, p_sexe, nullif(trim(p_email), ''), nullif(trim(p_telephone), ''), v_mineur,
          nullif(trim(p_representant_nom), ''), nullif(trim(p_representant_telephone), ''), nullif(trim(p_representant_email), ''),
          coalesce(p_autorisation_parentale, false), coalesce(p_autorisation_photo, false),
          case when v_licencie then 'licencie' else 'non_licencie' end, v_montant, v_statut, p_mode_paiement, v_cle)
  returning id into v_id;

  if v_statut = 'inscrit' then perform _stage_confirmer(v_id); end if;

  begin
    select (valeur::jsonb) -> 'paiement' into v_paiement from parametres where cle = 'federation';
  exception when others then v_paiement := null;
  end;
  return json_build_object('statut', v_statut, 'montant_xpf', v_montant, 'tarif', case when v_licencie then 'licencie' else 'non_licencie' end,
                           'mode_paiement', p_mode_paiement, 'stage', s.nom, 'paiement', coalesce(v_paiement, '[]'::jsonb));
end $$;
revoke execute on function sinscrire_stage(uuid, text, text, date, sexe_licencie, text, text, text, text, text, boolean, boolean, text, text) from public;
grant execute on function sinscrire_stage(uuid, text, text, date, sexe_licencie, text, text, text, text, text, boolean, boolean, text, text) to anon, authenticated;

-- ---------- Cadre fédéral : paiement, validation de la liste d'attente, annulation ----------
create or replace function stage_marquer_paye(p_id uuid, p_paye boolean, p_mode text default null, p_date date default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  i inscriptions_stage; s stages; v_annee int; v_n int; v_num text;
begin
  if not est_cadre() then raise exception 'Réservé au cadre fédéral'; end if;
  select * into i from inscriptions_stage where id = p_id for update;
  if i.id is null then raise exception 'Inscription introuvable'; end if;
  if i.statut <> 'inscrit' then raise exception 'Seule une inscription confirmée peut être payée.'; end if;
  select * into s from stages where id = i.stage_id;
  v_num := i.numero_facture;
  if p_paye and v_num is null then
    v_annee := extract(year from s.date_debut)::int;
    perform pg_advisory_xact_lock(4242);
    select coalesce(max(substr(numero_facture, length('FTTT-S-' || v_annee || '-') + 1)::int), 0) + 1 into v_n
      from inscriptions_stage where numero_facture like 'FTTT-S-' || v_annee || '-%';
    v_num := 'FTTT-S-' || v_annee || '-' || lpad(v_n::text, 4, '0');
  end if;
  update inscriptions_stage set
      paye = p_paye,
      date_paiement = case when p_paye then coalesce(p_date, (now() at time zone 'Pacific/Tahiti')::date) else null end,
      mode_paiement = coalesce(p_mode, mode_paiement),
      numero_facture = v_num
   where id = p_id;
  return v_num;
end $$;

create or replace function stage_changer_statut(p_id uuid, p_statut text) returns void
language plpgsql security definer set search_path = public as $$
declare
  i inscriptions_stage; s stages; v_prises int;
begin
  if not est_cadre() then raise exception 'Réservé au cadre fédéral'; end if;
  if p_statut not in ('inscrit', 'attente', 'annule') then raise exception 'Statut inconnu'; end if;
  select * into i from inscriptions_stage where id = p_id for update;
  if i.id is null then raise exception 'Inscription introuvable'; end if;
  select * into s from stages where id = i.stage_id for update;
  if p_statut = 'inscrit' and i.statut <> 'inscrit' then
    select count(*) into v_prises from inscriptions_stage where stage_id = s.id and statut = 'inscrit';
    if v_prises >= s.places_max then raise exception 'Le stage est complet (% places). Augmente le nombre de places ou annule une inscription.', s.places_max; end if;
    update inscriptions_stage set statut = 'inscrit' where id = p_id;
    perform _stage_confirmer(p_id);
  else
    update inscriptions_stage set statut = p_statut where id = p_id;
  end if;
end $$;
revoke all on function stage_marquer_paye(uuid, boolean, text, date) from public, anon;
revoke all on function stage_changer_statut(uuid, text) from public, anon;
grant execute on function stage_marquer_paye(uuid, boolean, text, date) to authenticated;
grant execute on function stage_changer_statut(uuid, text) to authenticated;

-- ---------- Après le stage : la licence événementielle expire et la fiche est archivée ----------
create or replace function archiver_stagiaires() returns json
language plpgsql security definer set search_path = public as $$
declare
  v_jour date := (now() at time zone 'Pacific/Tahiti')::date;
  v_expirees int; v_archives int;
begin
  update licences lc set statut = 'expiree'
   where lc.type = 'evenementielle' and lc.statut = 'active'
     and exists (select 1 from inscriptions_stage i join stages s on s.id = i.stage_id where i.licencie_id = lc.licencie_id and i.statut = 'inscrit')
     and not exists (select 1 from inscriptions_stage i join stages s on s.id = i.stage_id
                      where i.licencie_id = lc.licencie_id and i.statut = 'inscrit' and s.date_fin >= v_jour);
  get diagnostics v_expirees = row_count;
  update licencies l set statut = 'archive', date_archivage = v_jour
   where l.statut = 'actif'
     and exists (select 1 from inscriptions_stage i where i.licencie_id = l.id and i.statut = 'inscrit')
     and not exists (select 1 from licences lc where lc.licencie_id = l.id and lc.statut = 'active')
     and not exists (select 1 from inscriptions_stage i join stages s on s.id = i.stage_id
                      where i.licencie_id = l.id and i.statut = 'inscrit' and s.date_fin >= v_jour);
  get diagnostics v_archives = row_count;
  return json_build_object('licences_expirees', v_expirees, 'fiches_archivees', v_archives);
end $$;
revoke all on function archiver_stagiaires() from public, anon, authenticated;

-- Planification : tous les jours à 01 h 00 heure de Tahiti (= 11 h 00 UTC)
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('archivage-stagiaires', '0 11 * * *', 'select public.archiver_stagiaires()');
exception when others then
  raise notice 'pg_cron indisponible (%). Active l''extension pg_cron dans Database > Extensions puis relance ce script.', sqlerrm;
end $$;

select (select count(*) from stages) as stages, (select count(*) from stages where statut = 'brouillon') as stages_en_brouillon;
commit;
