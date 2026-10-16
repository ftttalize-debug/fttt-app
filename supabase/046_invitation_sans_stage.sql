-- =====================================================================
-- FTTT – Script 046 : l'invitation du club ne vise plus un stage précis (le parent choisit sur la page des stages)
-- À exécuter après 045. Une seule requête, rien d'autre dedans. Relançable.
-- - Le club coche des jeunes ; l'e-mail annonce tous les stages ouverts et renvoie vers la page des stages.
-- - Un jeune déjà invité au cours des 30 derniers jours n'est pas invité une seconde fois (sauf renvoi voulu).
-- =====================================================================
begin;

alter table invitations_stage alter column stage_id drop not null;

drop function if exists invitables_stage(uuid, uuid);
drop function if exists inviter_stage(uuid, uuid, uuid[], boolean);

-- ---------- Liste des jeunes du club ----------
create or replace function invitables_stage(p_club uuid)
returns table (licencie_id uuid, prenom text, nom text, date_naissance date, mineur boolean, a_email boolean, invite_le timestamptz, deja_inscrit boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (est_cadre() or est_responsable_de(p_club)) then raise exception 'Accès refusé.'; end if;
  return query
    select l.id, l.prenom, l.nom, l.date_naissance,
           l.date_naissance > (current_date - interval '18 years')::date,
           nullif(trim(case when l.date_naissance > (current_date - interval '18 years')::date then l.representant_email else l.email end), '') is not null,
           (select max(i.created_at) from invitations_stage i where i.licencie_id = l.id and i.statut <> 'echec'),
           exists (select 1 from inscriptions_stage x join stages st on st.id = x.stage_id
                    where st.date_fin >= (now() at time zone 'Pacific/Tahiti')::date and x.statut <> 'annule'
                      and x.cle = _norm_texte(l.prenom || l.nom) || l.date_naissance::text)
      from licencies l
      join licences lc on lc.licencie_id = l.id and lc.club_id = p_club and lc.statut = 'active'
      join saisons sa on sa.id = lc.saison_id and sa.date_fin >= current_date
     where l.statut = 'actif'
     order by l.nom, l.prenom;
end $$;
revoke execute on function invitables_stage(uuid) from public;
grant execute on function invitables_stage(uuid) to authenticated;

-- ---------- Met les invitations en file d'envoi ----------
create or replace function inviter_stage(p_club uuid, p_licencies uuid[], p_renvoyer boolean default false)
returns json
language plpgsql security definer set search_path = public as $$
declare
  r record; v_email text; v_mineur boolean;
  v_file int := 0; v_sans text[] := '{}'; v_deja text[] := '{}';
begin
  if not (est_cadre() or est_responsable_de(p_club)) then raise exception 'Accès refusé.'; end if;
  if not exists (select 1 from stages where statut = 'ouvert' and date_fin >= (now() at time zone 'Pacific/Tahiti')::date) then
    raise exception 'Aucun stage n''est ouvert aux inscriptions pour le moment.';
  end if;
  if p_licencies is null or cardinality(p_licencies) = 0 then raise exception 'Choisis au moins un jeune.'; end if;
  if cardinality(p_licencies) > 200 then raise exception 'Trop de jeunes à la fois (200 au maximum).'; end if;

  for r in
    select distinct l.id, l.prenom, l.nom, l.date_naissance, l.email, l.representant_nom, l.representant_email
      from licencies l
      join licences lc on lc.licencie_id = l.id and lc.club_id = p_club and lc.statut = 'active'
      join saisons sa on sa.id = lc.saison_id and sa.date_fin >= current_date
     where l.id = any (p_licencies) and l.statut = 'actif'
  loop
    v_mineur := r.date_naissance > (current_date - interval '18 years')::date;
    v_email := nullif(trim(case when v_mineur then r.representant_email else r.email end), '');
    if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' then
      v_sans := v_sans || (r.prenom || ' ' || r.nom); continue;
    end if;
    if not p_renvoyer and exists (select 1 from invitations_stage i where i.licencie_id = r.id and i.statut <> 'echec' and i.created_at > now() - interval '30 days') then
      v_deja := v_deja || (r.prenom || ' ' || r.nom); continue;
    end if;
    insert into invitations_stage (stage_id, licencie_id, club_id, email, destinataire)
    values (null, r.id, p_club, v_email, case when v_mineur then r.representant_nom end);
    v_file := v_file + 1;
  end loop;
  return json_build_object('en_file', v_file, 'sans_email', v_sans, 'deja_invites', v_deja);
end $$;
revoke execute on function inviter_stage(uuid, uuid[], boolean) from public;
grant execute on function inviter_stage(uuid, uuid[], boolean) to authenticated;

select count(*) as invitations_stage from invitations_stage;
commit;
