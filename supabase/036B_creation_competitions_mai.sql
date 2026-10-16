-- =====================================================================
-- FTTT – Script 036B : création des compétitions 2026-2027 (mai)
-- À exécuter après 035 (036A) ; une seule requête, rien d'autre dedans. Relançable : une compétition déjà créée (même nom, même saison) est ignorée.
-- Inscriptions ouvertes, date limite = début − 3 jours, coefficient 1, lieu vide, ouverte à tous = non.
-- =====================================================================
with s as (select id from saisons where libelle = '2026-2027'),
e(k, id) as (select k, gen_random_uuid() from unnest(array['cpo', 't12j', 'tit']::text[]) as k),
v(ev, nom, typ, genre, cmax, cmin, pmax, montant, debut, fin, fed) as (values
    ('t12j', 'Top 12 Jeunes – U19 Garçons', 'simple', 'messieurs', 'U19', null, null, 500, '2027-05-08', '2027-05-09', false),
    ('t12j', 'Top 12 Jeunes – U19 Filles', 'simple', 'dames', 'U19', null, null, 500, '2027-05-08', '2027-05-09', false),
    ('tit', 'Tournoi international de Tahiti – Open', 'simple', 'ouvert', null, null, null, 1000, '2027-05-15', '2027-05-16', false),
    ('tit', 'Tournoi international de Tahiti – U19 Garçons', 'simple', 'messieurs', 'U19', null, null, 1000, '2027-05-15', '2027-05-16', false),
    ('tit', 'Tournoi international de Tahiti – U15 Garçons', 'simple', 'messieurs', 'U15', null, null, 1000, '2027-05-15', '2027-05-16', false),
    ('tit', 'Tournoi international de Tahiti – U13 Garçons', 'simple', 'messieurs', 'U13', null, null, 1000, '2027-05-15', '2027-05-16', false),
    ('tit', 'Tournoi international de Tahiti – U19 Filles', 'simple', 'dames', 'U19', null, null, 1000, '2027-05-15', '2027-05-16', false),
    ('tit', 'Tournoi international de Tahiti – U15 Filles', 'simple', 'dames', 'U15', null, null, 1000, '2027-05-15', '2027-05-16', false),
    ('tit', 'Tournoi international de Tahiti – U13 Filles', 'simple', 'dames', 'U13', null, null, 1000, '2027-05-15', '2027-05-16', false),
    ('tit', 'Tournoi international de Tahiti – Double Mixte', 'double', 'mixte', null, null, null, 500, '2027-05-15', '2027-05-16', false),
    ('tit', 'Tournoi international de Tahiti – Double Messieurs', 'double', 'messieurs', null, null, null, 500, '2027-05-15', '2027-05-16', false),
    ('tit', 'Tournoi international de Tahiti – Double Dames', 'double', 'dames', null, null, null, 500, '2027-05-15', '2027-05-16', false),
    ('tit', 'Tournoi international de Tahiti – Vétérans', 'simple', 'ouvert', null, 'veteran', null, 1000, '2027-05-15', '2027-05-16', false),
    ('cpo', 'Championnats de Polynésie Open – U19 Garçons', 'simple', 'messieurs', 'U19', null, null, 500, '2027-05-17', '2027-05-21', false),
    ('cpo', 'Championnats de Polynésie Open – U15 Garçons', 'simple', 'messieurs', 'U15', null, null, 500, '2027-05-17', '2027-05-21', false),
    ('cpo', 'Championnats de Polynésie Open – U13 Garçons', 'simple', 'messieurs', 'U13', null, null, 500, '2027-05-17', '2027-05-21', false),
    ('cpo', 'Championnats de Polynésie Open – U19 Filles', 'simple', 'dames', 'U19', null, null, 500, '2027-05-17', '2027-05-21', false),
    ('cpo', 'Championnats de Polynésie Open – U15 Filles', 'simple', 'dames', 'U15', null, null, 500, '2027-05-17', '2027-05-21', false),
    ('cpo', 'Championnats de Polynésie Open – U13 Filles', 'simple', 'dames', 'U13', null, null, 500, '2027-05-17', '2027-05-21', false),
    ('cpo', 'Championnats de Polynésie Open – Open Messieurs', 'simple', 'messieurs', null, null, null, 500, '2027-05-17', '2027-05-21', false),
    ('cpo', 'Championnats de Polynésie Open – Open Dames', 'simple', 'dames', null, null, null, 500, '2027-05-17', '2027-05-21', false),
    ('cpo', 'Championnats de Polynésie Open – Double Mixte', 'double', 'mixte', null, null, null, 250, '2027-05-17', '2027-05-21', false),
    ('cpo', 'Championnats de Polynésie Open – Double Messieurs', 'double', 'messieurs', null, null, null, 250, '2027-05-17', '2027-05-21', false),
    ('cpo', 'Championnats de Polynésie Open – Double Dames', 'double', 'dames', null, null, null, 250, '2027-05-17', '2027-05-21', false),
    ('cpo', 'Championnats de Polynésie Open – Vétérans', 'simple', 'ouvert', null, 'veteran', null, 500, '2027-05-17', '2027-05-21', false),
    ('cpo', 'Championnats de Polynésie Open – Par équipe Messieurs', 'equipe', 'messieurs', null, null, null, 20000, '2027-05-17', '2027-05-21', false),
    ('cpo', 'Championnats de Polynésie Open – Par équipe Dames', 'equipe', 'dames', null, null, null, 20000, '2027-05-17', '2027-05-21', false)
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
