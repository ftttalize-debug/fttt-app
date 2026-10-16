// Réglages de connexion à Supabase.
// La clé « publishable » est faite pour être visible dans le site : la sécurité repose sur
// les règles d'accès (RLS) de la base. Ne jamais mettre ici la clé « secret » / « service_role ».
export const SUPABASE_URL = 'https://ksanjwtvkxtodxkbdmeq.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_3DiOJ94zpHrUdBYFW6pB1A_esUCn0qM';

// Coordonnées par défaut imprimées sur les factures. Les coordonnées complètes (adresse, numéro Tahiti,
// coordonnées bancaires) sont lues dans la base (table « parametres »), pas dans ce fichier public.
/** Coordonnées bancaires de la fédération (RIB), affichées aux participants qui règlent un stage par virement. */
export const COORDONNEES_BANCAIRES = {
  titulaire: 'Fédération Tahitienne de Tennis de Table',
  banque: 'Banque de Polynésie',
  iban: 'FR76 1214 9067 4419 4776 0201 769',
  bic: 'BPOLPFTP',
  banqueCode: '12149', guichet: '06744', compte: '19477602017', cle: '69'
};

export const FEDERATION = {
  nom: 'Fédération Tahitienne de Tennis de Table',
  adresse: [],
  email: '',
  telephone: '',
  numeroTahiti: '',
  paiement: [],
  mentions: ''
};
