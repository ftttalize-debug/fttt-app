// Calendrier public des compétitions.
import { html, useState, useEffect, useMemo } from '../preact.js';
import { api } from '../data.js';
import { fmtDate, aujourdhuiISO, msgErreur, lien } from '../lib.js';
import { Chargement, Pastille } from '../ui.js';
import { OngletsPublics } from './public.js';

const TYPES = { simple: 'Simple', double: 'Double', equipe: 'Par équipes' };
const STATUTS = { ouverte: ['actif', 'Inscriptions ouvertes'], cloturee: ['neutre', 'Inscriptions closes'], terminee: ['archive', 'Terminée'] };

function dates(c) {
  return c.date_fin && c.date_fin !== c.date_debut ? `Du ${fmtDate(c.date_debut)} au ${fmtDate(c.date_fin)}` : fmtDate(c.date_debut);
}

function Carte({ c }) {
  const [genre, texte] = STATUTS[c.statut] || ['neutre', c.statut];
  return html`<li class="carte-comp">
    <div class="match-tete"><strong>${c.nom}</strong><${Pastille} genre=${genre}>${texte}<//></div>
    <p class="comp-date">${dates(c)}${c.lieu ? ' · ' + c.lieu : ''}</p>
    <p class="comp-infos">${TYPES[c.type] || c.type} · coefficient ${String(Number(c.coefficient)).replace('.', ',')}</p>
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
  return html`<div class="page">
    <div class="page-tete"><div><h1>Calendrier</h1><p>Compétitions de la Fédération Tahitienne de Tennis de Table</p></div></div>
    <${OngletsPublics} actif="calendrier" />
    ${erreur && html`<p class="erreur" role="alert">${erreur}</p>`}
    ${!liste && !erreur && html`<${Chargement} />`}
    ${liste && liste.length === 0 && html`<p class="vide">Aucune compétition n'est au calendrier pour le moment.</p>`}
    ${avenir.length > 0 && html`<h2>À venir</h2><ul class="liste-comp" id="comp-avenir">${avenir.map((c) => html`<${Carte} key=${c.id} c=${c} />`)}</ul>`}
    ${passees.length > 0 && html`<h2>Passées</h2><ul class="liste-comp" id="comp-passees">${passees.map((c) => html`<${Carte} key=${c.id} c=${c} />`)}</ul>`}
  </div>`;
}
