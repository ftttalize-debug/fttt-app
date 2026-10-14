-- =====================================================================
-- FTTT – Script 029 : rencontres par équipes (lot C)
-- À exécuter après 028. Une seule requête, rien d'autre dedans. Relançable.
-- 1) Format d'une rencontre par tableau : nombre de simples et de doubles (ex. D1 : 16 + 2 ; D2 : 9 + 1)
-- 2) Rencontres (équipe A contre équipe B, par tour), feuille de rencontre = composition de chaque équipe
-- 3) Matchs d'une rencontre : joueurs choisis parmi les joueurs alignés ; les doubles comptent pour la rencontre
--    mais ne donnent jamais de points (règle déjà appliquée à la validation)
-- =====================================================================
begin;

alter table competitions add column if not exists nb_simples integer check (nb_simples is null or nb_simples >= 0);
alter table competitions add column if not exists nb_doubles integer check (nb_doubles is null or nb_doubles >= 0);

create table if not exists rencontres (
  id             uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions(id) on delete cascade,
  tour           text not null,
  date_rencontre date,
  equipe_a       uuid not null references inscriptions(id),
  equipe_b       uuid not null references inscriptions(id),
  created_at     timestamptz not null default now(),
  check (equipe_a <> equipe_b)
);
create index if not exists rencontres_competition_idx on rencontres (competition_id);

create table if not exists composition_rencontre (
  id             uuid primary key default gen_random_uuid(),
  rencontre_id   uuid not null references rencontres(id) on delete cascade,
  inscription_id uuid not null references inscriptions(id),
  licencie_id    uuid not null references licencies(id),
  rang           integer,
  unique (rencontre_id, licencie_id)
);
create index if not exists composition_rencontre_idx on composition_rencontre (rencontre_id);

alter table matchs add column if not exists rencontre_id uuid references rencontres(id) on delete cascade;
create index if not exists matchs_rencontre_idx on matchs (rencontre_id);

