-- FTTT – Script 056 : noms officiels des compétitions (saison 2026-2027). Relançable.
--  « Par équipe – Élite / D2 »  → « Championnat de Tahiti par équipe – Élite / D2 »
--  « Critérium 1 à 4 »          → « Critérium de Tahiti 1 à 4 »
--  « Top 12 Jeunes / Open … »   → « Top Polynésiens – Top 12 Jeunes / Open … »
with s as (select id from saisons where libelle = '2026-2027'),
maj as (
  update competitions c set nom = case
      when c.nom like 'Par équipe – %'   then 'Championnat de Tahiti par équipe – ' || substr(c.nom, length('Par équipe – ') + 1)
      when c.nom like 'Critérium %'      then 'Critérium de Tahiti ' || substr(c.nom, length('Critérium ') + 1)
      when c.nom like 'Top 12 %'         then 'Top Polynésiens – ' || c.nom
    end
   from s
  where c.saison_id = s.id
    and (c.nom like 'Par équipe – %' or c.nom like 'Critérium %' or c.nom like 'Top 12 %')
  returning c.nom
)
select count(*) as competitions_renommees, string_agg(nom, ' | ' order by nom) as noms from maj;
