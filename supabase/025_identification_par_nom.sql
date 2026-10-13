-- =====================================================================
-- FTTT – Script 025 : l'athlète peut s'identifier avec prénom + nom + date de naissance
-- À exécuter après 024. Une seule requête, rien d'autre dedans. Relançable.
-- - Le n° de licence reste possible (et sert en cas d'homonymes).
-- - Accents, majuscules, tirets et ordre prénom/nom sont ignorés.
-- - Le partenaire d'un double peut être désigné par son n° de licence OU son nom.
-- =====================================================================
begin;

create or replace function _norm_texte(t text) returns text
language sql immutable as $$
  select regexp_replace(lower(translate(coalesce(t, ''),
    'àâäáãåçéèêëíìîïñóòôöõúùûüýÿÀÂÄÁÃÅÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝ',
    'aaaaaaceeeeiiiinooooouuuuyyAAAAAACEEEEIIIINOOOOOUUUUY')), '[^a-z0-9]', '', 'g')
$$;

-- Trouve une fiche par n° de licence (FTTT-…) ou par « prénom nom » ; null si introuvable ou ambiguë
create or replace function _trouver_par_numero_ou_nom(p_texte text, p_naissance date default null) returns licencies
language plpgsql security definer set search_path = public as $$
declare
  r licencies; v_n int; v_cle text := _norm_texte(p_texte);
begin
  if upper(trim(coalesce(p_texte, ''))) like 'FTTT-%' then
    select * into r from licencies where numero_licence = upper(trim(p_texte))
      and (p_naissance is null or date_naissance = p_naissance);
    return r;
  end if;
  if length(v_cle) < 3 then return null; end if;
  select count(*) into v_n from licencies
   where (_norm_texte(prenom || nom) = v_cle or _norm_texte(nom || prenom) = v_cle)
     and (p_naissance is null or date_naissance = p_naissance);
  if v_n <> 1 then return null; end if;
  select * into r from licencies
   where (_norm_texte(prenom || nom) = v_cle or _norm_texte(nom || prenom) = v_cle)
     and (p_naissance is null or date_naissance = p_naissance);
  return r;
end $$;
revoke execute on function _trouver_par_numero_ou_nom(text, date) from public, anon, authenticated;

-- Identification : p_numero peut contenir un n° de licence ou « prénom nom »
create or replace function _athlete(p_numero text, p_naissance date) returns licencies
language plpgsql security definer set search_path = public as $$
declare
  l licencies;
  v_cle text := case when upper(trim(coalesce(p_numero, ''))) like 'FTTT-%' then upper(trim(p_numero)) else _norm_texte(p_numero) end;
begin
  delete from athlete_echecs where at < now() - interval '1 day';
  if (select count(*) from athlete_echecs where at > now() - interval '10 minutes') >= 40 then
    raise exception 'Service momentanément indisponible (trop de tentatives). Réessaie dans quelques minutes.';
  end if;
  if (select count(*) from athlete_echecs where numero = v_cle and at > now() - interval '15 minutes') >= 5 then
    raise exception 'Trop de tentatives pour cette identité. Réessaie dans 15 minutes.';
  end if;
  l := _trouver_par_numero_ou_nom(p_numero, p_naissance);
  if l.id is null then
    insert into athlete_echecs (numero) values (v_cle);
    return null;
  end if;
  return l;
end $$;

create or replace function athlete_proposer_double(p_numero text, p_naissance date, p_competition uuid, p_partenaire text) returns json
language plpgsql security definer set search_path = public as $$
declare
  l licencies; pa licencies; c competitions; v_motif text;
begin
  l := _athlete(p_numero, p_naissance);
  if l.id is null then return json_build_object('erreur', 'Numéro de licence ou date de naissance incorrect.'); end if;
  select * into c from competitions where id = p_competition;
  if not found or c.type <> 'double' then raise exception 'Cette compétition n''est pas un double.'; end if;
  if not competition_ouverte(c.id) then raise exception 'Les inscriptions sont fermées pour cette compétition.'; end if;
  v_motif := _motif_indisponible(c, l);
  if v_motif is not null then raise exception '%', v_motif; end if;
  pa := _trouver_par_numero_ou_nom(p_partenaire);
  if pa.id is null then raise exception 'Partenaire introuvable : vérifie le numéro de licence ou l''orthographe du nom.'; end if;
  if pa.id = l.id then raise exception 'Choisis un autre joueur comme partenaire.'; end if;
  v_motif := _motif_indisponible(c, pa);
  if v_motif is not null then raise exception '% % : %', pa.prenom, pa.nom, lower(v_motif); end if;
  update propositions_double set statut = 'annulee'
   where competition_id = c.id and proposant_id = l.id and statut = 'en_attente';
  insert into propositions_double (competition_id, proposant_id, partenaire_id) values (c.id, l.id, pa.id);
  return json_build_object('ok', true, 'partenaire', pa.prenom || ' ' || pa.nom, 'club', (select nom from clubs where id = pa.club_id));
end $$;

select 'ok : ' || (select count(*) from licencies where _norm_texte(prenom || nom) <> '') || ' fiches identifiables par le nom' as controle;
commit;
