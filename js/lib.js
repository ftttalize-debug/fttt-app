// Fonctions utilitaires : dates, catégories, recherche, erreurs, export CSV.

export const TYPES_LICENCE = {
  competition: 'Compétition',
  loisir: 'Loisir',
  dirigeant: 'Dirigeant',
  evenementielle: 'Événementielle'
};
export const TYPES_CERTIFICAT = {
  competition: 'Compétition',
  loisir: 'Loisir',
  evenementiel: 'Événementiel'
};
export const CATEGORIES = ['Poussin', 'Benjamin', 'Minime', 'Cadet', 'Junior', 'Senior', 'Vétéran'];

const deuxChiffres = (n) => String(n).padStart(2, '0');

/** Texte sans accents ni majuscules, pour la recherche. */
export const norm = (s) =>
  (s ?? '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** « 1964 » ou « 1 964 » (espace fine), avec une décimale si besoin. */
export function fmtPts(n) {
  if (n === null || n === undefined || n === '') return '—';
  const x = Number(n);
  const texte = Number.isInteger(x) ? String(x) : x.toFixed(1).replace('.', ',');
  return texte.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Date « AAAA-MM-JJ » → objet Date locale (sans décalage de fuseau). */
export function parseDate(s) {
  if (!s) return null;
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function fmtDate(s) {
  const d = parseDate(s);
  return d ? `${deuxChiffres(d.getDate())}/${deuxChiffres(d.getMonth() + 1)}/${d.getFullYear()}` : '—';
}

export function aujourdhuiISO(ref = new Date()) {
  return `${ref.getFullYear()}-${deuxChiffres(ref.getMonth() + 1)}-${deuxChiffres(ref.getDate())}`;
}

/** Âge atteint au 1er janvier de l'année de référence (règle de catégorie de la FTTT). */
export function ageAu1erJanvier(naissance, ref = new Date()) {
  const b = parseDate(naissance);
  if (!b) return null;
  const apresLe1erJanvier = b.getMonth() > 0 || b.getDate() > 1;
  return ref.getFullYear() - b.getFullYear() - (apresLe1erJanvier ? 1 : 0);
}

export function categorie(naissance, ref = new Date()) {
  const a = ageAu1erJanvier(naissance, ref);
  if (a === null) return '—';
  if (a <= 9) return 'Poussin';
  if (a <= 11) return 'Benjamin';
  if (a <= 13) return 'Minime';
  if (a <= 15) return 'Cadet';
  if (a <= 19) return 'Junior';
  if (a <= 40) return 'Senior';
  return 'Vétéran';
}

/** Âge réel aujourd'hui. */
export function ageExact(naissance, ref = new Date()) {
  const b = parseDate(naissance);
  if (!b) return null;
  let a = ref.getFullYear() - b.getFullYear();
  if (ref.getMonth() < b.getMonth() || (ref.getMonth() === b.getMonth() && ref.getDate() < b.getDate())) a -= 1;
  return a;
}

export const estMineur = (naissance, ref = new Date()) => {
  const a = ageExact(naissance, ref);
  return a !== null && a < 18;
};

/** Saison dont les dates contiennent aujourd'hui (sinon la plus récente). */
export function saisonCourante(saisons, ref = new Date()) {
  if (!saisons || !saisons.length) return null;
  const t = aujourdhuiISO(ref);
  return saisons.find((s) => s.date_debut <= t && t <= s.date_fin) || saisons[saisons.length - 1];
}

export const nomComplet = (l) => `${l.prenom} ${l.nom}`;

export function emailValide(e) {
  return !e || /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(e.trim());
}

/** Message d'erreur lisible en français. */
export function msgErreur(err) {
  const m = (err && (err.message || err.error_description || err.msg)) || String(err || '');
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou mot de passe incorrect.';
  if (/Email not confirmed/i.test(m)) return 'Cette adresse e-mail n\'est pas encore confirmée.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Connexion impossible. Vérifie ta connexion internet puis réessaie.';
  if (/row-level security|permission denied|Réservé au cadre/i.test(m)) return 'Action non autorisée pour ton profil.';
  if (/duplicate key/i.test(m)) return 'Cette valeur existe déjà.';
  if (/same password/i.test(m)) return 'Le nouveau mot de passe doit être différent de l\'ancien.';
  if (/Password should be at least/i.test(m)) return 'Le mot de passe est trop court.';
  if (/rate limit/i.test(m)) return 'Trop de tentatives. Réessaie dans quelques minutes.';
  return m || 'Une erreur est survenue.';
}

/** Téléchargement d'un fichier CSV lisible par Excel (séparateur « ; », accents conservés). */
export function telechargerCsv(nomFichier, entetes, lignes) {
  const proteger = (v) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=@]/.test(s) || /^[+-][^\d\s.]/.test(s)) s = "'" + s; // évite l'exécution de formules
    return /[";\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const contenu = '﻿' + [entetes, ...lignes].map((r) => r.map(proteger).join(';')).join('\r\n');
  const blob = new Blob([contenu], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nomFichier;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

// ---------- Navigation par l'adresse (#/licencies?statut=actif) ----------
export function lireRoute() {
  const h = location.hash.startsWith('#/') ? location.hash.slice(2) : '';
  const [chemin, qs = ''] = h.split('?');
  return {
    parts: chemin.split('/').filter(Boolean).map(decodeURIComponent),
    query: Object.fromEntries(new URLSearchParams(qs))
  };
}

export function lien(parts = [], query = {}) {
  const chemin = (Array.isArray(parts) ? parts : [parts]).map(encodeURIComponent).join('/');
  const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString();
  return '#/' + chemin + (qs ? '?' + qs : '');
}

export function naviguer(parts, query = {}, remplacer = false) {
  const cible = lien(parts, query);
  if (remplacer) location.replace(cible);
  else location.hash = cible;
}

/** Points d'un match pour un joueur : barème (tranches sur l'écart entier inférieur) × coefficient, arrondi au dixième. */
export function pointsMatch(bareme, ecart, victoire, coef) {
  const e = Math.floor(ecart);
  const t = bareme.find((b) => e >= (b.ecart_min ?? -Infinity) && e <= (b.ecart_max ?? Infinity));
  if (!t) return null;
  const brut = Number(victoire ? t.points_victoire : t.points_defaite) * Number(coef);
  return Math.sign(brut) * Math.round(Math.abs(brut) * 10) / 10 || 0;
}

/** Texte de points avec signe : « +7,5 », « −5 ». */
export function fmtVariation(n) {
  if (n === null || n === undefined) return '—';
  const x = Number(n);
  const t = Math.abs(x).toFixed(1).replace('.0', '').replace('.', ',');
  return x > 0 ? `+${t}` : x < 0 ? `−${t}` : '0';
}
