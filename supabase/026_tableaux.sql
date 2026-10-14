-- =====================================================================
-- FTTT – Script 026 : tableaux d'une même compétition (lot A)
-- À exécuter après 025. Une seule requête, rien d'autre dedans. Relançable.
-- Un « tableau » (U19 messieurs, double mixte…) est une compétition à part entière,
-- regroupée avec ses sœurs par evenement_id : inscriptions, factures, scores et points restent inchangés.
-- 1) genre (ouvert / dames / messieurs / mixte / uni) et catégorie maximale (U11, U13, U15, U19) par tableau
-- 2) contrôle automatique de l'âge et du genre (clubs et athlètes) ; surclassement permis, jamais l'inverse
-- 3) doubles : mixte = une fille + un garçon ; uni = deux filles ou deux garçons
-- 4) création de plusieurs tableaux d'un coup, ouverture/clôture de tous les tableaux d'un événement
-- =====================================================================
begin;
select set_config('app.recalcul', 'on', true);

-- ---------- 1) Colonnes ----------
alter table competitions add column if not exists evenement_id uuid;
alter table competitions add column if not exists genre text not null default 'ouvert';
alter table competitions add column if not exists categorie_max text;
alter table competitions drop constraint if exists competitions_genre_check;
alter table competitions add constraint competitions_genre_check check (genre in ('ouvert', 'dames', 'messieurs', 'mixte', 'uni'));
alter table competitions drop constraint if exists competitions_categorie_max_check;
alter table competitions add constraint competitions_categorie_max_check check (categorie_max is null or categorie_max in ('U11', 'U13', 'U15', 'U19'));
create index if not exists competitions_evenement_idx on competitions (evenement_id);

-- ---------- 2) Contrôle âge + genre pour une personne ----------
create or replace function _rang_categorie(p_cat text) returns int
language sql immutable as $$
  select case p_cat when 'poussin' then 1 when 'benjamin' then 2 when 'minime' then 3 when 'cadet' then 4 when 'junior' then 5 else 9 end
$$;

create or replace function _motif_genre_age(c competitions, l licencies) returns text
language sql stable set search_path = public as $$
  select case
    when c.categorie_max is not null
         and _rang_categorie(categorie_age(l.date_naissance, c.date_debut))
             > case c.categorie_max when 'U11' then 2 when 'U13' then 3 when 'U15' then 4 else 5 end
      then 'Trop âgé(e) pour ce tableau (' || c.categorie_max || ' et moins)'
    when c.genre = 'dames' and l.sexe::text <> 'F' then 'Tableau réservé aux dames'
    when c.genre = 'messieurs' and l.sexe::text <> 'M' then 'Tableau réservé aux messieurs'
    else null
  end
$$;
revoke execute on function _rang_categorie(text), _motif_genre_age(competitions, licencies) from public, anon, authenticated;

-- Motif d'incompatibilité entre deux partenaires de double (null = possible)
create or replace function _motif_paire(c competitions, a licencies, b licencies) returns text
language sql stable set search_path = public as $$
  select case
    when c.genre = 'mixte' and a.sexe = b.sexe then 'Un double mixte réunit une fille et un garçon'
    when c.genre = 'uni' and a.sexe <> b.sexe then 'Un double uni réunit deux filles ou deux garçons'
    else null
  end
$$;
revoke execute on function _motif_paire(competitions, licencies, licencies) from public, anon, authenticated;

