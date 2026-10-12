-- 015 : site public pour les licenciés (sans compte) + comptes réservés aux rôles
-- 1) Case « Masquer du site public » (cadre fédéral uniquement, via la fiche)
-- 2) Fonctions publiques : calendrier, fiche joueur, historique, barème ; classement et résultats avec masquage
-- 3) Rattachement de compte limité aux personnes qui ont un rôle ou un poste de juge-arbitre

alter table licencies add column if not exists masque_public boolean not null default false;

-- ---------- Classement public (avec identifiant pour ouvrir la fiche) ----------
drop function if exists classement_public(date);
create function classement_public(p_mois date default null)
returns table (id uuid, rang integer, nom text, prenom text, club text, categorie text, sexe text, points numeric)
language sql stable security definer set search_path = public as $$
  select l.id, cm.rang, l.nom, l.prenom, c.nom, cm.categorie, l.sexe::text, cm.points
    from classements_mensuels cm
    join licencies l on l.id = cm.licencie_id
    left join clubs c on c.id = l.club_id
   where cm.mois = coalesce(p_mois, (select max(mois) from classements_mensuels))
     and not l.masque_public
   order by cm.rang, l.nom
$$;

-- ---------- Résultats publics (joueur masqué : nom remplacé) ----------
drop function if exists resultats_publics(uuid);
create function resultats_publics(p_competition uuid)
returns table (match_id uuid, tour text, type_match text, cote text, joueurs text, sets_gagnes integer, manches text, liste jsonb)
language sql stable security definer set search_path = public as $$
  select m.id, m.tour, m.type_match, pm.cote,
         string_agg(case when l.masque_public then 'Joueur masqué' else l.prenom || ' ' || l.nom end, ' / ' order by l.nom),
         max(pm.sets_gagnes),
         (select string_agg(x.score_a || '-' || x.score_b, ', ' order by x.numero) from manches x where x.match_id = m.id),
         jsonb_agg(jsonb_build_object('id', case when l.masque_public then null else l.id end,
                                      'nom', case when l.masque_public then 'Joueur masqué' else l.prenom || ' ' || l.nom end) order by l.nom)
    from matchs m
    join participants_match pm on pm.match_id = m.id
    join licencies l on l.id = pm.licencie_id
   where m.competition_id = p_competition and m.statut = 'valide'
     and exists (select 1 from competitions c where c.id = p_competition and c.statut in ('cloturee', 'terminee'))
   group by m.id, m.tour, m.type_match, pm.cote, m.created_at
   order by m.created_at, pm.cote
$$;

-- ---------- Calendrier : toutes les compétitions sauf les brouillons ----------
create or replace function calendrier_public()
returns table (id uuid, nom text, lieu text, date_debut date, date_fin date, type text, coefficient numeric, statut text)
language sql stable security definer set search_path = public as $$
  select id, nom, lieu, date_debut, date_fin, type::text, coefficient, statut::text
    from competitions where statut <> 'brouillon' order by date_debut desc
$$;

-- ---------- Fiche publique d'un joueur ----------
create or replace function fiche_joueur_publique(p_id uuid)
returns table (id uuid, nom text, prenom text, club text, categorie text, sexe text, points numeric, rang integer, actif boolean)
language sql stable security definer set search_path = public as $$
  select l.id, l.nom, l.prenom, c.nom, categorie_age(l.date_naissance, current_date), l.sexe::text, l.points,
         (select cm.rang from classements_mensuels cm
           where cm.licencie_id = l.id and cm.mois = (select max(mois) from classements_mensuels)),
         l.statut = 'actif'
    from licencies l left join clubs c on c.id = l.club_id
   where l.id = p_id and not l.masque_public
$$;

-- ---------- Historique des matchs validés d'un joueur ----------
create or replace function historique_joueur(p_id uuid)
returns table (match_id uuid, competition_id uuid, competition text, date_debut date, tour text, type_match text,
               sets_pour integer, sets_contre integer, manches text, adversaires text, liste jsonb, points numeric)
language sql stable security definer set search_path = public as $$
  select m.id, co.id, co.nom, co.date_debut, m.tour, m.type_match,
         pm.sets_gagnes,
         coalesce((select max(o.sets_gagnes) from participants_match o where o.match_id = m.id and o.cote <> pm.cote), 0),
         (select string_agg(case when pm.cote = 'A' then x.score_a || '-' || x.score_b else x.score_b || '-' || x.score_a end, ', ' order by x.numero)
            from manches x where x.match_id = m.id),
         adv.noms, adv.liste, pm.points_finaux
    from participants_match pm
    join matchs m on m.id = pm.match_id
    join competitions co on co.id = m.competition_id
    join licencies moi on moi.id = pm.licencie_id
    cross join lateral (
      select string_agg(case when l.masque_public then 'Joueur masqué' else l.prenom || ' ' || l.nom end, ' / ' order by l.nom) as noms,
             jsonb_agg(jsonb_build_object('id', case when l.masque_public then null else l.id end,
                                          'nom', case when l.masque_public then 'Joueur masqué' else l.prenom || ' ' || l.nom end) order by l.nom) as liste
        from participants_match o join licencies l on l.id = o.licencie_id
       where o.match_id = m.id and o.cote <> pm.cote) adv
   where pm.licencie_id = p_id and not moi.masque_public
     and m.statut = 'valide' and co.statut in ('cloturee', 'terminee')
   order by co.date_debut desc, m.created_at desc
$$;

-- ---------- Barème pour le simulateur ----------
create or replace function bareme_public()
returns table (ecart_min integer, ecart_max integer, points_victoire numeric, points_defaite numeric)
language sql stable security definer set search_path = public as $$
  select ecart_min, ecart_max, points_victoire, points_defaite from bareme
  order by coalesce(ecart_min, -1000000) desc
$$;

revoke execute on function classement_public(date), resultats_publics(uuid), calendrier_public(),
  fiche_joueur_publique(uuid), historique_joueur(uuid), bareme_public() from public;
grant execute on function classement_public(date), resultats_publics(uuid), calendrier_public(),
  fiche_joueur_publique(uuid), historique_joueur(uuid), bareme_public() to anon, authenticated;

-- ---------- Rattachement : seulement pour un rôle ou un poste de juge-arbitre ----------
create or replace function lier_mon_compte() returns json
language plpgsql security definer set search_path = public, auth as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_conf  timestamptz;
  v_ids   uuid[];
begin
  if v_uid is null then
    raise exception 'Connexion requise';
  end if;

  if exists (select 1 from licencies where user_id = v_uid) then
    return json_build_object('lie', true);
  end if;

  select lower(trim(email)), email_confirmed_at into v_email, v_conf
  from auth.users where id = v_uid;

  if v_email is null or v_conf is null then
    return json_build_object('lie', false, 'raison', 'email_non_confirme');
  end if;

  select array_agg(l.id) into v_ids
  from licencies l
  where lower(trim(l.email)) = v_email
    and l.user_id is null
    and l.date_naissance <= current_date - interval '18 years';

  if v_ids is null then
    return json_build_object('lie', false, 'raison', 'aucune_fiche');
  end if;
  if array_length(v_ids, 1) > 1 then
    return json_build_object('lie', false, 'raison', 'ambigu');
  end if;
  if not (exists (select 1 from attributions_roles where licencie_id = v_ids[1])
          or exists (select 1 from competition_juges where licencie_id = v_ids[1])) then
    return json_build_object('lie', false, 'raison', 'aucun_acces');
  end if;

  perform set_config('app.recalcul', 'on', true);
  update licencies set user_id = v_uid where id = v_ids[1];
  return json_build_object('lie', true);
end $$;
