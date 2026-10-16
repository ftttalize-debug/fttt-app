-- =====================================================================
-- FTTT – Script 041 : renseigne le représentant légal (nom, téléphone, e-mail) des mineurs
-- à partir du fichier « dossier_pour_alize.xlsx ». À exécuter après 040. Une seule requête, rien d'autre dedans.
-- Relançable : ne remplace jamais une valeur déjà saisie, ne complète que les champs vides des mineurs.
-- Rapprochement par prénom + nom (accents, espaces et tirets ignorés).
-- Le résultat indique le nombre de fiches mises à jour et les joueurs du fichier non trouvés ou majeurs.
-- =====================================================================
with v(joueur, rep, tel, mail) as (values
  ('Anais OUTZEKHOVSKY', 'John OUTZEKHOVSKY', '87 25 05 38', 'maison.hanalei.raiatea@gmail.com'),
  ('Keanu TEHEI', 'Mateau TEHEI', '87 76 90 89', 'keanu-teva@hotmail.fr'),
  ('Hotunuioatitoka FALCHETTO', 'Kiipuhia Sarah', '87 35 58 53', 'hetu.transport@gmail.com'),
  ('Jade DIDELOT', 'Kiipuhia Sarah', '87 35 58 53', 'hetu.transport@gmail.com'),
  ('Oumatioatitoka FALCHETTO', 'Kiipuhia Sarah', '87 35 58 53', 'hetu.transport@gmail.com'),
  ('Hugo OUGIER', 'DREUX Julie', '87 73 54 20', 'julie.dreux021@gmail.com'),
  ('Teharetua TEHEI', 'TEHEI Teharetua', '89 75 67 05', 'ttehei81@gmail.com'),
  ('Manea JUSTIN', 'JUSTIN Jean Baptiste', '87 79 69 01', 'teva.justin@gmail.com'),
  ('Keivanui WONG', 'WONG Randy', '87 76 92 77', 'wrandy@hotmail.fr'),
  ('Kawaiihi MANATE', 'MANATE Hamatua', '87 79 16 89', 'hamatua.manate@gmail.com'),
  ('Jayden KUO', 'KUO Steve', '89 50 75 77', 'stek45@gmail.com'),
  ('Arthur SERY', 'LY Vaiana', '87 24 87 13', 'lovelychobit@gmail.com'),
  ('David SACAULT', 'SACAULT Wilfied', '87 78 79 60', 'wsacault@hotmail.com'),
  ('Hoanui MINIER', 'MINIER Yannick', '89 71 32 60', 'yannick.minier@gmail.com'),
  ('Jolan BOLDUC', 'ALEMANN Jordane', '87 37 79 70', 'alemannij@gmail.com'),
  ('Mate TEHEI', 'TEHEI Teharetua', '89 75 67 05', 'ttehei81@gmail.com'),
  ('Naelan MOU CHI SAN', 'MOU CHI SAN Mareva', '89 41 44 24', 'mareva_vigneron@gmail.com'),
  ('Adam NEVORAL', 'NEVORAL Ondrej', '87 33 57 39', 'ondrej.nevoral@gmail.com'),
  ('Arthur CASSE', 'CASSE Isabelle', '87 70 31 81', 'zazazoulive@gmail.com'),
  ('Axel LEDUC', 'LEDUC Bernard', '87 00 31 87', 'celine.leduc@gmail.com'),
  ('Dylan VONGUE', 'VONGUE Annick', '89 72 18 33', 'vongueannick@gmail.com'),
  ('Gabriel CHAVEROCHE', 'ANDRIEUX Bruce', '87 33 31 75', 'bruce.andrieux@gmail.com'),
  ('Hitinui TROMPETTE', 'TROMPETTE Serge', '87 74 92 95', 'laux_angela@yahoo.fr'),
  ('Jamy LAN KUAN DANH', 'LANKUAN DANH', '87 71 91 24', 'flko24@gmail.com'),
  ('Kehan PANG FOU', 'PANG FOU Kevin', '87 70 38 69', 'pangfou@mail.pf'),
  ('Khéona MOUSSON', 'MOUSSON Fredy', '89 52 98 88', 'fredymousson@yahoo.fr'),
  ('Louis HUANG', 'HUANG David', '87 75 89 66', 'lingling727@gmail.com'),
  ('Natearii YEE', 'YEE Fabien', '89 73 69 84', 'yeefabien@hotmail.com'),
  ('Ryan CHING', 'CHING Yann', '87 71 23 99', 'yann.ching1205@gmail.com'),
  ('Thierry LIU SING', 'LISAN Heiana', '87 76 16 76', 'thierry.liusing@fttt.pf'),
  ('Manua MAZET DAUDIGNON', 'MAZET Charly', '89 79 08 85', 'manuamazet@gmail.com'),
  ('Francky MOUSSON', 'PAHIO Clotilde', '87 29 95 96', 'francky.mousson@fttt.pf'),
  ('Heimoana MOUSSON', 'PAHIO Clotilde', '87 29 95 96', 'francky.mousson@fttt.pf'),
  ('Hihimahana MOUSSON PAHIO', 'PAHIO Clotilde', '87 29 95 96', 'francky.mousson@fttt.pf'),
  ('Kessy MARA', 'MARA Cindy', '87 28 63 30', 'cindytianoa@gmail.com'),
  ('Kohai MARA', 'MARA Cindy', '87 28 63 30', 'cindytianoa@gmail.com'),
  ('Aihau THIEME', 'THIEME Raimana', '87 20 03 08', 'raimanathi@gmail.com'),
  ('Anton LIU-SING', 'LIANT Vanina', '87 77 93 44', 'alain_liu_sing@yahoo.com'),
  ('Evan LIU-SING', 'LIANT Vanina', '87 77 93 44', 'alain_liu_sing@yahoo.com'),
  ('Clara SAYEGH', 'SAYEG Carole', '89 67 27 00', 'c.deneux@hahoo.fr'),
  ('Léo SAYEGH', 'SAYEG Carole', '89 67 27 00', 'c.deneux@hahoo.fr'),
  ('Daniel BRUMIER', 'BRUMIER Fabrice', '89 19 98 88', 'fabrice@brumier.com'),
  ('Jolene ROPONUS', 'BRURGAUD Cannelle', '87 77 22 99', 'burgaudcannelle@yahoo.fr'),
  ('Keoni GALL', 'GALL Christian', '87 29 26 35', 'christian.gall@gmail.com'),
  ('Liam GARDAN', 'GARDAN Pascal', '89 20 33 14', 'pascal_gardan@hotmail.com'),
  ('Louise QUIQUET', 'QUIQUET Francois', '89 72 09 85', 'rarahu.rq@gmail.com'),
  ('Newen QUIQUET', 'QUIQUET Francois', '89 72 09 85', 'rarahu.rq@gmail.com'),
  ('Nathan TCHIOU', 'TCHIOU Larry', '89 54 90 55', 'larry.tchiou@gmail.com'),
  ('Matteo TCHIOU', 'TCHIOU Larry', '89 54 90 55', 'larry.tchiou@gmail.com'),
  ('Mauani MONTARON', 'MONTARON Noelani', '87 71 43 15', 'noelani.tufaara@gmail.com'),
  ('Raphael COLAUX', 'COLAUX Jean Francois', '87 72 61 03', 'jfcolaux@hotmail.com'),
  ('Theo ROCHEFORT-WALTERS', 'ROCHEFORT Anthony', '87 72 85 29', 'rochefort_anthony@yahoo.fr'),
  ('Tiahiti TCHING CHI YEN', 'HERVE teina', '89 34 15 70', 'teinaherve@yahoo.fr'),
  ('Tihoni TIFFON', 'TIFFON Damien', '87 01 99 99', 'cocoon_33@hotmail.fr'),
  ('Touariki VIDAL', 'VIDAL Raimere', '87 31 05 82', 'raimereebb987@gmail.com'),
  ('Tiem CHEMET', 'CHEMET Gregory', '87 32 42 48', 'gregorychemet@hotmail.com'),
  ('Hanihau GOCHE', 'GOCHE Vaihere', '87 78 22 96', 'vaituhei@gmail.com'),
  ('Manahau LANE', 'TAHIMANARII Marie Louise', '87 28 79 87', 'mlouisetahimanarii@hotmail.com'),
  ('Nateo MOREL', 'MOREL Jessie', '87 73 71 94', 'hornet-133@hotmail.fr'),
  ('Titouan JOSSERON', 'JOSSERON Pierre', '87 74 68 69', 'gaelle.lacroze@hotmail.pf')
),
cible as (
  select l.id, v.joueur, v.rep, v.tel, v.mail
    from licencies l
    join v on regexp_replace(translate(lower(l.prenom || l.nom),'éèêëàâäîïôöùûüç','eeeeaaaiioouuuc'),'[^a-z]','','g') = regexp_replace(translate(lower(v.joueur),'éèêëàâäîïôöùûüç','eeeeaaaiioouuuc'),'[^a-z]','','g')
   where l.date_naissance > (current_date - interval '18 years')::date
),
maj as (
  update licencies l
     set representant_nom = coalesce(nullif(trim(l.representant_nom), ''), c.rep),
         representant_telephone = coalesce(nullif(trim(l.representant_telephone), ''), c.tel),
         representant_email = coalesce(nullif(trim(l.representant_email), ''), c.mail)
    from cible c where l.id = c.id returning l.id
)
select (select count(*) from maj) as fiches_mises_a_jour,
       (select string_agg(v.joueur, ', ' order by v.joueur) from v where not exists (select 1 from cible c where c.joueur = v.joueur)) as non_trouves_ou_majeurs;
