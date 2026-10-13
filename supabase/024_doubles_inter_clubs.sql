-- =====================================================================
-- FTTT – Script 024 : doubles entre deux clubs + proposition de double par les athlètes
-- À exécuter après 023. Une seule requête, rien d'autre dedans. Relançable.
-- 1) Chaque participant d'une inscription porte son club : un double peut réunir deux clubs.
-- 2) Facturation : une facture par club et par inscription (chaque club paie son joueur).
-- 3) Le club du partenaire voit le double (lecture seule) ; le nom est copié pour ne pas ouvrir la fiche.
-- 4) Athlètes : proposition de double avec le n° de licence du partenaire, confirmée par le partenaire.
-- =====================================================================
begin;
select set_config('app.recalcul', 'on', true);

-- ---------- 1) Club et nom affiché sur chaque participant ----------
alter table inscription_participants add column if not exists club_id uuid references clubs(id);
alter table inscription_participants add column if not exists nom_affiche text;
update inscription_participants ip set club_id = i.club_id from inscriptions i where i.id = ip.inscription_id and ip.club_id is null;
update inscription_participants ip set nom_affiche = l.prenom || ' ' || l.nom from licencies l where l.id = ip.licencie_id and ip.nom_affiche is null;
alter table inscription_participants alter column club_id set not null;
create index if not exists inscription_participants_club_idx on inscription_participants (club_id);

create or replace function participant_defauts() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.club_id is null then
    select club_id into new.club_id from inscriptions where id = new.inscription_id;
  end if;
  if new.nom_affiche is null then
    select prenom || ' ' || nom into new.nom_affiche from licencies where id = new.licencie_id;
  end if;
  return new;
end $$;
drop trigger if exists trg_participant_defauts on inscription_participants;
create trigger trg_participant_defauts before insert on inscription_participants
  for each row execute function participant_defauts();

-- ---------- 2) Factures : une par club et par inscription ----------
alter table factures drop constraint if exists factures_inscription_id_key;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'factures_inscription_club_key') then
    alter table factures add constraint factures_inscription_club_key unique (inscription_id, club_id);
  end if;
end $$;

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
    select i.id, ip.club_id, count(ip.id) as n
      from inscriptions i
      join inscription_participants ip on ip.inscription_id = i.id
     where i.competition_id = p_competition and i.statut = 'active'
       and not exists (select 1 from factures f where f.inscription_id = i.id and f.club_id = ip.club_id)
     group by i.id, ip.club_id
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
    if exists (select 1 from inscription_participants where inscription_id = v_id and club_id is distinct from p_club) then
      raise exception 'Ce double réunit deux clubs : annule-le puis recrée-le, ou contacte la fédération.';
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
  select * into f from factures where inscription_id = v_id and club_id = p_club;
  if found then
    if f.statut <> 'generee' then
      raise exception 'La facture % est déjà envoyée ou réglée : contacte la fédération.', f.numero;
    end if;
    update factures set montant_xpf = array_length(p_joueurs, 1) * c.montant_xpf where id = f.id;
  end if;
  return v_id;
end $$;

-- ---------- 3) Le club du partenaire voit le double ----------
create or replace function peut_voir_inscription(p_insc uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select est_cadre()
    or exists (select 1 from inscriptions i
               where i.id = p_insc and (est_responsable_de(i.club_id) or est_juge_de(i.competition_id)))
    or exists (select 1 from inscription_participants ip
               where ip.inscription_id = p_insc and (ip.licencie_id = mon_licencie_id() or est_responsable_de(ip.club_id)))
$$;

-- ---------- 4) Propositions de double ----------
create table if not exists propositions_double (
  id             uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions(id) on delete cascade,
  proposant_id   uuid not null references licencies(id),
  partenaire_id  uuid not null references licencies(id),
  statut         text not null default 'en_attente' check (statut in ('en_attente', 'confirmee', 'refusee', 'annulee')),
  created_at     timestamptz not null default now(),
  check (proposant_id <> partenaire_id)
);
create unique index if not exists propositions_double_unique on propositions_double (competition_id, proposant_id, partenaire_id) where statut = 'en_attente';
alter table propositions_double enable row level security;   -- aucune règle : seules les fonctions y accèdent
drop trigger if exists trg_journal on propositions_double;
create trigger trg_journal after insert or update or delete on propositions_double for each row execute function journaliser();

