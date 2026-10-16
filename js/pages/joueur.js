// Fiche publique d'un joueur : nom, club, catégorie, rang, points et résultats validés.
import { html, useState, useEffect, useMemo } from '../preact.js';
import { api } from '../data.js';
import { fmtPts, fmtVariation, fmtDate, msgErreur, lien } from '../lib.js';
import { Chargement, Pastille, BadgePts, Pliable } from '../ui.js';


export function bilanHisto(histo) {
  const l = histo || [];
  const v = l.filter((h) => h.sets_pour > h.sets_contre).length;
  return { v, d: l.length - v, points: Math.round(l.reduce((t, h) => t + Number(h.points || 0), 0) * 10) / 10 };
}

function LignesMatchs({ matchs }) {
  return html`<ul class="matchs">${matchs.map((h) => {
    const gagne = h.sets_pour > h.sets_contre;
    return html`<li class="match" key=${h.match_id}>
      <div class="match-tete"><strong>${h.tour || 'Match'}</strong>
        ${h.type_match === 'double' && html`<span class="pastille">Double</span>`}
        <span class=${'pastille ' + (gagne ? 'pastille-actif' : 'pastille-alerte')}>${gagne ? 'Victoire' : 'Défaite'}</span></div>
      <div class="match-score"><span>contre ${(h.liste || []).map((a, i) => html`${i > 0 ? ' / ' : ''}${a.id ? html`<a class="lien-joueur" href=${lien(['joueur', a.id])}>${a.nom}</a>` : a.nom}`)}</span>
        <strong>${h.sets_pour} - ${h.sets_contre}</strong>
        <${BadgePts} v=${h.points} /></div>
      <small>${h.manches || 'Forfait'}</small></li>`;
  })}</ul>`;
}

/** Libellé court des tours joués : « Journée 1 », « Poule · Tableau final · Consolante »… */
function resumeTours(matchs) {
  const vus = [];
  matchs.forEach((h) => {
    const t = String(h.tour || '').trim();
    const court = /^poule/i.test(t) ? 'Poule' : t.split(/\s[–-]\s/)[0];
    if (court && !vus.includes(court)) vus.push(court);
  });
  return vus.reverse().join(' · ');
}

function groupesParCompetition(histo) {
  const m = new Map();
  (histo || []).forEach((h) => {
    if (!m.has(h.competition_id)) m.set(h.competition_id, { id: h.competition_id, nom: h.competition, date: h.date_debut, matchs: [] });
    m.get(h.competition_id).matchs.push(h);
  });
  return [...m.values()];
}

/** Résultats d'un joueur : un menu déroulant par compétition (date, journée ou tableau, bilan et points de la compétition). */
export function ResultatsParCompetition({ histo }) {
  const groupes = useMemo(() => groupesParCompetition(histo), [histo]);
  if (histo === null) return html`<${Chargement} />`;
  if (!groupes.length) return html`<p class="vide">Aucun match validé pour le moment.</p>`;
  return html`<div>${groupes.map((g) => {
    const b = bilanHisto(g.matchs);
    const tours = resumeTours(g.matchs);
    return html`<${Pliable} key=${g.id} petit=${true} titre=${g.nom}
      sous=${[fmtDate(g.date), tours, `${b.v} V · ${b.d} D`].filter(Boolean).join(' · ')}
      resume=${html`<${BadgePts} v=${b.points} />`}>
      <${LignesMatchs} matchs=${g.matchs} />
    <//>`;
  })}</div>`;
}

/** Matchs d'un joueur, regroupés par compétition, avec les points gagnés ou perdus à chaque rencontre. */
export function ListeMatchs({ histo }) {
  const groupes = useMemo(() => groupesParCompetition(histo), [histo]);
  return html`<div>
    ${histo === null && html`<${Chargement} />`}
    ${histo && histo.length === 0 && html`<p class="vide">Aucun match validé pour le moment.</p>`}
    ${groupes.map((g) => html`<section class="carte" key=${g.id}>
      <h3>${g.nom} <small>${fmtDate(g.date)}</small></h3>
      <${LignesMatchs} matchs=${g.matchs} /></section>`)}
  </div>`;
}

export function PageJoueur({ id }) {
  const [fiche, setFiche] = useState(undefined);
  const [histo, setHisto] = useState(null);
  const [erreur, setErreur] = useState('');
  useEffect(() => {
    setFiche(undefined); setHisto(null); setErreur('');
    api.fichePublique(id).then((r) => setFiche(r?.[0] || null)).catch((e) => setErreur(msgErreur(e)));
    api.historiquePublic(id).then(setHisto).catch((e) => setErreur(msgErreur(e)));
  }, [id]);

  const bilan = useMemo(() => bilanHisto(histo), [histo]);

  if (erreur) return html`<div class="page"><p class="erreur" role="alert">${erreur}</p></div>`;
  if (fiche === undefined) return html`<${Chargement} />`;
  if (fiche === null) return html`<div class="page"><p class="vide">Ce joueur n'est pas visible sur le site public. <a href=${lien(['classement'])}>Retour au classement</a></p></div>`;
  return html`<div class="page">
    <p><a href=${lien(['classement'])}>← Classement</a></p>
    <div class="page-tete"><div><h1>${fiche.prenom} ${fiche.nom}</h1><p>${fiche.club || 'Sans club'}</p></div></div>
    <section class="carte" aria-label="Situation">
      <div class="stats stats-fiche">
        <div class="stat"><span class="stat-valeur" id="j-rang">${fiche.rang ?? '—'}</span><span class="stat-libelle">Rang</span></div>
        <div class="stat"><span class="stat-valeur" id="j-pts">${fmtPts(fiche.points)}</span><span class="stat-libelle">Points</span></div>
        <div class="stat"><span class="stat-valeur">${bilan.v} V · ${bilan.d} D</span><span class="stat-libelle">Matchs validés · ${fmtVariation(bilan.points)} pts</span></div>
      </div>
      <p><span class="pastille pastille-categorie">${fiche.categorie}</span> ${fiche.actif ? '' : html`<${Pastille}>Licence non renouvelée<//>`}
        · <a href=${lien(['simulateur'])}>Simuler des points</a></p>
    </section>
    <h2>Matchs</h2>
    <${ResultatsParCompetition} histo=${histo} />
  </div>`;
}
