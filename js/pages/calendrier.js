// Calendrier public des compétitions.
import { html, useState, useEffect, useMemo } from '../preact.js';
import { api } from '../data.js';
import { fmtDate, aujourdhuiISO, msgErreur, lien } from '../lib.js';
import { Chargement, Pastille } from '../ui.js';
import { OngletsPublics, BoutonAlertes } from './public.js';

const TYPES = { simple: 'Simple', double: 'Double', equipe: 'Par équipes' };
const STATUTS = { ouverte: ['actif', 'Inscriptions ouvertes'], cloturee: ['neutre', 'Inscriptions closes'], terminee: ['archive', 'Terminée'] };

function dates(c) {
  return c.date_fin && c.date_fin !== c.date_debut ? `Du ${fmtDate(c.date_debut)} au ${fmtDate(c.date_fin)}` : fmtDate(c.date_debut);
}

const GENRES = { dames: 'Dames', messieurs: 'Messieurs', mixte: 'Mixte', uni: 'Uni' };
/** Étiquette courte d'un tableau : catégorie et genre. */
const etiquette = (c) => [c.categorie_min ? 'Vétérans' : c.categorie_max ? `${c.categorie_max} et moins` : '', GENRES[c.genre] || ''].filter(Boolean).join(' · ');

/** Dates des tours d'une compétition par équipes. */
function Tours({ c }) {
  if (!Array.isArray(c.tours) || c.tours.length === 0) return null;
  return html`<p class="comp-infos">Tours : ${c.tours.map((t) => `${t.nom} (${fmtDate(t.date)})`).join(' · ')}</p>`;
}

/** Plusieurs tableaux d'un même événement regroupés sous un titre. */
function CarteEvenement({ groupe }) {
  const tete = groupe[0];
  const titre = tete.nom.split(' – ')[0];
  const debut = groupe.reduce((m, c) => (c.date_debut < m ? c.date_debut : m), tete.date_debut);
  const fin = groupe.reduce((m, c) => ((c.date_fin || c.date_debut) > m ? (c.date_fin || c.date_debut) : m), tete.date_fin || tete.date_debut);
  return html`<li class="carte-comp">
    <div class="match-tete"><strong>${titre}</strong></div>
    <p class="comp-date">${dates({ date_debut: debut, date_fin: fin })}${tete.lieu ? ' · ' + tete.lieu : ''}</p>
    <ul class="liste-comp">
      ${groupe.map((c) => {
        const [genre, texte] = STATUTS[c.statut] || ['neutre', c.statut];
        return html`<li key=${c.id}>
          <div class="match-tete"><strong>${c.nom.includes(' – ') ? c.nom.split(' – ').slice(1).join(' – ') : c.nom}</strong><${Pastille} genre=${genre}>${texte}<//></div>
          <p class="comp-infos">${TYPES[c.type] || c.type}${etiquette(c) ? ' · ' + etiquette(c) : ''}</p>
          <${Tours} c=${c} />
          <p class="comp-liens">
            ${(c.statut === 'cloturee' || c.statut === 'terminee') && html`<a href=${lien(['resultats'], { competition: c.id })}>Voir les résultats</a>`}
          </p>
        </li>`;
      })}
    </ul>
  </li>`;
}

function Carte({ c }) {
  const [genre, texte] = STATUTS[c.statut] || ['neutre', c.statut];
  return html`<li class="carte-comp">
    <div class="match-tete"><strong>${c.nom}</strong><${Pastille} genre=${genre}>${texte}<//></div>
    <p class="comp-date">${dates(c)}${c.lieu ? ' · ' + c.lieu : ''}</p>
    <p class="comp-infos">${TYPES[c.type] || c.type}${etiquette(c) ? ' · ' + etiquette(c) : ''} · coefficient ${String(Number(c.coefficient)).replace('.', ',')}</p>
    <${Tours} c=${c} />
    <p class="comp-liens">
      ${(c.statut === 'cloturee' || c.statut === 'terminee') && html`<a href=${lien(['resultats'], { competition: c.id })}>Voir les résultats</a>`}
      <a href=${lien(['simulateur'], { coef: String(Number(c.coefficient)) })}>Simuler mes points</a>
    </p>
  </li>`;
}

export function PageCalendrier() {
  const [liste, setListe] = useState(null);
  const [erreur, setErreur] = useState('');
  useEffect(() => { api.calendrierPublic().then(setListe).catch((e) => setErreur(msgErreur(e))); }, []);
  const { avenir, passees } = useMemo(() => {
    const auj = aujourdhuiISO();
    const l = liste || [];
    return {
      avenir: l.filter((c) => c.date_fin >= auj).sort((a, b) => (a.date_debut < b.date_debut ? -1 : 1)),
      passees: l.filter((c) => c.date_fin < auj).sort((a, b) => (a.date_debut < b.date_debut ? 1 : -1))
    };
  }, [liste]);
  /** Regroupe les tableaux d'un même événement ; les autres compétitions restent seules. */
  const elements = (l) => {
    const m = new Map();
    l.forEach((c) => { const k = c.evenement_id || c.id; if (!m.has(k)) m.set(k, []); m.get(k).push(c); });
    return [...m.entries()].map(([k, g]) => (g.length > 1 ? html`<${CarteEvenement} key=${k} groupe=${g} />` : html`<${Carte} key=${k} c=${g[0]} />`));
  };
  return html`<div class="page">
    <div class="page-tete"><div><h1>Compétitions</h1><p>Compétitions de la Fédération Tahitienne de Tennis de Table</p></div></div>
    <${OngletsPublics} actif="calendrier" />
    <${BoutonAlertes} />
    ${erreur && html`<p class="erreur" role="alert">${erreur}</p>`}
    ${!liste && !erreur && html`<${Chargement} />`}
    ${liste && liste.length === 0 && html`<p class="vide">Aucune compétition n'est au calendrier pour le moment.</p>`}
    ${avenir.length > 0 && html`<h2>À venir</h2><ul class="liste-comp" id="comp-avenir">${elements(avenir)}</ul>`}
    ${passees.length > 0 && html`<h2>Passées</h2><ul class="liste-comp" id="comp-passees">${elements(passees)}</ul>`}
  </div>`;
}
