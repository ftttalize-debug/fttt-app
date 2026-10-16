// Accès à la base Supabase : chargement des données et enregistrements.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.1/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'implicit' // le lien de réinitialisation fonctionne aussi s'il est ouvert sur un autre appareil
  }
});

/** Lit toutes les lignes d'une table, par pages de 1000 (limite de Supabase). */
async function toutLire(table, ordre) {
  const pas = 1000;
  let tout = [];
  for (let debut = 0; ; debut += pas) {
    let q = sb.from(table).select('*');
    if (ordre) q = q.order(ordre);
    q = q.order('id');
    const { data, error } = await q.range(debut, debut + pas - 1);
    if (error) throw error;
    tout = tout.concat(data);
    if (data.length < pas) break;
  }
  return tout;
}

/** Lecture tolérante : la table peut ne pas exister avant l'exécution du script SQL correspondant. */
async function lireSiPresente(table) {
  try { return await toutLire(table, null); } catch { return []; }
}

export async function chargerTout() {
  const [saisons, clubs, licencies, licences, roles, competitions, inscriptions, participants, factures, matchs, pmatchs, manches, juges, mouvements] = await Promise.all([
    toutLire('saisons', 'date_debut'),
    toutLire('clubs', 'nom'),
    toutLire('licencies', 'nom'),
    toutLire('licences', null),
    toutLire('attributions_roles', null),
    toutLire('competitions', 'date_debut'),
    toutLire('inscriptions', 'created_at'),
    toutLire('inscription_participants', null),
    toutLire('factures', 'created_at'),
    toutLire('matchs', 'created_at'),
    toutLire('participants_match', null),
    toutLire('manches', null),
    toutLire('competition_juges', null),
    toutLire('mouvements_points', null)
  ]);
  const [rencontres, compositions, tours] = await Promise.all([lireSiPresente('rencontres'), lireSiPresente('composition_rencontre'), lireSiPresente('tours_competition')]);
  let parametres = {};
  try {
    const { data, error } = await sb.from('parametres').select('*');
    if (!error && data) parametres = Object.fromEntries(data.map((r) => [r.cle, r.valeur]));
  } catch { /* table absente ou non autorisée : valeurs par défaut */ }
  return { saisons, clubs, licencies, licences, roles, competitions, inscriptions, participants, factures, matchs, pmatchs, manches, juges, mouvements, rencontres, compositions, tours, parametres };
}

/** Exige qu'au moins une ligne ait été modifiée (sinon les droits ont refusé en silence). */
async function modifier(requete) {
  const { data, error } = await requete.select();
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('Modification refusée : droits insuffisants.');
  return data;
}

async function appeler(nom, args) {
  const { data, error } = await sb.rpc(nom, args);
  if (error) throw error;
  return data;
}

