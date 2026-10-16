-- =====================================================================
-- FTTT – Script 036A : création des compétitions 2026-2027 (automne-printemps)
-- À exécuter après 035 (036A) ; une seule requête, rien d'autre dedans. Relançable : une compétition déjà créée (même nom, même saison) est ignorée.
-- Inscriptions ouvertes, date limite = début − 3 jours, coefficient 1, lieu vide, ouverte à tous = non.
-- =====================================================================
with s as (select id from saisons where libelle = '2026-2027'),
e(k, id) as (select k, gen_random_uuid() from unnest(array['eq', 'sel']::text[]) as k),
v(ev, nom, typ, genre, cmax, cmin, pmax, montant, debut, fin, fed) as (values
    (null, 'Challenge simple', 'simple', 'ouvert', null, null, null, 500, '2026-10-03', '2026-10-03', false),
    ('eq', 'Par équipe – D2', 'equipe', 'ouvert', null, null, null, 5000, '2026-10-10', '2027-04-24', false),
    ('eq', 'Par équipe – Élite', 'equipe', 'ouvert', null, null, null, 5000, '2026-10-10', '2027-04-24', false),
    (null, 'Critérium 1', 'simple', 'ouvert', null, null, null, 500, '2026-11-21', '2026-11-21', false),
    (null, 'Critérium 2', 'simple', 'ouvert', null, null, null, 500, '2026-12-05', '2026-12-05', false),
    (null, 'Critérium 3', 'simple', 'ouvert', null, null, null, 500, '2027-01-23', '2027-01-23', false),
    (null, 'Critérium 4', 'simple', 'ouvert', null, null, null, 500, '2027-02-27', '2027-02-27', false),
    ('sel', 'Sélectives Jeux du Pacifique – Messieurs 6 mars', 'simple', 'messieurs', null, null, null, 0, '2027-03-06', '2027-03-06', true),
    ('sel', 'Sélectives Jeux du Pacifique – Messieurs 13 mars', 'simple', 'messieurs', null, null, null, 0, '2027-03-13', '2027-03-13', true),
    ('sel', 'Sélectives Jeux du Pacifique – Dames 20-21 mars', 'simple', 'dames', null, null, null, 0, '2027-03-20', '2027-03-21', true),
    ('sel', 'Sélectives Jeux du Pacifique – Dames 27-28 mars', 'simple', 'dames', null, null, null, 0, '2027-03-27', '2027-03-28', true),
    (null, 'Sélectives Oceania Hopes', 'simple', 'ouvert', 'U12', null, null, 500, '2027-03-31', '2027-03-31', false)
),
ins as (
  insert into competitions (nom, saison_id, lieu, date_debut, date_fin, type, coefficient, montant_xpf, date_limite_inscription,
                            statut, ouverte_a_tous, evenement_id, genre, categorie_max, categorie_min, points_max, inscription_federation)
  select v.nom, s.id, null, v.debut::date, v.fin::date, v.typ::type_competition, 1.00, v.montant::integer, v.debut::date - 3,
         'ouverte', false, e.id, v.genre, v.cmax::text, v.cmin::text, v.pmax::integer, v.fed::boolean
    from v cross join s left join e on e.k = v.ev
   where not exists (select 1 from competitions c where c.nom = v.nom and c.saison_id = s.id)
  returning id, nom
),
tr as (
  insert into tours_competition (competition_id, nom, date_tour)
  select ins.id, t.nom, t.d::date from ins
    cross join (values ('Journée 1', '2026-10-10'), ('Journée 2', '2026-10-17'), ('Journée 3', '2026-11-14'), ('Journée 4', '2027-01-16'),
                       ('Journée 5', '2027-01-30'), ('Journée 6', '2027-02-06'), ('Journée 7', '2027-04-17'), ('Finale', '2027-04-24')) as t(nom, d)
   where ins.nom like 'Par équipe – %'
  returning 1
)
select (select count(*) from ins) as competitions_creees, (select count(*) from tr) as tours_crees;
