-- =====================================================================
-- FTTT – Lot 1 / Script 1 : schéma de la base (tables, types, index)
-- À exécuter en premier dans Supabase > SQL Editor.
-- =====================================================================

-- ---------- Types énumérés ----------
create type role_app           as enum ('cadre_federal', 'responsable_club', 'juge_arbitre');
create type type_licence       as enum ('competition', 'loisir', 'dirigeant');
create type statut_licence     as enum ('active', 'expiree', 'annulee');
create type statut_licencie    as enum ('actif', 'archive');
create type sexe_licencie      as enum ('F', 'M');
create type type_competition   as enum ('simple', 'double', 'equipe');
create type statut_competition as enum ('brouillon', 'ouverte', 'cloturee', 'terminee');
create type type_inscription   as enum ('individuelle', 'paire', 'equipe');
create type statut_inscription as enum ('active', 'annulee');
create type statut_facture     as enum ('generee', 'envoyee', 'reglee', 'annulee');
create type statut_match       as enum ('saisi', 'valide', 'rejete');

-- ---------- Structure ----------
create table clubs (
  id                uuid primary key default gen_random_uuid(),
  nom               text not null unique,
  sigle             text,
  adresse           text,
  email_facturation text,
  actif             boolean not null default true,
  created_at        timestamptz not null default now()
);

create table saisons (
  id         uuid primary key default gen_random_uuid(),
  libelle    text not null unique,          -- ex. '2026-2027'
  date_debut date not null,                 -- 1er juillet
  date_fin   date not null,                 -- 30 juin
  check (date_fin > date_debut)
);

create table licencies (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid unique references auth.users(id) on delete set null,
  nom                   text not null,
  prenom                text not null,
  date_naissance        date not null,
  sexe                  sexe_licencie not null,
  club_id               uuid references clubs(id),
  email                 text,
  telephone             text,
  handicap              boolean not null default false,
  points                numeric(7,1) not null default 500,   -- modifié uniquement par le recalcul
  representant_legal_id uuid references licencies(id),
  statut                statut_licencie not null default 'actif',
  date_archivage        date,
  created_at            timestamptz not null default now()
);
create index on licencies (club_id);
create index on licencies (statut);
create index on licencies (nom, prenom, date_naissance);

create table licences (
  id          uuid primary key default gen_random_uuid(),
  licencie_id uuid not null references licencies(id),
  saison_id   uuid not null references saisons(id),
  club_id     uuid not null references clubs(id),
  type        type_licence not null,
  numero      text unique,
  statut      statut_licence not null default 'active',
  created_at  timestamptz not null default now(),
  unique (licencie_id, saison_id)
);
create index on licences (club_id);

create table attributions_roles (
  id          uuid primary key default gen_random_uuid(),
  licencie_id uuid not null references licencies(id) on delete cascade,
  role        role_app not null,
  club_id     uuid references clubs(id),
  created_at  timestamptz not null default now(),
  check (role <> 'responsable_club' or club_id is not null),
  unique nulls not distinct (licencie_id, role, club_id)
);

-- ---------- Compétitions et inscriptions ----------
create table competitions (
  id                       uuid primary key default gen_random_uuid(),
  nom                      text not null,
  saison_id                uuid not null references saisons(id),
  lieu                     text,
  date_debut               date not null,
  date_fin                 date not null,
  type                     type_competition not null,
  coefficient              numeric(3,2) not null check (coefficient in (0.50, 0.75, 1.00, 1.25, 1.50)),
  montant_xpf              integer not null default 0 check (montant_xpf >= 0),  -- par participant
  date_limite_inscription  date,
  statut                   statut_competition not null default 'brouillon',
  created_at               timestamptz not null default now(),
  check (date_fin >= date_debut)
);
create index on competitions (saison_id);

create table competition_juges (
  id             uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions(id) on delete cascade,
  licencie_id    uuid not null references licencies(id),
  unique (competition_id, licencie_id)
);