-- Motif pour lequel un athlète ne peut pas s'inscrire à une compétition (null = il peut)
create or replace function _motif_indisponible(c competitions, l licencies) returns text
language sql stable security definer set search_path = public as $$
  select case
    when l.statut <> 'actif' then 'Licence non active cette saison'
    when l.club_id is null then 'Aucun club'
    when not exists (select 1 from licences lc where lc.licencie_id = l.id and lc.saison_id = c.saison_id and lc.statut = 'active')
      then 'Pas de licence pour la saison de cette compétition'
    when not c.ouverte_a_tous and not exists (select 1 from licences lc where lc.licencie_id = l.id and lc.saison_id = c.saison_id
                                                and lc.statut = 'active' and lc.type = 'competition')
      then 'Licence compétition requise'
    when exists (select 1 from inscription_participants ip join inscriptions i on i.id = ip.inscription_id
                  where i.competition_id = c.id and i.statut = 'active' and ip.licencie_id = l.id)
      then 'Déjà inscrit(e)'
    else null
  end
$$;
revoke execute on function _motif_indisponible(competitions, licencies) from public, anon, authenticated;

-- Compétitions ouvertes vues par l'athlète (simple, double, équipe)
create or replace function athlete_competitions(p_numero text, p_naissance date) returns json
language plpgsql security definer set search_path = public as $$
declare
  l licencies;
  v_res json;
begin
  l := _athlete(p_numero, p_naissance);
  if l.id is null then return json_build_object('erreur', 'Numéro de licence ou date de naissance incorrect.'); end if;
  select coalesce(json_agg(x order by x.date_debut), '[]'::json) into v_res from (
    select c.id, c.nom, c.lieu, c.date_debut, c.date_fin, c.type::text as type, c.coefficient, c.montant_xpf,
           c.date_limite_inscription as date_limite,
           exists (select 1 from inscription_participants ip join inscriptions i on i.id = ip.inscription_id
                    where i.competition_id = c.id and i.statut = 'active' and ip.licencie_id = l.id) as inscrit,
           (select p2.nom_affiche from inscription_participants ip
              join inscriptions i on i.id = ip.inscription_id and i.type = 'paire' and i.statut = 'active'
              join inscription_participants p2 on p2.inscription_id = i.id and p2.licencie_id <> l.id
             where i.competition_id = c.id and ip.licencie_id = l.id limit 1) as partenaire,
           case when c.type = 'equipe' then 'Inscription par ton club'
                else case when exists (select 1 from inscription_participants ip join inscriptions i on i.id = ip.inscription_id
                                        where i.competition_id = c.id and i.statut = 'active' and ip.licencie_id = l.id)
                          then null else _motif_indisponible(c, l) end
           end as indisponible,
           (select coalesce(json_agg(json_build_object('id', pd.id, 'partenaire', pa.prenom || ' ' || pa.nom,
                                                       'club', (select nom from clubs where id = pa.club_id))), '[]'::json)
              from propositions_double pd join licencies pa on pa.id = pd.partenaire_id
             where pd.competition_id = c.id and pd.proposant_id = l.id and pd.statut = 'en_attente') as propositions_envoyees,
           (select coalesce(json_agg(json_build_object('id', pd.id, 'proposant', pr.prenom || ' ' || pr.nom,
                                                       'club', (select nom from clubs where id = pr.club_id))), '[]'::json)
              from propositions_double pd join licencies pr on pr.id = pd.proposant_id
             where pd.competition_id = c.id and pd.partenaire_id = l.id and pd.statut = 'en_attente') as propositions_recues
      from competitions c
     where c.statut = 'ouverte' and competition_ouverte(c.id)
  ) x;
  return json_build_object('competitions', v_res);
end $$;

-- Proposer un double à un partenaire (par son n° de licence)
create or replace function athlete_proposer_double(p_numero text, p_naissance date, p_competition uuid, p_partenaire text) returns json
language plpgsql security definer set search_path = public as $$
declare
  l licencies; pa licencies; c competitions; v_motif text;
begin
  l := _athlete(p_numero, p_naissance);
  if l.id is null then return json_build_object('erreur', 'Numéro de licence ou date de naissance incorrect.'); end if;
  select * into c from competitions where id = p_competition;
  if not found or c.type <> 'double' then raise exception 'Cette compétition n''est pas un double.'; end if;
  if not competition_ouverte(c.id) then raise exception 'Les inscriptions sont fermées pour cette compétition.'; end if;
  v_motif := _motif_indisponible(c, l);
  if v_motif is not null then raise exception '%', v_motif; end if;
  select * into pa from licencies where numero_licence = upper(trim(coalesce(p_partenaire, '')));
  if not found then raise exception 'Numéro de licence du partenaire introuvable.'; end if;
  if pa.id = l.id then raise exception 'Choisis un autre joueur comme partenaire.'; end if;
  v_motif := _motif_indisponible(c, pa);
  if v_motif is not null then raise exception '% % : %', pa.prenom, pa.nom, lower(v_motif); end if;
  update propositions_double set statut = 'annulee'
   where competition_id = c.id and proposant_id = l.id and statut = 'en_attente';
  insert into propositions_double (competition_id, proposant_id, partenaire_id) values (c.id, l.id, pa.id);
  return json_build_object('ok', true, 'partenaire', pa.prenom || ' ' || pa.nom, 'club', (select nom from clubs where id = pa.club_id));
