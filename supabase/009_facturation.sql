-- =====================================================================
-- FTTT – Lot 4 / Script 9 : facturation
-- À exécuter après 008. Une seule requête, rien d'autre dedans.
-- Une facture par inscription, créée par le cadre fédéral une fois les
-- inscriptions closes. Numéro : FTTT-AAAA-0001 (AAAA = année de la compétition).
-- =====================================================================

create table if not exists compteurs_factures (
  annee   integer primary key,
  dernier integer not null default 0
);
alter table compteurs_factures enable row level security;   -- aucune politique : seule la fonction y touche

-- 1) Générer les factures d'une compétition (celles qui n'existent pas encore)
create or replace function generer_factures(p_competition uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare
  c competitions;
  r record;
  v_annee integer;
  v_num integer;
  v_nb integer := 0;
begin
  if not est_cadre() then raise exception 'Réservé au cadre fédéral'; end if;
  select * into c from competitions where id = p_competition;
  if not found then raise exception 'Compétition introuvable.'; end if;
  if c.statut not in ('cloturee', 'terminee') then
    raise exception 'Clôture d''abord les inscriptions.';
  end if;
  v_annee := extract(year from c.date_debut)::int;

  for r in
    select i.id, i.club_id, count(ip.id) as n
      from inscriptions i
      join inscription_participants ip on ip.inscription_id = i.id
     where i.competition_id = p_competition and i.statut = 'active'
       and not exists (select 1 from factures f where f.inscription_id = i.id)
     group by i.id, i.club_id
     order by i.club_id, i.id
  loop
    continue when r.n * c.montant_xpf = 0;
    insert into compteurs_factures (annee, dernier) values (v_annee, 1)
      on conflict (annee) do update set dernier = compteurs_factures.dernier + 1
      returning dernier into v_num;
    insert into factures (inscription_id, numero, club_id, montant_xpf, statut)
    values (r.id, 'FTTT-' || v_annee || '-' || lpad(v_num::text, 4, '0'), r.club_id, r.n * c.montant_xpf, 'generee');
    v_nb := v_nb + 1;
  end loop;
  return v_nb;
end $$;

-- 2) Une inscription annulée annule sa facture
create or replace function annuler_facture_inscription() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.statut = 'annulee' and old.statut <> 'annulee' then
    update factures set statut = 'annulee' where inscription_id = new.id and statut <> 'annulee';
  end if;
  return new;
end $$;
drop trigger if exists trg_annuler_facture on inscriptions;
create trigger trg_annuler_facture after update of statut on inscriptions
  for each row execute function annuler_facture_inscription();

-- 3) Changer l'état d'une facture (envoyée, réglée, annulée) — cadre fédéral
create or replace function changer_statut_facture(p_facture uuid, p_statut statut_facture) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not est_cadre() then raise exception 'Réservé au cadre fédéral'; end if;
  update factures set statut = p_statut,
         date_envoi = case when p_statut = 'envoyee' and date_envoi is null then now() else date_envoi end
   where id = p_facture;
  if not found then raise exception 'Facture introuvable.'; end if;
end $$;

-- 4) Enregistrer une inscription : met aussi à jour le montant d'une facture non envoyée
create or replace function enregistrer_inscription(
  p_competition uuid, p_club uuid, p_joueurs uuid[], p_inscription uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  c competitions;
  v_id uuid := p_inscription;
  v_moi uuid := mon_licencie_id();
  v_type type_inscription;
  i int;
  f factures;
begin
  select * into c from competitions where id = p_competition;
  if not found then raise exception 'Compétition introuvable.'; end if;
  if not (est_cadre() or est_responsable_de(p_club)) then
    raise exception 'Tu ne peux pas inscrire les joueurs de ce club.';
  end if;
  if est_cadre() then
    if c.statut not in ('ouverte', 'cloturee') then
      raise exception 'Les inscriptions ne sont possibles que compétition ouverte ou close.';
    end if;
  elsif not competition_ouverte(p_competition) then
    raise exception 'Les inscriptions sont fermées pour cette compétition.';
  end if;

  v_type := case c.type when 'simple' then 'individuelle' when 'double' then 'paire' else 'equipe' end;

  if v_id is null then
    if c.type = 'simple' and exists (select 1 from inscriptions
         where competition_id = p_competition and club_id = p_club and statut = 'active') then
      raise exception 'Ce club a déjà une inscription : modifie-la pour ajouter des joueurs.';
    end if;
  else
    if not exists (select 1 from inscriptions where id = v_id and competition_id = p_competition
                    and club_id = p_club and statut = 'active') then
      raise exception 'Inscription introuvable.';
    end if;
  end if;

  perform _controle_inscription(c, p_club, p_joueurs, v_id);

  if v_id is null then
    insert into inscriptions (competition_id, club_id, type, statut, saisi_par)
    values (p_competition, p_club, v_type, 'active', v_moi) returning id into v_id;
  else
    delete from inscription_participants where inscription_id = v_id;
  end if;

  for i in 1 .. array_length(p_joueurs, 1) loop
    insert into inscription_participants (inscription_id, licencie_id, rang, points_reference)
    select v_id, l.id, i, l.points from licencies l where l.id = p_joueurs[i];
  end loop;
  -- Si une facture existe déjà : mise à jour du montant tant qu'elle n'est pas envoyée
  select * into f from factures where inscription_id = v_id;
  if found then
    if f.statut <> 'generee' then
      raise exception 'La facture % est déjà envoyée ou réglée : contacte la fédération.', f.numero;
    end if;
    update factures set montant_xpf = array_length(p_joueurs, 1) * c.montant_xpf where id = f.id;
  end if;
  return v_id;
end $$;

revoke execute on function generer_factures(uuid) from public, anon;
revoke execute on function changer_statut_facture(uuid, statut_facture) from public, anon;
revoke execute on function annuler_facture_inscription() from public, anon, authenticated;
revoke execute on function enregistrer_inscription(uuid, uuid, uuid[], uuid) from public, anon;
grant execute on function generer_factures(uuid) to authenticated;
grant execute on function changer_statut_facture(uuid, statut_facture) to authenticated;
grant execute on function enregistrer_inscription(uuid, uuid, uuid[], uuid) to authenticated;
