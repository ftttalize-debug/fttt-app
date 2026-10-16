// Éléments d'interface communs : icônes, pastilles, champs, fenêtres, messages.
import { html, useState, useEffect, useMemo, useRef } from './preact.js';
import { norm } from './lib.js';

const ICONES = {
  accueil: '<rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>',
  licencies: '<circle cx="9" cy="7" r="4"/><path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/>',
  clubs: '<path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-6h6v6"/>',
  competitions: '<path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3"/><path d="M7 5H4v2a3 3 0 0 0 3 3"/>',
  inscriptions: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4h6v3H9z"/><path d="M9 12h6M9 16h4"/>',
  factures: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  matchs: '<circle cx="9" cy="9" r="6"/><path d="M13.5 13.5 20 20"/><circle cx="18" cy="6" r="1.5"/>',
  classement: '<path d="M5 20V11M12 20V4M19 20v-6"/>',
  calendrier: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  journal: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5l3 2"/>',
  profil: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  fermer: '<path d="M6 6l12 12M18 6L6 18"/>',
  recherche: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  retour: '<path d="M15 5l-7 7 7 7"/>',
  telecharger: '<path d="M12 4v11"/><path d="M7 11l5 5 5-5"/><path d="M5 20h14"/>',
  sortie: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
  alerte: '<path d="M12 3l10 18H2z"/><path d="M12 10v5"/><path d="M12 18v.5"/>'
};

export function Icone({ nom, taille = 22 }) {
  return html`<svg width=${taille} height=${taille} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
    dangerouslySetInnerHTML=${{ __html: ICONES[nom] || '' }}></svg>`;
}

export function Pastille({ genre = 'neutre', children }) {
  return html`<span class=${'pastille pastille-' + genre}>${children}</span>`;
}

// Points gagnés ou perdus sur un match : pastille verte (gain) ou rouge (perte), bien distincte du score.
export function BadgePts({ v }) {
  if (v === null || v === undefined || v === '' || !Number.isFinite(Number(v))) return null;
  const n = Number(v);
  const txt = (n > 0 ? '+' : '') + n.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' pts';
  return html`<span class=${'pts-badge ' + (n > 0 ? 'gain' : n < 0 ? 'perte' : 'neutre')} title=${n > 0 ? 'Points gagnés' : n < 0 ? 'Points perdus' : 'Aucun point'}>${txt}</span>`;
}

// Bloc pliable : on touche le titre pour ouvrir ou fermer (petit = sous-bloc à l'intérieur d'une carte).
export function Pliable({ titre, sous, resume, ouvert = false, petit = false, children }) {
  const T = petit ? 'h3' : 'h2';
  return html`<details class=${petit ? 'pliable pliable-petit' : 'carte pliable'} open=${ouvert}>
    <summary><div class="pliable-titre"><${T}>${titre}<//>${sous ? html`<span class="pliable-sous">${sous}</span>` : ''}</div>${resume ? html`<small class="pliable-resume">${resume}</small>` : ''}</summary>
    <div class="pliable-corps">${children}</div>
  </details>`;
}

export function Chargement({ texte = 'Chargement…' }) {
  return html`<p class="chargement" role="status">${texte}</p>`;
}

export function Champ({ id, libelle, aide, erreur, children }) {
  return html`<div class=${'champ' + (erreur ? ' champ-erreur' : '')}>
    <label for=${id}>${libelle}</label>
    ${children}
    ${aide && html`<p class="aide">${aide}</p>`}
    ${erreur && html`<p class="erreur" role="alert">${erreur}</p>`}
  </div>`;
}

// ---------- Messages ----------
const ecouteurs = new Set();
export function toast(message, genre = 'ok') {
  ecouteurs.forEach((f) => f({ id: Math.random(), message, genre }));
}

export function Messages() {
  const [liste, setListe] = useState([]);
  useEffect(() => {
    const f = (t) => {
      setListe((l) => [...l, t]);
      setTimeout(() => setListe((l) => l.filter((x) => x.id !== t.id)), t.genre === 'erreur' ? 8000 : 4500);
    };
    ecouteurs.add(f);
    return () => ecouteurs.delete(f);
  }, []);
  return html`<div class="messages" role="status" aria-live="polite">
    ${liste.map((t) => html`<div key=${t.id} class=${'message message-' + t.genre}>${t.message}</div>`)}
  </div>`;
}

// ---------- Fenêtre de dialogue ----------
export function Dialogue({ titre, onFermer, children }) {
  const ref = useRef();
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => {
      if (d && d.open) d.close();
    };
  }, []);
  return html`<dialog ref=${ref} class="modal" aria-labelledby="titre-dialogue"
      onClose=${onFermer} onClick=${(e) => { if (e.target === ref.current) onFermer(); }}>
    <div class="modal-corps">
      <h2 id="titre-dialogue">${titre}</h2>
      ${children}
    </div>
  </dialog>`;
}

// ---------- Choix d'une personne parmi les licenciés (recherche en tapant) ----------
export function ChoixPersonne({ id, options, valeur, onChange, placeholder = 'Taper un nom ou un prénom' }) {
  const [texte, setTexte] = useState('');
  const choisi = options.find((o) => o.id === valeur);
  const resultats = useMemo(() => {
    const mots = norm(texte).split(/\s+/).filter(Boolean);
    if (!mots.length) return [];
    return options.filter((o) => mots.every((m) => o.cle.includes(m))).slice(0, 8);
  }, [texte, options]);

  if (choisi) {
    return html`<div class="choisi">
      <span>${choisi.libelle}${choisi.detail ? html` <small>· ${choisi.detail}</small>` : ''}</span>
      <button type="button" class="btn btn-lien" onClick=${() => onChange(null)}>Changer</button>
    </div>`;
  }
  return html`<div class="choix">
    <input id=${id} type="search" autocomplete="off" placeholder=${placeholder} value=${texte}
      onInput=${(e) => setTexte(e.target.value)} />
    ${resultats.length > 0 && html`<ul class="suggestions">
      ${resultats.map((o) => html`<li key=${o.id}>
        <button type="button" onClick=${() => { onChange(o.id); setTexte(''); }}>
          ${o.libelle}${o.detail ? html`<small>${o.detail}</small>` : ''}
        </button></li>`)}
    </ul>`}
    ${texte && resultats.length === 0 && html`<p class="aide">Aucun résultat.</p>`}
  </div>`;
}
