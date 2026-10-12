-- =====================================================================
-- FTTT – Lot 1 / Script 3 : barème des points, catégories, calcul d'un match
-- À exécuter après 002_securite.sql.
-- =====================================================================

-- Barème (coef. 1). écart = points de l'adversaire − points du joueur.
-- Tranches sur l'écart entier (la valeur est arrondie à l'entier inférieur avant lecture).
insert into bareme (ecart_min, ecart_max, points_victoire, points_defaite) values
  (  500, null,  40.0,   0.0),
  (  400,  499,  28.0,   0.0),
  (  300,  399,  22.0,  -0.5),
  (  200,  299,  17.0,  -1.0),
  (  150,  199,  13.0,  -2.0),
  (  100,  149,  10.0,  -3.0),
  (   50,   99,   8.0,  -4.0),
  (   25,   49,   7.0,  -4.5),
  (  -24,   24,   6.0,  -5.0),
  (  -49,  -25,   5.5,  -6.0),
  (  -99,  -50,   5.0,  -7.0),
  ( -149, -100,   4.0,  -8.0),
  ( -199, -150,   3.0, -10.0),
  ( -299, -200,   2.0, -12.5),
  ( -399, -300,   1.0, -16.0),
  ( -499, -400,   0.5, -20.0),
  ( null, -500,   0.0, -29.0);

-- Points d'un match pour un joueur, coefficient de la compétition appliqué, arrondi au dixième
create function points_match(p_ecart numeric, p_victoire boolean, p_coef numeric)
returns numeric
language sql stable set search_path = public as $$
  select round(case when p_victoire then points_victoire else points_defaite end * p_coef, 1)
  from bareme
  where floor(p_ecart) >= coalesce(ecart_min, -1000000)
    and floor(p_ecart) <= coalesce(ecart_max,  1000000)
$$;

-- Catégorie d'âge, calculée à l'âge atteint au 1er janvier de l'année de référence
create function categorie_age(p_naissance date, p_ref date default current_date)
returns text
language sql immutable as $$
  select case
    when a <= 9  then 'poussin'
    when a <= 11 then 'benjamin'
    when a <= 13 then 'minime'
    when a <= 15 then 'cadet'
    when a <= 19 then 'junior'
    when a <= 40 then 'senior'
    else 'veteran'
  end
  from (select date_part('year', age(make_date(extract(year from p_ref)::int, 1, 1), p_naissance))::int as a) t
$$;