end $$;

-- Annuler une proposition envoyée
create or replace function athlete_annuler_proposition(p_numero text, p_naissance date, p_proposition uuid) returns json
language plpgsql security definer set search_path = public as $$
declare l licencies;
begin
  l := _athlete(p_numero, p_naissance);
  if l.id is null then return json_build_object('erreur', 'Numéro de licence ou date de naissance incorrect.'); end if;
  update propositions_double set statut = 'annulee' where id = p_proposition and proposant_id = l.id and statut = 'en_attente';
  if not found then raise exception 'Proposition introuvable ou déjà traitée.'; end if;
  return json_build_object('ok', true);
end $$;

-- Accepter ou refuser une proposition reçue : l'acceptation inscrit le double
create or replace function athlete_repondre_double(p_numero text, p_naissance date, p_proposition uuid, p_accepter boolean) returns json
language plpgsql security definer set search_path = public as $$
declare
  l licencies; pr licencies; p propositions_double; c competitions; v_motif text; v_ins uuid;
begin
  l := _athlete(p_numero, p_naissance);
  if l.id is null then return json_build_object('erreur', 'Numéro de licence ou date de naissance incorrect.'); end if;
  select * into p from propositions_double where id = p_proposition and partenaire_id = l.id and statut = 'en_attente';
  if not found then raise exception 'Proposition introuvable ou déjà traitée.'; end if;
  if not p_accepter then
    update propositions_double set statut = 'refusee' where id = p.id;
    return json_build_object('ok', true);
  end if;
  select * into c from competitions where id = p.competition_id;
  if not competition_ouverte(c.id) then raise exception 'Les inscriptions sont fermées pour cette compétition.'; end if;
  select * into pr from licencies where id = p.proposant_id;
  v_motif := _motif_indisponible(c, l);
  if v_motif is not null then raise exception '%', v_motif; end if;
  v_motif := _motif_indisponible(c, pr);
  if v_motif is not null then raise exception '% % : %', pr.prenom, pr.nom, lower(v_motif); end if;

  insert into inscriptions (competition_id, club_id, type, statut, saisi_par)
  values (c.id, pr.club_id, 'paire', 'active', l.id) returning id into v_ins;
  insert into inscription_participants (inscription_id, licencie_id, rang, points_reference, club_id) values
    (v_ins, pr.id, 1, pr.points, pr.club_id), (v_ins, l.id, 2, l.points, l.club_id);
  update propositions_double set statut = 'confirmee' where id = p.id;
  update propositions_double set statut = 'annulee'
   where competition_id = c.id and statut = 'en_attente'
     and (proposant_id in (pr.id, l.id) or partenaire_id in (pr.id, l.id));
  return json_build_object('ok', true);
end $$;

-- Se désinscrire : un double est annulé en entier (l'autre joueur est libre de se réinscrire)
create or replace function athlete_desinscrire(p_numero text, p_naissance date, p_competition uuid) returns json
language plpgsql security definer set search_path = public as $$
declare
  l licencies; v_ins uuid; v_type type_inscription;
begin
  l := _athlete(p_numero, p_naissance);
  if l.id is null then return json_build_object('erreur', 'Numéro de licence ou date de naissance incorrect.'); end if;
  if not competition_ouverte(p_competition) then
    raise exception 'Les inscriptions sont fermées : contacte ton club ou la fédération.';
  end if;
  select i.id, i.type into v_ins, v_type from inscriptions i join inscription_participants ip on ip.inscription_id = i.id
   where i.competition_id = p_competition and i.statut = 'active' and ip.licencie_id = l.id and i.type in ('individuelle', 'paire');
  if v_ins is null then raise exception 'Tu n''es pas inscrit(e) à cette compétition (ou ton club t''a inscrit(e) dans une équipe).'; end if;
  if v_type = 'paire' then
    update inscriptions set statut = 'annulee' where id = v_ins;
  else
    delete from inscription_participants where inscription_id = v_ins and licencie_id = l.id;
    if not exists (select 1 from inscription_participants where inscription_id = v_ins) then
      update inscriptions set statut = 'annulee' where id = v_ins;
    end if;
  end if;
  return json_build_object('ok', true);
end $$;

revoke execute on function athlete_proposer_double(text, date, uuid, text), athlete_annuler_proposition(text, date, uuid),
  athlete_repondre_double(text, date, uuid, boolean) from public;
grant execute on function athlete_proposer_double(text, date, uuid, text), athlete_annuler_proposition(text, date, uuid),
  athlete_repondre_double(text, date, uuid, boolean) to anon, authenticated;

select 'participants sans club : ' || count(*) as controle from inscription_participants where club_id is null;
commit;
