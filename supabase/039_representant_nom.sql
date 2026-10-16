-- =====================================================================
-- FTTT – Script 039 : le représentant légal d'un mineur n'a plus besoin d'être licencié
-- À exécuter après 038. Une seule requête, rien d'autre dedans. Relançable.
-- On enregistre simplement le NOM du parent ou tuteur (texte libre). Le lien vers une fiche licenciée
-- (representant_legal_id) reste possible pour les fiches existantes, mais n'est plus demandé.
-- =====================================================================
begin;

alter table licencies add column if not exists representant_nom text;

-- Reprend le nom des représentants déjà liés à une fiche, pour ne rien perdre
update licencies m
   set representant_nom = trim(r.prenom || ' ' || r.nom)
  from licencies r
 where m.representant_legal_id = r.id
   and m.representant_nom is null;

-- Un mineur actif doit avoir un représentant : un nom (ou, pour les anciennes fiches, un lien)
create or replace function verif_representant() returns trigger
language plpgsql as $$
begin
  if new.statut = 'actif'
     and new.date_naissance > (current_date - interval '18 years')::date
     and new.representant_legal_id is null
     and nullif(trim(new.representant_nom), '') is null then
    if current_setting('app.import', true) = 'on'
       or (tg_op = 'UPDATE' and old.statut = 'actif' and old.representant_legal_id is null
           and nullif(trim(old.representant_nom), '') is null) then
      return new;
    end if;
    raise exception 'Le nom du représentant légal est obligatoire pour un licencié mineur actif';
  end if;
  return new;
end $$;

drop trigger if exists trg_verif_representant on licencies;
create trigger trg_verif_representant
  before insert or update of date_naissance, representant_legal_id, representant_nom, statut on licencies
  for each row execute function verif_representant();

-- Création d'un licencié : nouveau paramètre p_representant_nom (le lien p_representant reste accepté)
drop function if exists creer_licencie(text, text, date, sexe_licencie, uuid, text, text, boolean, uuid, uuid, type_licence, text, date, boolean, boolean, boolean);
create or replace function creer_licencie(
  p_nom text, p_prenom text, p_naissance date, p_sexe sexe_licencie, p_club uuid,
  p_email text, p_telephone text, p_handicap boolean, p_representant uuid,
  p_saison uuid, p_type type_licence,
  p_cert_type text default null, p_cert_date date default null,
  p_cert_fourni boolean default false, p_questionnaire boolean default false,
  p_photo boolean default false,
  p_representant_nom text default null
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
                         handicap, representant_legal_id, representant_nom, statut, date_archivage)
  values (v_nom, v_prenom, p_naissance, p_sexe, p_club, nullif(trim(p_email), ''),
          nullif(trim(p_telephone), ''), coalesce(p_handicap, false), p_representant,
          nullif(trim(p_representant_nom), ''), 'archive', current_date)
  returning id into v_id;

  perform prendre_licence(v_id, p_saison, p_club, p_type, p_cert_type, p_cert_date,
                          p_cert_fourni, p_questionnaire, p_photo);
  return v_id;
end $$;

revoke all on function creer_licencie(text, text, date, sexe_licencie, uuid, text, text, boolean, uuid, uuid, type_licence, text, date, boolean, boolean, boolean, text) from public, anon;
grant execute on function creer_licencie(text, text, date, sexe_licencie, uuid, text, text, boolean, uuid, uuid, type_licence, text, date, boolean, boolean, boolean, text) to authenticated;

select count(*) filter (where representant_nom is not null) as mineurs_avec_nom,
       count(*) filter (where representant_nom is null and statut = 'actif'
                        and date_naissance > (current_date - interval '18 years')::date) as mineurs_actifs_sans_representant
  from licencies;
commit;
