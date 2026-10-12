// Réglages de connexion à Supabase.
// La clé « publishable » est faite pour être visible dans le site : la sécurité repose sur
// les règles d'accès (RLS) de la base. Ne jamais mettre ici la clé « secret » / « service_role ».
export const SUPABASE_URL = 'https://ksanjwtvkxtodxkbdmeq.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_3DiOJ94zpHrUdBYFW6pB1A_esUCn0qM';

// Coordonnées par défaut imprimées sur les factures. Les coordonnées complètes (adresse, numéro Tahiti,
// coordonnées bancaires) sont lues dans la base (table « parametres »), pas dans ce fichier public.
export const FEDERATION = {
  nom: 'Fédération Tahitienne de Tennis de Table',
  adresse: [],
  email: '',
  telephone: '',
  numeroTahiti: '',
  paiement: [],
  mentions: ''
};
