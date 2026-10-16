-- =====================================================================
-- FTTT – Script 045 : le club invite les parents à s'inscrire à un stage (e-mail automatique)
-- À exécuter après 044. Une seule requête, rien d'autre dedans. Relançable.
-- - Le responsable de club (ou le cadre) choisit un stage ouvert et des jeunes de son club ; la fonction vérifie ses droits,
--   retrouve l'e-mail du représentant légal (ou du licencié s'il est majeur) et met l'invitation en file d'envoi.
-- - L'envoi est fait par la fonction Edge « envoyer-invitations-stage » (Brevo). Chaque invitation n'est envoyée qu'une fois.
-- - Le club n'inscrit personne : c'est le parent qui s'inscrit avec le lien.
-- =====================================================================
begin;

create table if not exists invitations_stage (
  id          uuid primary key default gen_random_uuid(),
  stage_id    uuid not null references stages(id) on delete cascade,
  licencie_id uuid not null references licencies(id) on delete cascade,
  club_id     uuid not null references clubs(id),
  email       text not null,
  destinataire text,
  statut      text not null default 'a_envoyer' check (statut in ('a_envoyer', 'envoi', 'envoyee', 'echec')),
  erreur      text,
  cree_par    uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  envoye_at   timestamptz
);
create index if not exists invitations_stage_stage_idx on invitations_stage (stage_id, licencie_id);
alter table invitations_stage enable row level security;
drop policy if exists invitations_stage_lecture on invitations_stage;
create policy invitations_stage_lecture on invitations_stage for select using (est_cadre() or est_responsable_de(club_id));
drop trigger if exists trg_journal on invitations_stage;
create trigger trg_journal after insert or update or delete on invitations_stage for each row execute function journaliser();

-- ---------- Liste des jeunes que le club peut inviter ----------
create or replace function invitables_stage(p_stage uuid, p_club uuid)
returns table (licencie_id uuid, prenom text, nom text, date_naissance date, mineur boolean, a_email boolean, invite_le timestamptz, deja_inscrit boolean)
language plpgsql stable security definer set search_path = public as $$
declare s stages;
begin
  if not (est_cadre() or est_responsable_de(p_club)) then raise exception 'Accès refusé.'; end if;
  select * into s from stages where id = p_stage;
  if not found then raise exception 'Stage introuvable.'; end if;
  return query
    select l.id, l.prenom, l.nom, l.date_naissance,
           l.date_naissance > (current_date - interval '18 years')::date,
           coalesce(nullif(trim(case when l.date_naissance > (current_date - interval '18 years')::date then l.representant_email else l.email end), ''), null) is not null,
           (select max(i.created_at) from invitations_stage i where i.stage_id = p_stage and i.licencie_id = l.id and i.statut <> 'echec'),
           exists (select 1 from inscriptions_stage x where x.stage_id = p_stage and x.statut <> 'annule'
                      and x.cle = _norm_texte(l.prenom || l.nom) || l.date_naissance::text)
      from licencies l
      join licences lc on lc.licencie_id = l.id and lc.club_id = p_club and lc.statut = 'active'
      join saisons sa on sa.id = lc.saison_id and s.date_debut between sa.date_debut and sa.date_fin
     where l.statut = 'actif'
     order by l.nom, l.prenom;
end $$;
revoke execute on function invitables_stage(uuid, uuid) from public;
grant execute on function invitables_stage(uuid, uuid) to authenticated;

-- ---------- Met les invitations en file d'envoi ----------
create or replace function inviter_stage(p_stage uuid, p_club uuid, p_licencies uuid[], p_renvoyer boolean default false)
returns json
language plpgsql security definer set search_path = public as $$
declare
  s stages; r record; v_email text; v_mineur boolean;
  v_file int := 0; v_sans text[] := '{}'; v_deja text[] := '{}'; v_inscrits text[] := '{}';
begin
  if not (est_cadre() or est_responsable_de(p_club)) then raise exception 'Accès refusé.'; end if;
  select * into s from stages where id = p_stage;
  if not found then raise exception 'Stage introuvable.'; end if;
  if s.statut <> 'ouvert' or s.date_fin < (now() at time zone 'Pacific/Tahiti')::date then
    raise exception 'Ce stage n''est pas ouvert aux inscriptions.';
  end if;
  if p_licencies is null or cardinality(p_licencies) = 0 then raise exception 'Choisis au moins un jeune.'; end if;
  if cardinality(p_licencies) > 200 then raise exception 'Trop de jeunes à la fois (200 au maximum).'; end if;

  for r in
    select l.id, l.prenom, l.nom, l.date_naissance, l.email, l.representant_nom, l.representant_email
      from licencies l
      join licences lc on lc.licencie_id = l.id and lc.club_id = p_club and lc.statut = 'active'
      join saisons sa on sa.id = lc.saison_id and s.date_debut between sa.date_debut and sa.date_fin
     where l.id = any (p_licencies) and l.statut = 'actif'
  loop
    v_mineur := r.date_naissance > (current_date - interval '18 years')::date;
    v_email := nullif(trim(case when v_mineur then r.representant_email else r.email end), '');
    if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' then
      v_sans := v_sans || (r.prenom || ' ' || r.nom); continue;
    end if;
    if exists (select 1 from inscriptions_stage x where x.stage_id = p_stage and x.statut <> 'annule'
                  and x.cle = _norm_texte(r.prenom || r.nom) || r.date_naissance::text) then
      v_inscrits := v_inscrits || (r.prenom || ' ' || r.nom); continue;
    end if;
    if not p_renvoyer and exists (select 1 from invitations_stage i where i.stage_id = p_stage and i.licencie_id = r.id and i.statut <> 'echec') then
      v_deja := v_deja || (r.prenom || ' ' || r.nom); continue;
    end if;
    insert into invitations_stage (stage_id, licencie_id, club_id, email, destinataire)
    values (p_stage, r.id, p_club, v_email, case when v_mineur then r.representant_nom end);
    v_file := v_file + 1;
  end loop;
  return json_build_object('en_file', v_file, 'sans_email', v_sans, 'deja_invites', v_deja, 'deja_inscrits', v_inscrits);
end $$;
revoke execute on function inviter_stage(uuid, uuid, uuid[], boolean) from public;
grant execute on function inviter_stage(uuid, uuid, uuid[], boolean) to authenticated;

select count(*) as invitations_stage from invitations_stage;
commit;