create table inscriptions (
  id             uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions(id),
  club_id        uuid not null references clubs(id),
  type           type_inscription not null,
  statut         statut_inscription not null default 'active',
  saisi_par      uuid references licencies(id),
  created_at     timestamptz not null default now()
);
create index on inscriptions (competition_id);
create index on inscriptions (club_id);

create table inscription_participants (
  id               uuid primary key default gen_random_uuid(),
  inscription_id   uuid not null references inscriptions(id) on delete cascade,
  licencie_id      uuid not null references licencies(id),
  rang             integer,                     -- ordre dans l'équipe
  points_reference numeric(7,1),                -- points figés à l'ouverture
  unique (inscription_id, licencie_id)
);
create index on inscription_participants (licencie_id);

create table factures (
  id             uuid primary key default gen_random_uuid(),
  inscription_id uuid not null unique references inscriptions(id),
  numero         text not null unique,
  club_id        uuid not null references clubs(id),
  montant_xpf    integer not null check (montant_xpf >= 0),
  statut         statut_facture not null default 'generee',
  date_envoi     timestamptz,
  pdf_path       text,
  created_at     timestamptz not null default now()
);
create index on factures (club_id);

-- ---------- Matchs, scores, points ----------
create table matchs (
  id              uuid primary key default gen_random_uuid(),
  competition_id  uuid not null references competitions(id),
  tour            text,
  juge_id         uuid references licencies(id),
  statut          statut_match not null default 'saisi',
  valide_par      uuid references licencies(id),
  date_validation timestamptz,
  created_at      timestamptz not null default now()
);
create index on matchs (competition_id);

create table participants_match (
  id            uuid primary key default gen_random_uuid(),
  match_id      uuid not null references matchs(id) on delete cascade,
  licencie_id   uuid not null references licencies(id),
  cote          text not null check (cote in ('A', 'B')),
  sets_gagnes   integer not null default 0 check (sets_gagnes >= 0),
  -- renseignés uniquement à la validation du match :
  points_avant  numeric(7,1),
  ecart         numeric(7,1),
  points_bruts  numeric(5,1),
  points_finaux numeric(5,1),
  unique (match_id, licencie_id),
  unique (match_id, cote)
);
create index on participants_match (licencie_id);

create table manches (
  id       uuid primary key default gen_random_uuid(),
  match_id uuid not null references matchs(id) on delete cascade,
  numero   integer not null,
  score_a  integer not null check (score_a >= 0),
  score_b  integer not null check (score_b >= 0),
  unique (match_id, numero)
);

create table bareme (
  id              uuid primary key default gen_random_uuid(),
  ecart_min       integer,                      -- null = pas de borne basse
  ecart_max       integer,                      -- null = pas de borne haute
  points_victoire numeric(4,1) not null,
  points_defaite  numeric(4,1) not null
);

create table mouvements_points (
  id          uuid primary key default gen_random_uuid(),
  licencie_id uuid not null references licencies(id),
  match_id    uuid not null references matchs(id),
  saison_id   uuid not null references saisons(id),
  mois        date not null,                    -- 1er jour du mois comptable
  points      numeric(5,1) not null,            -- après coefficient
  created_at  timestamptz not null default now(),
  unique (match_id, licencie_id)
);
create index on mouvements_points (licencie_id, mois);

create table classements_mensuels (
  id          uuid primary key default gen_random_uuid(),
  licencie_id uuid not null references licencies(id),
  saison_id   uuid not null references saisons(id),
  mois        date not null,
  points      numeric(7,1) not null,
  rang        integer,
  categorie   text,
  unique (licencie_id, mois)
);
create index on classements_mensuels (saison_id, mois);

-- ---------- Journal des modifications ----------
create table journal (
  id                bigint generated always as identity primary key,
  date_action       timestamptz not null default now(),
  user_id           uuid,
  table_name        text not null,
  enregistrement_id text,
  action            text not null,
  avant             jsonb,
  apres             jsonb
);
create index on journal (table_name, date_action desc);
