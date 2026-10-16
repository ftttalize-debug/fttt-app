-- =====================================================================
-- FTTT – Script 037 : seul l'administrateur des comptes modifie les accès
-- À exécuter après 036. Une seule requête, rien d'autre dedans. Relançable.
-- Les cadres fédéraux gardent la lecture de la page Comptes ; donner, retirer un rôle et détacher un compte
-- sont réservés aux personnes listées dans administrateurs_comptes (au départ : Alizé Belrose).
-- Sécurité : si la liste est vide, tous les cadres gardent l'accès (pour ne jamais se verrouiller).
-- Pour ajouter quelqu'un plus tard : insert into administrateurs_comptes (licencie_id) values ('<id de la fiche>');
-- =====================================================================
begin;

create table if not exists administrateurs_comptes (
  licencie_id uuid primary key references licencies(id) on delete cascade
);
alter table administrateurs_comptes enable row level security;

create or replace function est_admin_comptes() returns boolean
language sql stable security definer set search_path = public as $$
  select est_cadre() and (
    exists (select 1 from administrateurs_comptes a join licencies l on l.id = a.licencie_id where l.user_id = auth.uid())
    or not exists (select 1 from administrateurs_comptes))
$$;
revoke execute on function est_admin_comptes() from public, anon;
grant execute on function est_admin_comptes() to authenticated;

-- Attributions de rôles : lecture pour le cadre, écriture pour l'administrateur des comptes seulement
drop policy if exists roles_cadre on attributions_roles;
drop policy if exists roles_cadre_lecture on attributions_roles;
drop policy if exists roles_admin_ecriture on attributions_roles;
create policy roles_cadre_lecture on attributions_roles for select using (est_cadre());
create policy roles_admin_ecriture on attributions_roles for all using (est_admin_comptes()) with check (est_admin_comptes());

-- Détacher un compte : administrateur seulement (jamais le sien)
create or replace function delier_compte(p_licencie uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not est_admin_comptes() then
    raise exception 'Réservé à l''administrateur des comptes';
  end if;
  if exists (select 1 from licencies where id = p_licencie and user_id = auth.uid()) then
    raise exception 'Tu ne peux pas détacher ton propre compte';
  end if;
  perform set_config('app.recalcul', 'on', true);
  update licencies set user_id = null where id = p_licencie;
end $$;
revoke all on function delier_compte(uuid) from public, anon;
grant execute on function delier_compte(uuid) to authenticated;

-- Premier administrateur : la fiche BELROSE Alizé (une seule fiche attendue)
insert into administrateurs_comptes (licencie_id)
select id from licencies where nom ilike 'belrose' and prenom ilike 'aliz%'
  and (select count(*) from licencies where nom ilike 'belrose' and prenom ilike 'aliz%') = 1
on conflict do nothing;

select count(*) as administrateurs_des_comptes, 'doit valoir 1' as attendu from administrateurs_comptes;
commit;
