-- =====================================================================
-- FTTT – Script 046 : case « les athlètes peuvent s'inscrire eux-mêmes » sur chaque compétition
-- À exécuter après 044 (et 045 si lancé). Une seule requête, rien d'autre dedans. Relançable.
-- - Décochée : seuls le cadre fédéral et les responsables de club inscrivent ; l'athlète ne peut plus s'inscrire,
--   se désinscrire, proposer un double ni répondre à une proposition sur « Je m'inscris ».
-- - Cochée (par défaut, comme avant) : rien ne change. Les compétitions existantes restent ouvertes aux athlètes.
-- - Ne touche pas aux règles des clubs ni à « Inscriptions réservées à la fédération ».
-- =====================================================================
begin;

alter table competitions add column if not exists inscription_athletes boolean not null default true;

-- Motif d'indisponibilité affiché à l'athlète (sert aussi aux doubles : proposition et réponse)
create or replace function _motif_indisponible(c competitions, l licencies) returns text
language sql stable security definer set search_path = public as $$
  select case
    when not c.inscription_athletes then 'Inscription par ton club ou la fédération'
    when l.statut <> 'actif' then 'Licence non active cette saison'
    when l.club_id is null then 'Aucun club'
    when not exists (select 1 from licences lc where lc.licencie_id = l.id and lc.saison_id = c.saison_id and lc.statut = 'active')
      then 'Pas de licence pour la saison de cette compétition'
    when not c.ouverte_a_tous and not exists (select 1 from licences lc where lc.licencie_id = l.id and lc.saison_id = c.saison_id
                                                and lc.statut = 'active' and lc.type = 'competition')
      then 'Licence compétition requise'
    when _motif_genre_age(c, l) is not null then _motif_genre_age(c, l)
    when exists (select 1 from inscription_participants ip join inscriptions i on i.id = ip.inscription_id
                  where i.competition_id = c.id and i.statut = 'active' and ip.licencie_id = l.id)
      then 'Déjà inscrit(e)'
    else null
  end
$$;
revoke execute on function _motif_indisponible(competitions, licencies) from public, anon, authenticated;

-- Inscription et désinscription directes de l'athlète : on ajoute le contrôle au début des fonctions existantes
do $$
declare
  f text; v_def text; v_new text;
  v_ctrl text := 'if not coalesce((select inscription_athletes from competitions where id = p_competition), true) then raise exception ''Les inscriptions à cette compétition sont faites par ton club ou la fédération.''; end if;' || E'\n  if not competition_ouverte(';
begin
  foreach f in array array['athlete_inscrire', 'athlete_desinscrire'] loop
    select pg_get_functiondef(p.oid) into v_def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = f;
    if v_def is null then raise exception 'Fonction % introuvable', f; end if;
    if position('inscription_athletes' in v_def) = 0 then
      v_new := replace(v_def, 'if not competition_ouverte(', v_ctrl);
      if v_new = v_def then raise exception 'Fonction % : point d''insertion introuvable', f; end if;
      execute v_new;
    end if;
  end loop;
end $$;

-- Liste « Je m'inscris » : l'athlète voit le motif sur chaque compétition qui n'est pas ouverte aux inscriptions directes
-- (athlete_competitions utilise déjà _motif_indisponible pour les simples et doubles).

select count(*) filter (where not inscription_athletes) as competitions_sans_inscription_athlete, count(*) as competitions from competitions;
commit;
