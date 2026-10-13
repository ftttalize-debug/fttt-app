-- 018 : tolérance temporaire pour les mineurs actifs sans représentant légal
-- Règle conservée : on ne peut pas activer ni créer à la main un mineur sans représentant.
-- Exceptions : un import en masse (app.import = on), et une fiche déjà dans cet état avant la modification
-- (elle reste modifiable ; le représentant redevient obligatoire à la prochaine réactivation).

create or replace function verif_representant() returns trigger
language plpgsql as $$
begin
  if new.statut = 'actif'
     and new.date_naissance > (current_date - interval '18 years')::date
     and new.representant_legal_id is null then
    if current_setting('app.import', true) = 'on'
       or (tg_op = 'UPDATE' and old.statut = 'actif' and old.representant_legal_id is null) then
      return new;
    end if;
    raise exception 'Un représentant légal est obligatoire pour un licencié mineur actif';
  end if;
  return new;
end $$;
