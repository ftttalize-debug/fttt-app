-- Fusion de la fiche « Temauu TAUTAHANA » (faute d'orthographe) dans « Temahu TAUTAHANA » (même date de naissance, même club).
-- Tout ce qui est rattaché à la fiche à supprimer (licences, inscriptions, matchs, historiques…) est reporté sur Temahu.
begin;
select set_config('app.recalcul', 'on', true);
select set_config('app.import', 'on', true);

do $$
declare
  v_garde uuid; v_doublon uuid; r record; v_n integer;
begin
  select id into v_garde   from licencies where nom = 'TAUTAHANA' and prenom = 'Temahu' and date_naissance = date '2003-09-20';
  select id into v_doublon from licencies where nom = 'TAUTAHANA' and prenom = 'Temauu' and date_naissance = date '2003-09-20';
  if v_garde is null or v_doublon is null then
    raise exception 'Fiches introuvables (Temahu : %, Temauu : %) : rien n''a été modifié', v_garde, v_doublon;
  end if;

  -- compléter Temahu avec ce que seule l'autre fiche contient, et garder les meilleurs points
  update licencies g set
      telephone = coalesce(g.telephone, d.telephone),
      email     = coalesce(g.email, d.email),
      points    = greatest(g.points, d.points)
    from licencies d where g.id = v_garde and d.id = v_doublon;

  -- reporter chaque référence vers la fiche à supprimer (toutes tables)
  for r in
    select c.conrelid::regclass as tbl, a.attname as col
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f' and c.confrelid = 'licencies'::regclass and array_length(c.conkey, 1) = 1
  loop
    begin
      execute format('update %s set %I = $1 where %I = $2', r.tbl, r.col, r.col) using v_garde, v_doublon;
    exception when unique_violation then
      -- Temahu a déjà une ligne équivalente (ex. licence de la même saison) : on retire celle du doublon
      execute format('delete from %s where %I = $1', r.tbl, r.col) using v_doublon;
    end;
  end loop;

  delete from licencies where id = v_doublon;
end $$;

-- Contrôle : une seule fiche TAUTAHANA Temahu, avec ses licences
select li.prenom || ' ' || li.nom as fiche, li.points::int as points,
       (select string_agg(s.libelle, ', ' order by s.libelle) from licences l join saisons s on s.id = l.saison_id where l.licencie_id = li.id) as saisons
  from licencies li where li.nom = 'TAUTAHANA' and li.date_naissance = date '2003-09-20';
commit;
