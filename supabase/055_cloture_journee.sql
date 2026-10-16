-- =====================================================================
-- FTTT – Script 055 : clôture d'une journée (tour) par tableau
-- À exécuter après 054. Relançable.
--  · Le juge-arbitre (ou le cadre) clôture une journée d'un tableau : plus de saisie ni de correction par les juges.
--  · Seul le cadre fédéral peut la rouvrir, ou continuer à corriger.
--  · Le verrou est dans la base : il vaut aussi si quelqu'un contourne l'application.
-- =====================================================================
begin;

alter table tours_competition add column if not exists cloture boolean not null default false;
alter table tours_competition add column if not exists cloture_par uuid references licencies(id) on delete set null;
alter table tours_competition add column if not exists date_cloture timestamptz;

create or replace function cloturer_tour(p_tour uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t tours_competition; c competitions;
begin
  select * into t from tours_competition where id = p_tour;
  if not found then raise exception 'Journée introuvable.'; end if;
  select * into c from competitions where id = t.competition_id;
  if not (est_cadre() or (est_juge_de(t.competition_id) and c.statut = 'cloturee')) then raise exception 'Droits insuffisants.'; end if;
  if t.cloture then return; end if;
  update tours_competition set cloture = true, cloture_par = mon_licencie_id(), date_cloture = now() where id = p_tour;
end $$;

create or replace function rouvrir_tour(p_tour uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not est_cadre() then raise exception 'Réservé au cadre fédéral'; end if;
  update tours_competition set cloture = false, cloture_par = null, date_cloture = null where id = p_tour;
  if not found then raise exception 'Journée introuvable.'; end if;
end $$;

-- Verrou : une journée clôturée n'accepte plus de modification, sauf du cadre fédéral
create or replace function _verrou_tour() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_comp uuid; v_tour text; v_rid uuid; v_closed boolean;
begin
  if tg_table_name = 'rencontres' then
    if tg_op = 'DELETE' then v_comp := old.competition_id; v_tour := old.tour; else v_comp := new.competition_id; v_tour := new.tour; end if;
  else
    if tg_op = 'DELETE' then v_rid := old.rencontre_id; else v_rid := new.rencontre_id; end if;
    if v_rid is null then return case when tg_op = 'DELETE' then old else new end; end if;
    select r.competition_id, r.tour into v_comp, v_tour from rencontres r where r.id = v_rid;
  end if;
  if v_comp is not null then
    select t.cloture into v_closed from tours_competition t where t.competition_id = v_comp and lower(t.nom) = lower(v_tour);
    if coalesce(v_closed, false) and not est_cadre() then
      raise exception 'Cette journée est clôturée pour ce tableau : demande au cadre fédéral de la rouvrir.';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

drop trigger if exists trg_verrou_tour on matchs;
create trigger trg_verrou_tour before insert or update or delete on matchs for each row execute function _verrou_tour();
drop trigger if exists trg_verrou_tour on composition_rencontre;
create trigger trg_verrou_tour before insert or update or delete on composition_rencontre for each row execute function _verrou_tour();
drop trigger if exists trg_verrou_tour on rencontres;
create trigger trg_verrou_tour before insert or update or delete on rencontres for each row execute function _verrou_tour();

revoke execute on function cloturer_tour(uuid), rouvrir_tour(uuid) from public, anon;
grant execute on function cloturer_tour(uuid), rouvrir_tour(uuid) to authenticated;
revoke execute on function _verrou_tour() from public, anon, authenticated;

select 'ok : clôture de journée' as controle;
commit;
