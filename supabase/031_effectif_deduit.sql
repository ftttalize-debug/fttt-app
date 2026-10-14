-- =====================================================================
-- FTTT – Script 031 : équipes inscrites sans liste de joueurs ; l'effectif se déduit des matchs
-- À exécuter après 030. Une seule requête, rien d'autre dedans. Relançable.
-- 1) Le club inscrit une équipe (nom seulement). Aucun joueur à lister avant la compétition.
-- 2) Le juge-arbitre aligne n'importe quel licencié compétition du club (âge et genre contrôlés) ;
--    dès qu'un joueur a un match saisi, il fait partie de l'effectif de l'équipe.
-- 3) Un joueur qui a joué pour une équipe y reste pour toute la compétition (autre équipe refusée).
-- 4) Facture d'une équipe : par équipe, même sans joueur inscrit.
-- 5) Le cadre peut retirer un joueur de l'effectif tant qu'il n'a aucun match.
-- =====================================================================
begin;

-- ---------- Motif pour lequel un joueur ne peut pas jouer pour une équipe (null = possible) ----------
create or replace function _motif_joueur_equipe(c competitions, ins inscriptions, l licencies) returns text
language sql stable security definer set search_path = public as $$
  select case
    when l.club_id is distinct from ins.club_id then 'ne fait pas partie du club de cette équipe'
    when l.statut <> 'actif' then 'n''est pas licencié(e) cette saison'
    when not exists (select 1 from licences lc where lc.licencie_id = l.id and lc.saison_id = c.saison_id and lc.statut = 'active'
                       and (c.ouverte_a_tous or lc.type = 'competition'))
      then 'n''a pas de licence compétition pour la saison de cette compétition'
    when _motif_genre_age(c, l) is not null then lower(_motif_genre_age(c, l))
    when exists (select 1 from inscription_participants ip join inscriptions i2 on i2.id = ip.inscription_id
                  where i2.competition_id = c.id and i2.statut = 'active' and i2.type = 'equipe'
                    and i2.id <> ins.id and ip.licencie_id = l.id)
      then 'joue déjà pour une autre équipe de cette compétition'
    else null
  end
$$;
revoke execute on function _motif_joueur_equipe(competitions, inscriptions, licencies) from public, anon, authenticated;

-- ---------- Inscription : une équipe peut être inscrite sans joueur ----------
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
  v_n int := coalesce(array_length(p_joueurs, 1), 0);
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

  if c.type <> 'equipe' or v_n > 0 then
    perform _controle_inscription(c, p_club, p_joueurs, v_id);
  end if;

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
    -- une équipe sans liste fournie garde son effectif (déduit des matchs)
    if not (c.type = 'equipe' and v_n = 0) then
      delete from inscription_participants where inscription_id = v_id;
    end if;
    if c.type = 'equipe' then update inscriptions set nom_equipe = v_nom where id = v_id; end if;
  end if;

  for i in 1 .. v_n loop
    insert into inscription_participants (inscription_id, licencie_id, rang, points_reference)
    select v_id, l.id, i, l.points from licencies l where l.id = p_joueurs[i];
  end loop;

  select * into f from factures where inscription_id = v_id and club_id = p_club;
  if found then
    if f.statut <> 'generee' then
      raise exception 'La facture % est déjà envoyée ou réglée : contacte la fédération.', f.numero;
    end if;
    update factures set montant_xpf = case when c.type = 'equipe' then c.montant_xpf else v_n * c.montant_xpf end where id = f.id;
  end if;
  return v_id;
end $$;
revoke execute on function enregistrer_inscription(uuid, uuid, uuid[], uuid, text) from public, anon;
grant execute on function enregistrer_inscription(uuid, uuid, uuid[], uuid, text) to authenticated;

