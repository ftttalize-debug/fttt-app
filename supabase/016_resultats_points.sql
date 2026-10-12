-- 016 : résultats publics avec les points gagnés ou perdus par rencontre, et recherche de joueurs ayant des résultats

drop function if exists resultats_publics(uuid);
create function resultats_publics(p_competition uuid)
returns table (match_id uuid, tour text, type_match text, cote text, joueurs text, sets_gagnes integer, manches text, liste jsonb, points numeric)
language sql stable security definer set search_path = public as $$
  select m.id, m.tour, m.type_match, pm.cote,
         string_agg(case when l.masque_public then 'Joueur masqué' else l.prenom || ' ' || l.nom end, ' / ' order by l.nom),
         max(pm.sets_gagnes),
         (select string_agg(x.score_a || '-' || x.score_b, ', ' order by x.numero) from manches x where x.match_id = m.id),
         jsonb_agg(jsonb_build_object('id', case when l.masque_public then null else l.id end,
                                      'nom', case when l.masque_public then 'Joueur masqué' else l.prenom || ' ' || l.nom end) order by l.nom),
         max(pm.points_finaux)
    from matchs m
    join participants_match pm on pm.match_id = m.id
    join licencies l on l.id = pm.licencie_id
   where m.competition_id = p_competition and m.statut = 'valide'
     and exists (select 1 from competitions c where c.id = p_competition and c.statut in ('cloturee', 'terminee'))
   group by m.id, m.tour, m.type_match, pm.cote, m.created_at
   order by m.created_at, pm.cote
$$;

-- Joueurs visibles ayant au moins un match validé (pour la recherche « par joueur »)
create or replace function joueurs_avec_resultats()
returns table (id uuid, nom text, prenom text, club text)
language sql stable security definer set search_path = public as $$
  select l.id, l.nom, l.prenom, c.nom
    from licencies l left join clubs c on c.id = l.club_id
   where not l.masque_public
     and exists (select 1 from participants_match pm
                   join matchs m on m.id = pm.match_id
                   join competitions co on co.id = m.competition_id
                  where pm.licencie_id = l.id and m.statut = 'valide' and co.statut in ('cloturee', 'terminee'))
   order by l.nom, l.prenom
$$;

revoke execute on function resultats_publics(uuid), joueurs_avec_resultats() from public;
grant execute on function resultats_publics(uuid), joueurs_avec_resultats() to anon, authenticated;