-- ---------- Droits de lecture ; l'écriture passe uniquement par les fonctions ----------
create or replace function peut_voir_rencontre(p_rencontre uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select est_cadre()
    or exists (select 1 from rencontres r
                where r.id = p_rencontre
                  and (est_juge_de(r.competition_id)
                       or exists (select 1 from inscriptions i where i.id in (r.equipe_a, r.equipe_b) and est_responsable_de(i.club_id))))
$$;
grant execute on function peut_voir_rencontre(uuid) to authenticated;

alter table rencontres enable row level security;
alter table composition_rencontre enable row level security;
drop policy if exists rencontres_cadre on rencontres;
drop policy if exists rencontres_lecture on rencontres;
create policy rencontres_cadre on rencontres for all using (est_cadre()) with check (est_cadre());
create policy rencontres_lecture on rencontres for select to authenticated using (peut_voir_rencontre(id));
drop policy if exists composition_cadre on composition_rencontre;
drop policy if exists composition_lecture on composition_rencontre;
create policy composition_cadre on composition_rencontre for all using (est_cadre()) with check (est_cadre());
create policy composition_lecture on composition_rencontre for select to authenticated using (peut_voir_rencontre(rencontre_id));

drop trigger if exists trg_journal on rencontres;
create trigger trg_journal after insert or update or delete on rencontres for each row execute function journaliser();
drop trigger if exists trg_journal on composition_rencontre;
create trigger trg_journal after insert or update or delete on composition_rencontre for each row execute function journaliser();

-- ---------- Créer une rencontre ----------
create or replace function creer_rencontre(p_competition uuid, p_tour text, p_date date, p_equipe_a uuid, p_equipe_b uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  c competitions;
  v_id uuid;
begin
  select * into c from competitions where id = p_competition;
  if not found then raise exception 'Compétition introuvable.'; end if;
  if not (est_cadre() or est_juge_de(p_competition)) then raise exception 'Tu n''es pas juge-arbitre de cette compétition.'; end if;
  if c.type <> 'equipe' then raise exception 'Les rencontres ne concernent que les compétitions par équipes.'; end if;
  if est_cadre() then
    if c.statut not in ('cloturee', 'terminee') then raise exception 'Les rencontres se créent une fois les inscriptions closes.'; end if;
  elsif c.statut <> 'cloturee' then
    raise exception 'La saisie est fermée pour cette compétition.';
  end if;
  if coalesce(trim(p_tour), '') = '' then raise exception 'Indique le tour (ex. Journée 1).'; end if;
  if p_equipe_a = p_equipe_b then raise exception 'Choisis deux équipes différentes.'; end if;
  if (select count(*) from inscriptions where id in (p_equipe_a, p_equipe_b) and competition_id = p_competition
        and statut = 'active' and type = 'equipe') <> 2 then
    raise exception 'Équipe introuvable dans cette compétition.';
  end if;
  if exists (select 1 from rencontres where competition_id = p_competition and tour = trim(p_tour)
              and ((equipe_a = p_equipe_a and equipe_b = p_equipe_b) or (equipe_a = p_equipe_b and equipe_b = p_equipe_a))) then
    raise exception 'Cette rencontre existe déjà pour ce tour.';
  end if;
  insert into rencontres (competition_id, tour, date_rencontre, equipe_a, equipe_b)
  values (p_competition, trim(p_tour), p_date, p_equipe_a, p_equipe_b) returning id into v_id;
  return v_id;
end $$;

-- ---------- Supprimer une rencontre sans match ----------
create or replace function supprimer_rencontre(p_rencontre uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r rencontres;
begin
  select * into r from rencontres where id = p_rencontre;
  if not found then raise exception 'Rencontre introuvable.'; end if;
  if not (est_cadre() or est_juge_de(r.competition_id)) then raise exception 'Droits insuffisants.'; end if;
  if exists (select 1 from matchs where rencontre_id = p_rencontre) then
    raise exception 'Supprime d''abord les matchs de cette rencontre.';
  end if;
  delete from rencontres where id = p_rencontre;
end $$;

-- ---------- Feuille de rencontre : joueurs alignés par une équipe ----------
create or replace function enregistrer_composition(p_rencontre uuid, p_inscription uuid, p_joueurs uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  r rencontres;
  c competitions;
  i int;
begin
  select * into r from rencontres where id = p_rencontre;
  if not found then raise exception 'Rencontre introuvable.'; end if;
  select * into c from competitions where id = r.competition_id;
  if not (est_cadre() or est_juge_de(r.competition_id)) then raise exception 'Droits insuffisants.'; end if;
  if not est_cadre() and c.statut <> 'cloturee' then raise exception 'La saisie est fermée pour cette compétition.'; end if;
  if p_inscription not in (r.equipe_a, r.equipe_b) then raise exception 'Cette équipe ne joue pas cette rencontre.'; end if;
  if coalesce(array_length(p_joueurs, 1), 0) = 0 then raise exception 'Aligne au moins un joueur.'; end if;
  if (select count(distinct x) from unnest(p_joueurs) x) <> array_length(p_joueurs, 1) then
    raise exception 'Un joueur est choisi deux fois.';
  end if;
  if exists (select 1 from unnest(p_joueurs) x
              where not exists (select 1 from inscription_participants ip where ip.inscription_id = p_inscription and ip.licencie_id = x)) then
    raise exception 'Un des joueurs ne fait pas partie de cette équipe.';
  end if;
  -- on ne retire pas un joueur qui a déjà un match dans cette rencontre
  if exists (select 1 from composition_rencontre cr
              join participants_match pm on pm.licencie_id = cr.licencie_id
              join matchs m on m.id = pm.match_id and m.rencontre_id = p_rencontre
             where cr.rencontre_id = p_rencontre and cr.inscription_id = p_inscription and not (cr.licencie_id = any(p_joueurs))) then
    raise exception 'Un joueur retiré a déjà un match dans cette rencontre : supprime ou corrige ce match d''abord.';
  end if;
  delete from composition_rencontre where rencontre_id = p_rencontre and inscription_id = p_inscription;
  for i in 1 .. array_length(p_joueurs, 1) loop
    insert into composition_rencontre (rencontre_id, inscription_id, licencie_id, rang) values (p_rencontre, p_inscription, p_joueurs[i], i);
  end loop;
end $$;

-- ---------- Saisir ou corriger un match d'une rencontre ----------
create or replace function saisir_match_rencontre(
  p_rencontre uuid, p_type text, p_sets_gagnants integer,
  p_cote_a uuid[], p_cote_b uuid[], p_manches jsonb, p_match uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  r rencontres;
  c competitions;
  v_id uuid;
  v_n int;
begin
  select * into r from rencontres where id = p_rencontre;
  if not found then raise exception 'Rencontre introuvable.'; end if;
  select * into c from competitions where id = r.competition_id;
  if exists (select 1 from unnest(p_cote_a) x
              where not exists (select 1 from composition_rencontre cr where cr.rencontre_id = p_rencontre and cr.inscription_id = r.equipe_a and cr.licencie_id = x))
     or exists (select 1 from unnest(p_cote_b) x
              where not exists (select 1 from composition_rencontre cr where cr.rencontre_id = p_rencontre and cr.inscription_id = r.equipe_b and cr.licencie_id = x)) then
    raise exception 'Les joueurs doivent être alignés dans la feuille de rencontre (équipe A à gauche, équipe B à droite).';
  end if;
  if p_match is null then
    select count(*) into v_n from matchs where rencontre_id = p_rencontre and type_match = p_type;
    if p_type = 'simple' and c.nb_simples is not null and v_n >= c.nb_simples then
      raise exception 'Cette rencontre compte déjà ses % simples.', c.nb_simples;
    end if;
    if p_type = 'double' and c.nb_doubles is not null and v_n >= c.nb_doubles then
      raise exception 'Cette rencontre compte déjà ses % doubles.', c.nb_doubles;
    end if;
  elsif not exists (select 1 from matchs where id = p_match and rencontre_id = p_rencontre) then
    raise exception 'Match introuvable dans cette rencontre.';
  end if;
  v_id := saisir_match(r.competition_id, r.tour, p_type, p_sets_gagnants, p_cote_a, p_cote_b, p_manches, p_match);
  update matchs set rencontre_id = p_rencontre where id = v_id and rencontre_id is distinct from p_rencontre;
  return v_id;
end $$;

revoke execute on function creer_rencontre(uuid, text, date, uuid, uuid), supprimer_rencontre(uuid),
  enregistrer_composition(uuid, uuid, uuid[]), saisir_match_rencontre(uuid, text, integer, uuid[], uuid[], jsonb, uuid) from public, anon;
grant execute on function creer_rencontre(uuid, text, date, uuid, uuid), supprimer_rencontre(uuid),
  enregistrer_composition(uuid, uuid, uuid[]), saisir_match_rencontre(uuid, text, integer, uuid[], uuid[], jsonb, uuid) to authenticated;

select 'ok : ' || count(*) || ' compétitions' as controle from competitions;
commit;
