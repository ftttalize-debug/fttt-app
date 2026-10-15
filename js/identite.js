// Identité de l'athlète partagée entre « Mon profil » et « Je m'inscris » (sans compte).
// Pendant la session du navigateur : sessionStorage. Au-delà (case « Se souvenir sur cet appareil ») : localStorage.
const CLE = 'fttt-profil';
const lire = (stockage) => { try { const v = JSON.parse(stockage.getItem(CLE) || 'null'); return v && v.identifiant && v.naissance ? v : null; } catch (e) { return null; } };

/** { identifiant, naissance, durable } ou null. */
export function lireIdentite() {
  const l = lire(window.localStorage);
  const s = lire(window.sessionStorage);
  const v = l || s;
  return v ? { identifiant: v.identifiant, naissance: v.naissance, durable: !!l } : null;
}

export function ecrireIdentite(v, durable) {
  const x = JSON.stringify({ identifiant: v.identifiant, naissance: v.naissance });
  try { window.sessionStorage.setItem(CLE, x); } catch (e) { /* indisponible */ }
  if (durable) { try { window.localStorage.setItem(CLE, x); } catch (e) { /* indisponible */ } }
}

export function effacerIdentite() {
  try { window.sessionStorage.removeItem(CLE); } catch (e) { /* indisponible */ }
  try { window.localStorage.removeItem(CLE); } catch (e) { /* indisponible */ }
}
