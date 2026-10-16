-- =====================================================================
-- FTTT – Script 044 : un parent inscrit plusieurs enfants à plusieurs stages en une seule fois + suivi des pièces du 1er jour
-- À exécuter après 042 (043 n'est pas nécessaire : ce script contient aussi son contenu). Une seule requête, rien d'autre dedans. Relançable.
-- - Nouvelle fonction publique sinscrire_stages : une personne à contacter, 1 à 8 participants, 1 à 10 stages, un seul envoi.
-- - Le parent n'écrit rien à la main : fiche pré-remplie, il signe seulement. Certificat médical à remettre le 1er jour sauf licencié.
-- - Suivi par le cadre : fiche signée reçue, certificat médical reçu.
-- =====================================================================
begin;

alter table inscriptions_stage add column if not exists fiche_recue boolean not null default false;
alter table inscriptions_stage add column if not exists certificat_recu boolean not null default false;

-- ---------- Interne : inscrit une personne à un stage (ou la met en liste d'attente) ----------
create or replace function _stage_inscrire_une(
  s stages, p_prenom text, p_nom text, p_naissance date, p_sexe sexe_licencie,
  p_email text, p_telephone text, p_rep_nom text, p_rep_tel text, p_rep_email text,
  p_aut_parentale boolean, p_aut_photo boolean, p_mode text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_mineur boolean := p_naissance > (current_date - interval '18 years')::date;
  v_cle text := _norm_texte(p_prenom || p_nom) || p_naissance::text;
  v_saison uuid; v_licencie boolean := false; v_prises int; v_statut text; v_montant int; v_id uuid;
begin
  if exists (select 1 from inscriptions_stage where stage_id = s.id and cle = v_cle and statut <> 'annule') then
    return jsonb_build_object('stage_id', s.id, 'stage', s.nom, 'prenom', trim(p_prenom), 'nom', upper(trim(p_nom)), 'deja', true);
  end if;
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
          nullif(trim(p_rep_nom), ''), nullif(trim(p_rep_tel), ''), nullif(trim(p_rep_email), ''),
          coalesce(p_aut_parentale, false), coalesce(p_aut_photo, false),
          case when v_licencie then 'licencie' else 'non_licencie' end, v_montant, v_statut, p_mode, v_cle)
  returning id into v_id;
  if v_statut = 'inscrit' then perform _stage_confirmer(v_id); end if;
  return jsonb_build_object('stage_id', s.id, 'stage', s.nom, 'date_debut', s.date_debut, 'date_fin', s.date_fin,
                            'prenom', trim(p_prenom), 'nom', upper(trim(p_nom)), 'deja', false,
                            'statut', v_statut, 'montant_xpf', v_montant, 'tarif', case when v_licencie then 'licencie' else 'non_licencie' end);
end $$;
revoke all on function _stage_inscrire_une(stages, text, text, date, sexe_licencie, text, text, text, text, text, boolean, boolean, text) from public, anon, authenticated;

-- ---------- Inscription publique : plusieurs participants, plusieurs stages ----------
drop function if exists sinscrire_stage(uuid, text, text, date, sexe_licencie, text, text, text, text, text, boolean, boolean, text, text);

create or replace function sinscrire_stages(
  p_stages uuid[], p_participants jsonb,
  p_contact_nom text, p_contact_telephone text, p_contact_email text,
  p_autorisation_parentale boolean, p_autorisation_photo boolean,
  p_mode_paiement text, p_site text default null
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_stages uuid[]; s stages; v_lignes jsonb := '[]'::jsonb; v_ligne jsonb; p jsonb;
  v_naissance date; v_mineur boolean; v_un_mineur boolean := false; v_paiement jsonb; v_total int := 0; v_n int;
begin
  if coalesce(trim(p_site), '') <> '' then raise exception 'Inscription impossible.'; end if;
  if p_mode_paiement not in ('sur_place', 'virement') then raise exception 'Choisis un mode de règlement.'; end if;
  select array_agg(distinct x order by x) into v_stages from unnest(coalesce(p_stages, '{}')) as x;
  if v_stages is null or cardinality(v_stages) = 0 then raise exception 'Choisis au moins un stage.'; end if;
  if cardinality(v_stages) > 10 then raise exception 'Trop de stages sélectionnés.'; end if;
  if jsonb_typeof(p_participants) <> 'array' or jsonb_array_length(p_participants) = 0 then raise exception 'Ajoute au moins un participant.'; end if;
  if jsonb_array_length(p_participants) > 8 then raise exception 'Huit participants au maximum par inscription.'; end if;
  if coalesce(trim(p_contact_nom), '') = '' then raise exception 'Indique le nom de la personne à contacter.'; end if;
  if coalesce(trim(p_contact_telephone), '') = '' and coalesce(trim(p_contact_email), '') = '' then
    raise exception 'Indique un téléphone ou une adresse e-mail.';
  end if;
  if coalesce(trim(p_contact_email), '') <> '' and trim(p_contact_email) !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' then raise exception 'Adresse e-mail invalide.'; end if;

  -- Contrôle des participants
  for p in select * from jsonb_array_elements(p_participants) loop
    if coalesce(trim(p ->> 'prenom'), '') = '' or coalesce(trim(p ->> 'nom'), '') = '' then raise exception 'Le nom et le prénom de chaque participant sont obligatoires.'; end if;
    begin v_naissance := (p ->> 'naissance')::date; exception when others then v_naissance := null; end;
    if v_naissance is null or v_naissance > current_date or v_naissance < date '1900-01-01' then
      raise exception 'Date de naissance invalide pour %.', trim(p ->> 'prenom');
    end if;
    if (p ->> 'sexe') not in ('F', 'M') then raise exception 'Indique le sexe de %.', trim(p ->> 'prenom'); end if;
    if v_naissance > (current_date - interval '18 years')::date then v_un_mineur := true; end if;
  end loop;
  if v_un_mineur and not coalesce(p_autorisation_parentale, false) then raise exception 'L''autorisation parentale est obligatoire pour un mineur.'; end if;

  if (select count(*) from inscriptions_stage where created_at > now() - interval '10 minutes') >= 120 then
    raise exception 'Service momentanément indisponible (trop de demandes). Réessaie dans quelques minutes.';
  end if;

  -- Verrouille les stages dans un ordre fixe, puis inscrit chaque participant à chaque stage
  for s in select * from stages where id = any (v_stages) order by id for update loop
    if s.statut <> 'ouvert' or s.date_fin < (now() at time zone 'Pacific/Tahiti')::date then
      raise exception 'Les inscriptions au stage « % » ne sont pas ouvertes.', s.nom;
    end if;
  end loop;
  select count(*) into v_n from stages where id = any (v_stages);
  if v_n <> cardinality(v_stages) then raise exception 'Stage introuvable.'; end if;

  for s in select * from stages where id = any (v_stages) order by date_debut, id loop
    for p in select * from jsonb_array_elements(p_participants) loop
      v_naissance := (p ->> 'naissance')::date;
      v_mineur := v_naissance > (current_date - interval '18 years')::date;
      v_ligne := _stage_inscrire_une(
        s, p ->> 'prenom', p ->> 'nom', v_naissance, (p ->> 'sexe')::sexe_licencie,
        case when v_mineur then null else p_contact_email end,
        case when v_mineur then null else p_contact_telephone end,
        case when v_mineur then p_contact_nom end, case when v_mineur then p_contact_telephone end, case when v_mineur then p_contact_email end,
        case when v_mineur then p_autorisation_parentale else false end, p_autorisation_photo, p_mode_paiement);
      v_lignes := v_lignes || jsonb_build_array(v_ligne);
      if (v_ligne ->> 'statut') = 'inscrit' then v_total := v_total + (v_ligne ->> 'montant_xpf')::int; end if;
    end loop;
  end loop;

  begin
    select (valeur::jsonb) -> 'paiement' into v_paiement from parametres where cle = 'federation';
  exception when others then v_paiement := null;
  end;
  return json_build_object('lignes', v_lignes, 'total_xpf', v_total, 'mode_paiement', p_mode_paiement, 'paiement', coalesce(v_paiement, '[]'::jsonb));
end $$;
revoke execute on function sinscrire_stages(uuid[], jsonb, text, text, text, boolean, boolean, text, text) from public;
grant execute on function sinscrire_stages(uuid[], jsonb, text, text, text, boolean, boolean, text, text) to anon, authenticated;

select count(*) as inscriptions_stage from inscriptions_stage;
commit;