export const api = {
  renouvelerLicences: (saison, items) => appeler('renouveler_licences', { p_saison: saison, p_items: items }),
  creerSaison: async (libelle, debut, fin) => {
    const { error } = await sb.from('saisons').insert({ libelle, date_debut: debut, date_fin: fin });
    if (error) throw error;
  },
  lierMonCompte: () => appeler('lier_mon_compte', {}),
  delierCompte: (id) => appeler('delier_compte', { p_licencie: id }),
  estAdminComptes: () => appeler('est_admin_comptes', {}),
  cloturerMois: (mois) => appeler('cloturer_mois', { p_mois: mois }),
  passerSaison: () => appeler('passer_saison', {}),
  moisPublies: () => appeler('mois_publies', {}),
  classementPublic: (mois) => appeler('classement_public', { p_mois: mois || null }),
  calendrierPublic: () => appeler('calendrier_public', {}),
  evenementsCalendrier: () => appeler('evenements_calendrier_public', {}),
  stagesPublics: () => appeler('stages_publics', {}),
  sinscrireStage: (a) => appeler('sinscrire_stage', {
    p_stage: a.stage, p_prenom: a.prenom, p_nom: a.nom, p_naissance: a.naissance, p_sexe: a.sexe,
    p_email: a.email || null, p_telephone: a.telephone || null,
    p_representant_nom: a.representantNom || null, p_representant_telephone: a.representantTelephone || null, p_representant_email: a.representantEmail || null,
    p_autorisation_parentale: !!a.autorisationParentale, p_autorisation_photo: !!a.autorisationPhoto,
    p_mode_paiement: a.modePaiement, p_site: a.site || null
  }),
  stagesCadre: async () => {
    const [s, i] = await Promise.all([
      sb.from('stages').select('*').order('date_debut'),
      sb.from('inscriptions_stage').select('*').order('created_at')
    ]);
    if (s.error) throw s.error;
    if (i.error) throw i.error;
    return { stages: s.data, inscriptions: i.data };
  },
  creerStage: async (v) => { const { data, error } = await sb.from('stages').insert(v).select(); if (error) throw error; return data[0]; },
  majStage: (id, patch) => modifier(sb.from('stages').update(patch).eq('id', id)),
  majInscriptionStage: (id, patch) => modifier(sb.from('inscriptions_stage').update(patch).eq('id', id)),
  stageMarquerPaye: (id, paye, mode) => appeler('stage_marquer_paye', { p_id: id, p_paye: paye, p_mode: mode || null, p_date: null }),
  stageChangerStatut: (id, statut) => appeler('stage_changer_statut', { p_id: id, p_statut: statut }),
  clePublicPush: () => appeler('cle_publique_push', {}),
  abonnerPush: (endpoint, p256dh, auth) => appeler('enregistrer_abonnement_push', { p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth }),
  desabonnerPush: (endpoint) => appeler('supprimer_abonnement_push', { p_endpoint: endpoint }),
  athleteIdentifier: (n, d) => appeler('athlete_identifier', { p_numero: n, p_naissance: d }),
  athleteProfil: (n, d) => appeler('athlete_profil', { p_numero: n, p_naissance: d }),
  athleteCompetitions: (n, d) => appeler('athlete_competitions', { p_numero: n, p_naissance: d }),
  athleteInscrire: (n, d, c) => appeler('athlete_inscrire', { p_numero: n, p_naissance: d, p_competition: c }),
  athleteProposerDouble: (n, d, c, partenaire) => appeler('athlete_proposer_double', { p_numero: n, p_naissance: d, p_competition: c, p_partenaire: partenaire }),
  athleteAnnulerProposition: (n, d, p) => appeler('athlete_annuler_proposition', { p_numero: n, p_naissance: d, p_proposition: p }),
  athleteRepondreDouble: (n, d, p, accepter) => appeler('athlete_repondre_double', { p_numero: n, p_naissance: d, p_proposition: p, p_accepter: accepter }),
  athleteDesinscrire: (n, d, c) => appeler('athlete_desinscrire', { p_numero: n, p_naissance: d, p_competition: c }),
  fichePublique: (id) => appeler('fiche_joueur_publique', { p_id: id }),
  historiquePublic: (id) => appeler('historique_joueur', { p_id: id }),
  joueursAvecResultats: () => appeler('joueurs_avec_resultats', {}),
  baremePublic: () => appeler('bareme_public', {}),
  competitionsPubliques: () => appeler('competitions_publiques', {}),
  resultatsPublics: (competition) => appeler('resultats_publics', { p_competition: competition }),
  saisirMatch: (a) =>
    appeler('saisir_match', {
      p_competition: a.competition, p_tour: a.tour || '', p_type: a.type, p_sets_gagnants: a.setsGagnants,
      p_cote_a: a.coteA, p_cote_b: a.coteB, p_manches: a.manches, p_match: a.match || null
    }),
  creerRencontre: (competition, tour, date, equipeA, equipeB) =>
    appeler('creer_rencontre', { p_competition: competition, p_tour: tour, p_date: date || null, p_equipe_a: equipeA, p_equipe_b: equipeB }),
  retirerJoueurEquipe: (inscription, licencie) => appeler('retirer_joueur_equipe', { p_inscription: inscription, p_licencie: licencie }),
  reprendreCompetitions: (ids, saison, decalage) => appeler('reprendre_competitions', { p_competitions: ids, p_saison: saison, p_decalage: decalage }),
  creerTour: (competition, nom, date) => appeler('creer_tour', { p_competition: competition, p_nom: nom, p_date: date }),
  modifierTour: (id, nom, date) => appeler('modifier_tour', { p_tour: id, p_nom: nom, p_date: date }),
  supprimerTour: (id) => appeler('supprimer_tour', { p_tour: id }),
  rencontresPubliques: (competition) => appeler('rencontres_publiques', { p_competition: competition }),
  supprimerRencontre: (id) => appeler('supprimer_rencontre', { p_rencontre: id }),
  enregistrerComposition: (rencontre, inscription, joueurs) =>
    appeler('enregistrer_composition', { p_rencontre: rencontre, p_inscription: inscription, p_joueurs: joueurs }),
  saisirMatchRencontre: (a) =>
    appeler('saisir_match_rencontre', {
      p_rencontre: a.rencontre, p_type: a.type, p_sets_gagnants: a.setsGagnants,
      p_cote_a: a.coteA, p_cote_b: a.coteB, p_manches: a.manches, p_match: a.match || null
    }),
  supprimerMatch: (id) => appeler('supprimer_match', { p_match: id }),
  rejeterMatch: (id) => appeler('rejeter_match', { p_match: id }),
  validerMatchs: (competition) => appeler('valider_matchs', { p_competition: competition }),
  invaliderMatch: (id) => appeler('invalider_match', { p_match: id }),
  ajouterJuge: async (competition, licencie) => {
    const { error } = await sb.from('competition_juges').insert({ competition_id: competition, licencie_id: licencie });
    if (error) throw error;
  },
  retirerJuge: async (id) => {
    const { error } = await sb.from('competition_juges').delete().eq('id', id);
    if (error) throw error;
  },
  genererFactures: (competition) => appeler('generer_factures', { p_competition: competition }),
  changerStatutFacture: (facture, statut) => appeler('changer_statut_facture', { p_facture: facture, p_statut: statut }),
  enregistrerInscription: (competition, club, joueurs, inscription = null, nomEquipe = null) =>
    appeler('enregistrer_inscription', { p_competition: competition, p_club: club, p_joueurs: joueurs, p_inscription: inscription, ...(nomEquipe ? { p_nom_equipe: nomEquipe } : {}) }),
  annulerInscription: (id) => appeler('annuler_inscription', { p_inscription: id }),

  creerCompetition: async (c) => {
    const { data, error } = await sb.from('competitions').insert(c).select();
    if (error) throw error;
    return data[0];
  },
  creerTableaux: (modele, tableaux) => appeler('creer_tableaux', { p_modele: modele, p_tableaux: tableaux }),
  changerStatutEvenement: (competition, statut) => appeler('changer_statut_evenement', { p_competition: competition, p_statut: statut }),
  supprimerEvenement: (competition) => appeler('supprimer_evenement', { p_competition: competition }),
  majCompetition: (id, patch) => modifier(sb.from('competitions').update(patch).eq('id', id)),
  supprimerCompetition: async (id) => {
    const { error } = await sb.from('competitions').delete().eq('id', id);
    if (error) throw error;
  },

  majLicencie: (id, patch) => modifier(sb.from('licencies').update(patch).eq('id', id)),
  majLicence: (id, patch) => modifier(sb.from('licences').update(patch).eq('id', id)),

  prendreLicence: (a) =>
    appeler('prendre_licence', {
      p_licencie: a.licencie,
      p_saison: a.saison,
      p_club: a.club,
      p_type: a.type,
      p_cert_type: a.certType || null,
      p_cert_date: a.certDate || null,
      p_cert_fourni: !!a.certFourni,
      p_questionnaire: !!a.questionnaire,
      p_photo: !!a.photo
    }),

  creerLicencie: (a) =>
    appeler('creer_licencie', {
      p_nom: a.nom,
      p_prenom: a.prenom,
      p_naissance: a.naissance,
      p_sexe: a.sexe,
      p_club: a.club,
      p_email: a.email || null,
      p_telephone: a.telephone || null,
      p_handicap: !!a.handicap,
      p_representant: null,
      p_representant_nom: a.representantNom || null,
      p_saison: a.saison,
      p_type: a.type,
      p_cert_type: a.certType || null,
      p_cert_date: a.certDate || null,
      p_cert_fourni: !!a.certFourni,
      p_questionnaire: !!a.questionnaire,
      p_photo: !!a.photo
    }),

  creerClub: async (club) => {
    const { data, error } = await sb.from('clubs').insert(club).select();
    if (error) throw error;
    return data[0];
  },
  majClub: (id, patch) => modifier(sb.from('clubs').update(patch).eq('id', id)),

  ajouterRole: async (licencie, role, club) => {
    const { error } = await sb.from('attributions_roles').insert({ licencie_id: licencie, role, club_id: club });
    if (error) throw error;
  },
  retirerRole: async (id) => {
    const { error } = await sb.from('attributions_roles').delete().eq('id', id);
    if (error) throw error;
  }
};

/** Journal des modifications (cadre uniquement) : une page de résultats, du plus récent au plus ancien. */
export async function lireJournal({ tables, action, du, au, fiche, depuis = 0, pas = 50 }) {
  let q = sb.from('journal').select('*').order('date_action', { ascending: false }).order('id', { ascending: false });
  if (tables?.length) q = q.in('table_name', tables);
  if (action) q = q.eq('action', action);
  if (du) q = q.gte('date_action', du + 'T00:00:00-10:00');
  if (au) q = q.lte('date_action', au + 'T23:59:59-10:00');
  if (fiche) q = q.or(`enregistrement_id.eq.${fiche},apres->>licencie_id.eq.${fiche},avant->>licencie_id.eq.${fiche}`);
  const { data, error } = await q.range(depuis, depuis + pas - 1);
  if (error) throw error;
  return data;
}
