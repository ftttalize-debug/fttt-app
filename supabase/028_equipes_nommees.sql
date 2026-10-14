-- =====================================================================
-- FTTT – Script 028 : équipes nommées (lot B)
-- À exécuter après 027. Une seule requête, rien d'autre dedans. Relançable.
-- 1) Nom d'équipe (ex. « AITO 1 »), unique dans une compétition ; nom automatique si laissé vide
-- 2) Tarif d'une équipe = un montant par équipe inscrite (et non par joueur)
-- 3) Une équipe est inscrite une seule fois pour toute la compétition ; ajouts et retraits de joueurs = « Modifier »
-- =====================================================================
begin;

alter table inscriptions add column if not exists nom_equipe text;
create unique index if not exists inscriptions_nom_equipe_unique
  on inscriptions (competition_id, lower(nom_equipe)) where statut = 'active' and nom_equipe is not null;

-- ---------- Factures : une équipe = 1 × le tarif ----------
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
    select i.id, ip.club_id, case when i.type = 'equipe' then 1 else count(ip.id) end as n
      from inscriptions i
      join inscription_participants ip on ip.inscription_id = i.id
     where i.competition_id = p_competition and i.statut = 'active'
       and not exists (select 1 from factures f where f.inscription_id = i.id and f.club_id = ip.club_id)
     group by i.id, i.type, ip.club_id
     order by ip.club_id, i.id
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

-- ---------- Inscription : nom d'équipe ----------
drop function if exists enregistrer_inscription(uuid, uuid, uuid[], uuid);
create or replace function enregistrer_inscription(
  p_competition uuid, p_club uuid, p_joueurs uuid[], p_inscription uuid default null, p_nom_equipe text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  c competitions;
  v_id uuid := p_inscription;
  v_moi uuid := mon_licencie_id();
  v_type type_inscription;
  v_nom text;
  v_club text;
  v_k int;
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
    if exists (select 1 from inscription_participants where inscription_id = v_id and club_id is distinct from p_club) then
      raise exception 'Ce double réunit deux clubs : annule-le puis recrée-le, ou contacte la fédération.';
    end if;
  end if;

  perform _controle_inscription(c, p_club, p_joueurs, v_id);

  -- Nom de l'équipe
  if c.type = 'equipe' then
    v_nom := nullif(trim(coalesce(p_nom_equipe, '')), '');
    if v_nom is null and v_id is not null then
      select nom_equipe into v_nom from inscriptions where id = v_id;
    end if;
    if v_nom is null then
      select nom into v_club from clubs where id = p_club;
      v_k := (select count(*) from inscriptions where competition_id = p_competition and club_id = p_club
                 and statut = 'active' and type = 'equipe' and id is distinct from v_id) + 1;
      v_nom := v_club || ' ' || v_k;
      while exists (select 1 from inscriptions where competition_id = p_competition and statut = 'active'
                       and lower(nom_equipe) = lower(v_nom) and id is distinct from v_id) loop
        v_k := v_k + 1;
        v_nom := v_club || ' ' || v_k;
      end loop;
    elsif exists (select 1 from inscriptions where competition_id = p_competition and statut = 'active'
                     and lower(nom_equipe) = lower(v_nom) and id is distinct from v_id) then
      raise exception 'Une équipe porte déjà le nom « % » dans cette compétition.', v_nom;
    end if;
  end if;

  if v_id is null then
    insert into inscriptions (competition_id, club_id, type, statut, saisi_par, nom_equipe)
    values (p_competition, p_club, v_type, 'active', v_moi, v_nom) returning id into v_id;
  else
    delete from inscription_participants where inscription_id = v_id;
    if c.type = 'equipe' then update inscriptions set nom_equipe = v_nom where id = v_id; end if;
  end if;

  for i in 1 .. array_length(p_joueurs, 1) loop
    insert into inscription_participants (inscription_id, licencie_id, rang, points_reference)
    select v_id, l.id, i, l.points from licencies l where l.id = p_joueurs[i];
  end loop;
  -- Si une facture existe déjà : mise à jour du montant tant qu'elle n'est pas envoyée
  select * into f from factures where inscription_id = v_id and club_id = p_club;
  if found then
    if f.statut <> 'generee' then
      raise exception 'La facture % est déjà envoyée ou réglée : contacte la fédération.', f.numero;
    end if;
    update factures set montant_xpf = case when c.type = 'equipe' then c.montant_xpf else array_length(p_joueurs, 1) * c.montant_xpf end
     where id = f.id;
  end if;
  return v_id;
end $$;
revoke execute on function enregistrer_inscription(uuid, uuid, uuid[], uuid, text) from public, anon;
grant execute on function enregistrer_inscription(uuid, uuid, uuid[], uuid, text) to authenticated;

select 'ok : ' || count(*) || ' inscriptions' as controle from inscriptions;
commit;
