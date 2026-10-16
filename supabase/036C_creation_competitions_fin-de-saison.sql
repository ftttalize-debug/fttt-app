-- =====================================================================
-- FTTT – Script 036C : création des compétitions 2026-2027 (fin-de-saison)
-- À exécuter après 035 (036A) ; une seule requête, rien d'autre dedans. Relançable : une compétition déjà créée (même nom, même saison) est ignorée.
-- Inscriptions ouvertes, date limite = début − 3 jours, coefficient 1, lieu vide, ouverte à tous = non.
-- =====================================================================
with s as (select id from saisons where libelle = '2026-2027'),
e(k, id) as (select k, gen_random_uuid() from unnest(array['ctj', 'cto', 't12o']::text[]) as k),
v(ev, nom, typ, genre, cmax, cmin, pmax, montant, debut, fin, fed) as (values
    ('ctj', 'Championnat de Tahiti Jeunes – Open', 'simple', 'ouvert', null, null, null, 500, '2027-05-29', '2027-05-30', false),
    ('ctj', 'Championnat de Tahiti Jeunes – U19 Garçons', 'simple', 'messieurs', 'U19', null, null, 500, '2027-05-29', '2027-05-30', false),
    ('ctj', 'Championnat de Tahiti Jeunes – U15 Garçons', 'simple', 'messieurs', 'U15', null, null, 500, '2027-05-29', '2027-05-30', false),
    ('ctj', 'Championnat de Tahiti Jeunes – U13 Garçons', 'simple', 'messieurs', 'U13', null, null, 500, '2027-05-29', '2027-05-30', false),
    ('ctj', 'Championnat de Tahiti Jeunes – U19 Filles', 'simple', 'dames', 'U19', null, null, 500, '2027-05-29', '2027-05-30', false),
    ('ctj', 'Championnat de Tahiti Jeunes – U15 Filles', 'simple', 'dames', 'U15', null, null, 500, '2027-05-29', '2027-05-30', false),
    ('ctj', 'Championnat de Tahiti Jeunes – U13 Filles', 'simple', 'dames', 'U13', null, null, 500, '2027-05-29', '2027-05-30', false),
    ('ctj', 'Championnat de Tahiti Jeunes – Double Mixte U19', 'double', 'mixte', 'U19', null, null, 250, '2027-05-29', '2027-05-30', false),
    ('ctj', 'Championnat de Tahiti Jeunes – Double Messieurs U19', 'double', 'messieurs', 'U19', null, null, 250, '2027-05-29', '2027-05-30', false),
    ('ctj', 'Championnat de Tahiti Jeunes – Double Dames U19', 'double', 'dames', 'U19', null, null, 250, '2027-05-29', '2027-05-30', false),
    ('t12o', 'Top 12 Open – Messieurs', 'simple', 'messieurs', null, null, null, 500, '2027-06-05', '2027-06-06', false),
    ('t12o', 'Top 12 Open – Dames', 'simple', 'dames', null, null, null, 500, '2027-06-05', '2027-06-06', false),
    ('cto', 'Championnat de Tahiti Open – Messieurs', 'simple', 'messieurs', null, null, null, 500, '2027-06-26', '2027-06-27', false),
    ('cto', 'Championnat de Tahiti Open – Dames', 'simple', 'dames', null, null, null, 500, '2027-06-26', '2027-06-27', false),
    ('cto', 'Championnat de Tahiti Open – 599 points et moins', 'simple', 'ouvert', null, null, 599, 500, '2027-06-26', '2027-06-27', false),
    ('cto', 'Championnat de Tahiti Open – 899 points et moins', 'simple', 'ouvert', null, null, 899, 500, '2027-06-26', '2027-06-27', false),
    ('cto', 'Championnat de Tahiti Open – 1299 points et moins', 'simple', 'ouvert', null, null, 1299, 500, '2027-06-26', '2027-06-27', false),
    ('cto', 'Championnat de Tahiti Open – Vétérans', 'simple', 'ouvert', null, 'veteran', null, 500, '2027-06-26', '2027-06-27', false),
    ('cto', 'Championnat de Tahiti Open – Double Messieurs', 'double', 'messieurs', null, null, null, 250, '2027-06-26', '2027-06-27', false),
    ('cto', 'Championnat de Tahiti Open – Double Dames', 'double', 'dames', null, null, null, 250, '2027-06-26', '2027-06-27', false),
    ('cto', 'Championnat de Tahiti Open – Double Mixte', 'double', 'mixte', null, null, null, 250, '2027-06-26', '2027-06-27', false),
    ('cto', 'Championnat de Tahiti Open – Double Vétérans', 'double', 'ouvert', null, 'veteran', null, 250, '2027-06-26', '2027-06-27', false)
),
ins as (
  insert into competitions (nom, saison_id, lieu, date_debut, date_fin, type, coefficient, montant_xpf, date_limite_inscription,
                            statut, ouverte_a_tous, evenement_id, genre, categorie_max, categorie_min, points_max, inscription_federation)
  select v.nom, s.id, null, v.debut::date, v.fin::date, v.typ::type_competition, 1.00, v.montant::integer, v.debut::date - 3,
         'ouverte', false, e.id, v.genre, v.cmax::text, v.cmin::text, v.pmax::integer, v.fed::boolean
    from v cross join s left join e on e.k = v.ev
   where not exists (select 1 from competitions c where c.nom = v.nom and c.saison_id = s.id)
  returning id, nom
)
select count(*) as competitions_creees from ins;