-- ---------- 3) Contrôle d'une inscription par un club (âge, genre, paire) ----------
create or replace function _controle_inscription(
  p_comp competitions, p_club uuid, p_joueurs uuid[], p_exclure uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_n int := coalesce(array_length(p_joueurs, 1), 0);
  r record;
  v_motif text;
  v_f int; v_m int;
begin
  if v_n = 0 then raise exception 'Choisis au moins un joueur.'; end if;
  if (select count(distinct x) from unnest(p_joueurs) x) <> v_n then
    raise exception 'Un joueur est choisi deux fois.';
  end if;
  if p_comp.type = 'double' and v_n <> 2 then
    raise exception 'Un double comporte exactement 2 joueurs.';
  end if;
  if p_comp.type = 'equipe' and v_n < 2 then
    raise exception 'Une équipe comporte au moins 2 joueurs.';
  end if;

  for r in
    select l.id, l.nom, l.prenom, l.club_id, l.statut, l.sexe, l.date_naissance,
           (select lc.type from licences lc
             where lc.licencie_id = l.id and lc.saison_id = p_comp.saison_id and lc.statut = 'active') as type_licence
      from licencies l where l.id = any(p_joueurs)
  loop
    if r.club_id is distinct from p_club then
      raise exception '% % n''appartient pas à ce club.', r.prenom, r.nom;
    end if;
    if r.statut <> 'actif' then
      raise exception '% % n''est pas licencié(e) cette saison.', r.prenom, r.nom;
    end if;
    if r.type_licence is null then
      raise exception '% % n''a pas de licence pour la saison de cette compétition.', r.prenom, r.nom;
    end if;
    if not p_comp.ouverte_a_tous and r.type_licence <> 'competition' then
      raise exception '% % n''a pas une licence compétition.', r.prenom, r.nom;
    end if;
    v_motif := _motif_genre_age(p_comp, (select l2 from licencies l2 where l2.id = r.id));
    if v_motif is not null then
      raise exception '% % : %', r.prenom, r.nom, lower(v_motif);
    end if;
    if exists (select 1 from inscription_participants ip
                 join inscriptions i on i.id = ip.inscription_id
                where i.competition_id = p_comp.id and i.statut = 'active'
                  and ip.licencie_id = r.id and i.id is distinct from p_exclure) then
      raise exception '% % est déjà inscrit(e) à cette compétition.', r.prenom, r.nom;
    end if;
  end loop;

  if p_comp.type = 'double' and p_comp.genre in ('mixte', 'uni') then
    select count(*) filter (where sexe = 'F'), count(*) filter (where sexe = 'M') into v_f, v_m
      from licencies where id = any(p_joueurs);
    if p_comp.genre = 'mixte' and not (v_f = 1 and v_m = 1) then
      raise exception 'Un double mixte réunit une fille et un garçon.';
    end if;
    if p_comp.genre = 'uni' and v_f = 1 and v_m = 1 then
      raise exception 'Un double uni réunit deux filles ou deux garçons.';
    end if;
  end if;
end $$;
revoke execute on function _controle_inscription(competitions, uuid, uuid[], uuid) from public, anon, authenticated;

-- ---------- 4) Disponibilité d'un athlète (page « Je m'inscris ») ----------
create or replace function _motif_indisponible(c competitions, l licencies) returns text
language sql stable security definer set search_path = public as $$
  select case
    when l.statut <> 'actif' then 'Licence non active cette saison'
    when l.club_id is null then 'Aucun club'
    when not exists (select 1 from licences lc where lc.licencie_id = l.id and lc.saison_id = c.saison_id and lc.statut = 'active')
      then 'Pas de licence pour la saison de cette compétition'
    when not c.ouverte_a_tous and not exists (select 1 from licences lc where lc.licencie_id = l.id and lc.saison_id = c.saison_id
                                                and lc.statut = 'active' and lc.type = 'competition')
      then 'Licence compétition requise'
    when _motif_genre_age(c, l) is not null then _motif_genre_age(c, l)
    when exists (select 1 from inscription_participants ip join inscriptions i on i.id = ip.inscription_id
                  where i.competition_id = c.id and i.statut = 'active' and ip.licencie_id = l.id)
      then 'Déjà inscrit(e)'
    else null
  end
$$;
revoke execute on function _motif_indisponible(competitions, licencies) from public, anon, authenticated;

-- Proposition de double : vérifie aussi le genre de la paire
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
  v_motif := _motif_paire(c, l, pa);
  if v_motif is not null then raise exception '%', v_motif; end if;
  update propositions_double set statut = 'annulee'
   where competition_id = c.id and proposant_id = l.id and statut = 'en_attente';
  insert into propositions_double (competition_id, proposant_id, partenaire_id) values (c.id, l.id, pa.id);
  return json_build_object('ok', true, 'partenaire', pa.prenom || ' ' || pa.nom, 'club', (select nom from clubs where id = pa.club_id));
end $$;
revoke execute on function athlete_proposer_double(text, date, uuid, text) from public;
grant execute on function athlete_proposer_double(text, date, uuid, text) to anon, authenticated;

-- ---------- 5) Créer plusieurs tableaux à partir d'une compétition modèle ----------
-- p_tableaux : [{"nom": "...", "type": "simple|double|equipe", "genre": "...", "categorie_max": "U15" ou null, "montant_xpf": 1000}, ...]
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
                              date_limite_inscription, statut, ouverte_a_tous, evenement_id, genre, categorie_max)
    values (trim(t->>'nom'), m.saison_id, m.lieu, m.date_debut, m.date_fin,
            coalesce(nullif(t->>'type', ''), m.type::text)::type_competition, m.coefficient,
            coalesce((t->>'montant_xpf')::integer, m.montant_xpf), m.date_limite_inscription, 'brouillon', m.ouverte_a_tous, v_evt,
            coalesce(nullif(t->>'genre', ''), 'ouvert'), nullif(t->>'categorie_max', ''))
    returning id into v_new;
    insert into competition_juges (competition_id, licencie_id)
      select v_new, licencie_id from competition_juges where competition_id = m.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke execute on function creer_tableaux(uuid, jsonb) from public, anon;
grant execute on function creer_tableaux(uuid, jsonb) to authenticated;

-- ---------- 6) Ouvrir / clôturer tous les tableaux d'un événement ----------
-- Change le statut des tableaux qui ont le même statut que celui choisi (les autres ne bougent pas).
create or replace function changer_statut_evenement(p_competition uuid, p_statut statut_competition) returns integer
language plpgsql security definer set search_path = public as $$
declare
  c competitions;
  v_n integer;
begin
  if not est_cadre() then raise exception 'Réservé au cadre fédéral.'; end if;
  select * into c from competitions where id = p_competition;
  if not found then raise exception 'Compétition introuvable.'; end if;
  if c.evenement_id is null then
    update competitions set statut = p_statut where id = c.id;
    return 1;
  end if;
  update competitions set statut = p_statut where evenement_id = c.evenement_id and statut = c.statut;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function changer_statut_evenement(uuid, statut_competition) from public, anon;
grant execute on function changer_statut_evenement(uuid, statut_competition) to authenticated;

select 'ok : ' || count(*) || ' compétitions, genre ouvert par défaut' as controle from competitions;
commit;
