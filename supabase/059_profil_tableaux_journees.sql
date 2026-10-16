-- 059 : « Mon profil » — inscriptions à venir groupées par compétition (tableaux) avec les journées restantes.
-- Reprend 034 à l'identique et ajoute à chaque inscription : evenement_id (regroupement des tableaux) et journees (journées à venir, compétitions par équipes).
-- (034 d'origine : page publique « Mon profil » (athlète identifié par prénom + nom + date de naissance, ou n° de licence)
-- Renvoie (jusqu'à 300 derniers matchs, l'affichage les pagine) : fiche de licence (n°, saison, statut, club, catégorie, points, rang), derniers résultats et inscriptions
-- (à venir et passées). Réutilise l'identification et la limitation d'essais de « Je m'inscris » (_athlete).
-- Jamais renvoyés : certificat médical, e-mail, téléphone, adresse, représentant légal.
-- Une personne masquée du site public voit quand même sa propre fiche.

create or replace function athlete_profil(p_numero text, p_naissance date) returns json
language plpgsql security definer set search_path = public as $$
declare
  l licencies;
  v_licence json;
  v_rang integer;
  v_resultats json;
  v_inscriptions json;
begin
  l := _athlete(p_numero, p_naissance);
  if l.id is null then return json_build_object('erreur', 'Numéro de licence ou date de naissance incorrect.'); end if;

  select json_build_object('saison', s.libelle, 'type', lc.type::text, 'statut', lc.statut::text,
                           'en_cours', (current_date between s.date_debut and s.date_fin and lc.statut = 'active'))
    into v_licence
    from licences lc join saisons s on s.id = lc.saison_id
   where lc.licencie_id = l.id
   order by s.date_debut desc limit 1;

  select cm.rang into v_rang from classements_mensuels cm
   where cm.licencie_id = l.id and cm.mois = (select max(mois) from classements_mensuels);

  select coalesce(json_agg(r order by r.date_debut desc, r.cree desc), '[]'::json) into v_resultats from (
    select * from (
      select m.id as match_id, co.id as competition_id, co.nom as competition, co.date_debut, m.tour, m.type_match,
             pm.sets_gagnes as sets_pour,
             coalesce((select max(o.sets_gagnes) from participants_match o where o.match_id = m.id and o.cote <> pm.cote), 0) as sets_contre,
             (select string_agg(case when pm.cote = 'A' then x.score_a || '-' || x.score_b else x.score_b || '-' || x.score_a end, ', ' order by x.numero)
                from manches x where x.match_id = m.id) as manches,
             adv.liste, pm.points_finaux as points, m.created_at as cree
        from participants_match pm
        join matchs m on m.id = pm.match_id
        join competitions co on co.id = m.competition_id
        cross join lateral (
          select jsonb_agg(jsonb_build_object('id', case when o2.masque_public then null else o2.id end,
                                              'nom', case when o2.masque_public then 'Joueur masqué' else o2.prenom || ' ' || o2.nom end) order by o2.nom) as liste
            from participants_match o join licencies o2 on o2.id = o.licencie_id
           where o.match_id = m.id and o.cote <> pm.cote) adv
       where pm.licencie_id = l.id and m.statut = 'valide' and co.statut in ('cloturee', 'terminee')
       order by co.date_debut desc, m.created_at desc
       limit 300
    ) t
  ) r;

  select coalesce(json_agg(x order by x.date_debut desc), '[]'::json) into v_inscriptions from (
    select c.id, c.nom, c.lieu, c.date_debut, c.date_fin, c.type::text as type, c.genre, c.categorie_max,
           c.statut::text as statut_competition, i.nom_equipe,
           (c.date_fin >= current_date) as a_venir, coalesce(c.evenement_id, c.id) as evenement_id,
           coalesce((select json_agg(json_build_object('nom', t.nom, 'date', t.date_tour) order by t.date_tour, t.nom)
                       from tours_competition t where t.competition_id = c.id and t.date_tour >= current_date), '[]'::json) as journees,
           (select p2.nom_affiche from inscription_participants p2
             where i.type = 'paire' and p2.inscription_id = i.id and p2.licencie_id <> l.id limit 1) as partenaire
      from inscription_participants ip
      join inscriptions i on i.id = ip.inscription_id and i.statut = 'active'
      join competitions c on c.id = i.competition_id and c.statut <> 'brouillon'
     where ip.licencie_id = l.id
     limit 60
  ) x;

  return json_build_object(
    'id', l.id, 'prenom', l.prenom, 'nom', l.nom, 'numero', l.numero_licence, 'naissance', l.date_naissance,
    'points', l.points, 'rang', v_rang, 'actif', l.statut = 'actif',
    'club', (select nom from clubs where id = l.club_id),
    'categorie', categorie_age(l.date_naissance, current_date),
    'licence', v_licence, 'resultats', v_resultats, 'inscriptions', v_inscriptions);
end $$;

revoke execute on function athlete_profil(text, date) from public;
grant execute on function athlete_profil(text, date) to anon, authenticated;

select 'ok : Mon profil — tableaux et journées à venir' as resultat;