-- ---------- Factures : une équipe est facturée au club de l'équipe, même sans joueur ----------
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
    select x.id, x.club_id, x.n from (
      select i.id, i.club_id, 1 as n
        from inscriptions i
       where i.competition_id = p_competition and i.statut = 'active' and i.type = 'equipe'
      union all
      select i.id, ip.club_id, count(ip.id)::int
        from inscriptions i join inscription_participants ip on ip.inscription_id = i.id
       where i.competition_id = p_competition and i.statut = 'active' and i.type <> 'equipe'
       group by i.id, ip.club_id
    ) x
    where not exists (select 1 from factures f where f.inscription_id = x.id and f.club_id = x.club_id)
    order by x.club_id, x.id
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

-- ---------- Feuille de rencontre : tout licencié du club peut être aligné ----------
create or replace function enregistrer_composition(p_rencontre uuid, p_inscription uuid, p_joueurs uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  r rencontres;
  c competitions;
  ins inscriptions;
  l licencies;
  v_motif text;
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
  select * into ins from inscriptions where id = p_inscription;
  for l in select * from licencies where id = any(p_joueurs) loop
    v_motif := _motif_joueur_equipe(c, ins, l);
    if v_motif is not null then raise exception '% % %.', l.prenom, l.nom, v_motif; end if;
  end loop;
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

-- ---------- Match d'une rencontre : les joueurs entrent dans l'effectif de leur équipe ----------
create or replace function saisir_match_rencontre(
  p_rencontre uuid, p_type text, p_sets_gagnants integer,
  p_cote_a uuid[], p_cote_b uuid[], p_manches jsonb, p_match uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  r rencontres;
  c competitions;
  ins inscriptions;
  l licencies;
  v_id uuid;
  v_n int;
  v_motif text;
  v_equipe uuid;
  v_cote uuid[];
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

  -- rattachement à l'effectif (contrôles d'éligibilité et de blocage), avant la saisie du match
  foreach v_equipe in array array[r.equipe_a, r.equipe_b] loop
    select * into ins from inscriptions where id = v_equipe;
    v_cote := case when v_equipe = r.equipe_a then p_cote_a else p_cote_b end;
    for l in select * from licencies where id = any(v_cote) loop
      if not exists (select 1 from inscription_participants where inscription_id = v_equipe and licencie_id = l.id) then
        v_motif := _motif_joueur_equipe(c, ins, l);
        if v_motif is not null then raise exception '% % %.', l.prenom, l.nom, v_motif; end if;
        insert into inscription_participants (inscription_id, licencie_id, rang, points_reference, club_id)
        values (v_equipe, l.id, (select coalesce(max(rang), 0) + 1 from inscription_participants where inscription_id = v_equipe), l.points, l.club_id);
      end if;
    end loop;
  end loop;

  v_id := saisir_match(r.competition_id, r.tour, p_type, p_sets_gagnants, p_cote_a, p_cote_b, p_manches, p_match);
  update matchs set rencontre_id = p_rencontre where id = v_id and rencontre_id is distinct from p_rencontre;
  return v_id;
end $$;

-- ---------- Retirer un joueur de l'effectif (cadre) tant qu'il n'a aucun match ----------
create or replace function retirer_joueur_equipe(p_inscription uuid, p_licencie uuid) returns void
language plpgsql security definer set search_path = public as $$
declare ins inscriptions;
begin
  if not est_cadre() then raise exception 'Réservé au cadre fédéral.'; end if;
  select * into ins from inscriptions where id = p_inscription and type = 'equipe';
  if not found then raise exception 'Équipe introuvable.'; end if;
  if exists (select 1 from participants_match pm join matchs m on m.id = pm.match_id
              where m.competition_id = ins.competition_id and pm.licencie_id = p_licencie) then
    raise exception 'Ce joueur a déjà un match dans cette compétition : supprime ses matchs d''abord.';
  end if;
  delete from composition_rencontre where inscription_id = p_inscription and licencie_id = p_licencie;
  delete from inscription_participants where inscription_id = p_inscription and licencie_id = p_licencie;
end $$;
revoke execute on function retirer_joueur_equipe(uuid, uuid) from public, anon;
grant execute on function retirer_joueur_equipe(uuid, uuid) to authenticated;

select 'ok : ' || count(*) || ' inscriptions' as controle from inscriptions;
commit;
