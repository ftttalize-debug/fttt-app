-- =====================================================================
-- FTTT – Lot 2 / Script 7 : fonctions pour l'interface (licences et fiches)
-- À exécuter après 006. Une seule requête, rien d'autre dedans.
-- Réservé au cadre fédéral. Chaque fonction est « tout ou rien » : si une
-- règle est violée (représentant légal manquant pour un mineur, doublon…),
-- rien n'est enregistré.
-- =====================================================================

-- 1) Prendre (ou renouveler) une licence pour une saison.
--    Pour la saison en cours : le licencié redevient actif, son club est mis à jour,
--    et s'il a moins de 500 points il est remonté à 500 (plancher à la réactivation).
create or replace function prendre_licence(
  p_licencie uuid,
  p_saison   uuid,
  p_club     uuid,
  p_type     type_licence,
  p_cert_type text    default null,
  p_cert_date date    default null,
  p_cert_fourni boolean default false,
  p_questionnaire boolean default false,
  p_photo    boolean  default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id       uuid;
  v_courante uuid;
begin
  if not est_cadre() then
    raise exception 'Réservé au cadre fédéral';
  end if;
  if not exists (select 1 from licencies where id = p_licencie) then
    raise exception 'Licencié introuvable';
  end if;

  insert into licences (licencie_id, saison_id, club_id, type, statut,
                        certificat_type, certificat_date, certificat_fourni,
                        questionnaire_fourni, photo_fournie)
  values (p_licencie, p_saison, p_club, p_type, 'active',
          p_cert_type, p_cert_date, coalesce(p_cert_fourni, false),
          coalesce(p_questionnaire, false), coalesce(p_photo, false))
  on conflict (licencie_id, saison_id) do update
    set club_id = excluded.club_id,
        type = excluded.type,
        statut = 'active',
        certificat_type = excluded.certificat_type,
        certificat_date = excluded.certificat_date,
        certificat_fourni = excluded.certificat_fourni,
        questionnaire_fourni = excluded.questionnaire_fourni,
        photo_fournie = excluded.photo_fournie
  returning id into v_id;

  select id into v_courante from saisons where current_date between date_debut and date_fin limit 1;

  if p_saison = v_courante then
    perform set_config('app.recalcul', 'on', true);          -- autorise la remise à 500
    update licencies
       set statut = 'actif', date_archivage = null, club_id = p_club,
           points = greatest(points, 500)
     where id = p_licencie;
    perform set_config('app.recalcul', 'off', true);
  end if;

  return v_id;
end $$;

-- 2) Créer un licencié et sa licence en une seule opération.
create or replace function creer_licencie(
  p_nom text, p_prenom text, p_naissance date, p_sexe sexe_licencie, p_club uuid,
  p_email text, p_telephone text, p_handicap boolean, p_representant uuid,
  p_saison uuid, p_type type_licence,
  p_cert_type text default null, p_cert_date date default null,
  p_cert_fourni boolean default false, p_questionnaire boolean default false,
  p_photo boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_nom text := upper(trim(p_nom));
  v_prenom text := trim(p_prenom);
begin
  if not est_cadre() then
    raise exception 'Réservé au cadre fédéral';
  end if;
  if v_nom = '' or v_prenom = '' then
    raise exception 'Le nom et le prénom sont obligatoires';
  end if;
  if exists (select 1 from licencies
             where upper(nom) = v_nom and lower(prenom) = lower(v_prenom)
               and date_naissance = p_naissance) then
    raise exception 'Une fiche existe déjà pour % % né(e) le % : réactive-la au lieu d''en créer une nouvelle',
                    v_prenom, v_nom, to_char(p_naissance, 'DD/MM/YYYY');
  end if;

  insert into licencies (nom, prenom, date_naissance, sexe, club_id, email, telephone,
                         handicap, representant_legal_id, statut, date_archivage)
  values (v_nom, v_prenom, p_naissance, p_sexe, p_club, nullif(trim(p_email), ''),
          nullif(trim(p_telephone), ''), coalesce(p_handicap, false), p_representant,
          'archive', current_date)
  returning id into v_id;

  perform prendre_licence(v_id, p_saison, p_club, p_type, p_cert_type, p_cert_date,
                          p_cert_fourni, p_questionnaire, p_photo);
  return v_id;
end $$;

-- Seuls les comptes connectés peuvent appeler ces fonctions (et la vérification « cadre » est dedans)
revoke all on function prendre_licence(uuid, uuid, uuid, type_licence, text, date, boolean, boolean, boolean) from public, anon;
revoke all on function creer_licencie(text, text, date, sexe_licencie, uuid, text, text, boolean, uuid, uuid, type_licence, text, date, boolean, boolean, boolean) from public, anon;
grant execute on function prendre_licence(uuid, uuid, uuid, type_licence, text, date, boolean, boolean, boolean) to authenticated;
grant execute on function creer_licencie(text, text, date, sexe_licencie, uuid, text, text, boolean, uuid, uuid, type_licence, text, date, boolean, boolean, boolean) to authenticated;
