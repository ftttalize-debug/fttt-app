// Réglages de connexion à Supabase.
// La clé « publishable » est faite pour être visible dans le site : la sécurité repose sur
// les règles d'accès (RLS) de la base. Ne jamais mettre ici la clé « secret » / « service_role ».
export const SUPABASE_URL = 'https://ksanjwtvkxtodxkbdmeq.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_3DiOJ94zpHrUdBYFW6pB1A_esUCn0qM';

// Coordonnées de la fédération imprimées sur les factures. Les lignes vides ne sont pas imprimées.
export const FEDERATION = {
  nom: 'Fédération Tahitienne de Tennis de Table',
  adresse: [],            // ex. ['BP 1234', '98713 Papeete, Tahiti']
  email: 'fttt.alize@gmail.com',
  telephone: '',
  numeroTahiti: '',       // numéro Tahiti / RIDET
  paiement: [],           // ex. ['Virement : IBAN …', 'Chèque à l\'ordre de la FTTT']
  mentions: ''            // ex. mention de TVA
};
