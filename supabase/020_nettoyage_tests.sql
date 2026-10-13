-- Nettoyage des fiches de test : supprime Kira SHAKIRA (fiche inventée) et archive les 3 autres fiches de test.
-- Alizé BELROSE n'est pas touché (il est dans le fichier 2026-2027).
begin;
select set_config('app.recalcul', 'on', true);

-- 1) Archiver les 3 fiches de test et annuler leur licence 2026-2027
update licences l set statut = 'annulee'
  from licencies li, saisons s
 where li.id = l.licencie_id and s.id = l.saison_id and s.libelle = '2026-2027'
   and ((li.nom = 'BONNEL' and li.prenom ilike 'Est%ban') or li.nom ilike 'BOISDRO%' or (li.nom = 'AKA' and li.prenom = 'Tehina'));

update licencies set statut = 'archive', date_archivage = current_date
 where (nom = 'BONNEL' and prenom ilike 'Est%ban') or nom ilike 'BOISDRO%' or (nom = 'AKA' and prenom = 'Tehina');

-- 2) Supprimer Kira SHAKIRA ; si elle est liée à d'autres données, on l'archive à la place
do $$
declare v_id uuid;
begin
  select id into v_id from licencies where nom = 'SHAKIRA' and prenom = 'Kira';
  if v_id is null then return; end if;
  begin
    delete from licences where licencie_id = v_id;
    delete from licencies where id = v_id;
  exception when foreign_key_violation then
    update licencies set statut = 'archive', date_archivage = current_date where id = v_id;
    raise notice 'SHAKIRA liée à d''autres données : archivée au lieu de supprimée';
  end;
end $$;

-- Contrôle : état des 4 fiches (SHAKIRA ne doit plus apparaître) + nombre de licences 2026-2027 actives (attendu : 140)
select nom || ' ' || prenom as fiche, statut::text as etat from licencies
 where nom in ('SHAKIRA','AKA') or nom ilike 'BOISDRO%' or (nom = 'BONNEL' and prenom ilike 'Est%ban')
union all
select 'licences 2026-2027 actives', count(*)::text from licences l join saisons s on s.id = l.saison_id
 where s.libelle = '2026-2027' and l.statut = 'active';
commit;
