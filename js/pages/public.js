// Pages publiques (lisibles sans connexion) : classement et résultats. Seuls le nom, le club,
// la catégorie, les points et les résultats validés sont affichés.
import { html, useState, useEffect, useMemo } from '../preact.js';
import { api } from '../data.js';
import { norm, fmtPts, fmtVariation, CATEGORIES, msgErreur, lien, telechargerCsv } from '../lib.js';
import { Chargement } from '../ui.js';
import { ListeMatchs, bilanHisto } from './joueur.js';

const libelleMois = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
const PAGE = 50;
// Filtres « jeunes » cumulatifs, selon la catégorie (âge au 1er janvier) : U11 = poussins + benjamins, etc.
const MOINS_DE = {
  U11: ['poussin', 'benjamin'],
  U13: ['poussin', 'benjamin', 'minime'],
  U15: ['poussin', 'benjamin', 'minime', 'cadet'],
  U19: ['poussin', 'benjamin', 'minime', 'cadet', 'junior'],
};
const LIBELLE_U = { U11: '11 ans et moins', U13: '13 ans et moins', U15: '15 ans et moins', U19: '19 ans et moins' };

function Classement() {
  const [mois, setMois] = useState([]);
  const [choix, setChoix] = useState('');
  const [lignes, setLignes] = useState(null);
  const [erreur, setErreur] = useState('');
  const [cat, setCat] = useState('');
  const [sexe, setSexe] = useState('');
  const [texte, setTexte] = useState('');
  const [nb, setNb] = useState(PAGE);

  useEffect(() => {
    api.moisPublies().then((m) => { const l = m.map((x) => x.mois); setMois(l); setChoix(l[0] || ''); if (!l.length) setLignes([]); }).catch((e) => setErreur(msgErreur(e)));
  }, []);
  useEffect(() => {
    if (!choix) return;
    setLignes(null);
    api.classementPublic(choix).then(setLignes).catch((e) => setErreur(msgErreur(e)));
  }, [choix]);

  const liste = useMemo(() => {
    const mots = norm(texte).split(/\s+/).filter(Boolean);
    return (lignes || [])
      .filter((l) => (!cat ? true : MOINS_DE[cat] ? MOINS_DE[cat].includes(norm(l.categorie)) : norm(l.categorie) === norm(cat)))
      .filter((l) => (sexe ? l.sexe === sexe : true))
      .filter((l) => mots.every((m) => norm(`${l.prenom} ${l.nom} ${l.club || ''}`).includes(m)));
  }, [lignes, cat, sexe, texte]);

  if (erreur) return html`<p class="erreur" role="alert">${erreur}</p>`;
  if (lignes === null) return html`<${Chargement} />`;
  if (!lignes.length) return html`<p class="vide">Aucun classement n'a encore été publié.</p>`;
  return html`<div class="page-corps">
    <section class="carte filtres" aria-label="Filtres">
      <div class="recherche"><input type="search" aria-label="Rechercher un joueur ou un club" placeholder="Nom, prénom ou club" value=${texte}
        onInput=${(e) => { setTexte(e.target.value); setNb(PAGE); }} /></div>
      <div class="filtres-ligne">
        <select aria-label="Mois" value=${choix} onChange=${(e) => { setChoix(e.target.value); setNb(PAGE); }}>
          ${mois.map((m) => html`<option key=${m} value=${m}>Classement de ${libelleMois(m)}</option>`)}</select>
        <select aria-label="Catégorie" value=${cat} onChange=${(e) => { setCat(e.target.value); setNb(PAGE); }}>
          <option value="">Toutes les catégories</option>
          <optgroup label="Jeunes (cumulatif)">${Object.keys(MOINS_DE).map((u) => html`<option key=${u} value=${u}>${u} (${LIBELLE_U[u]})</option>`)}</optgroup>
          <optgroup label="Catégories">${CATEGORIES.map((c) => html`<option key=${c} value=${c}>${c}</option>`)}</optgroup></select>
        <select aria-label="Sexe" value=${sexe} onChange=${(e) => { setSexe(e.target.value); setNb(PAGE); }}>
          <option value="">Dames et messieurs</option><option value="F">Dames</option><option value="M">Messieurs</option></select>
      </div>
    </section>
    <p class="compte-resultats" role="status">${liste.length} joueur${liste.length > 1 ? 's' : ''}
      <button class="btn btn-lien" type="button" id="exp-classement" onClick=${() => telechargerCsv(`classement-${choix}.csv`, ['Rang', 'Nom', 'Prénom', 'Club', 'Catégorie', 'Sexe', 'Points'],
        liste.map((l) => [l.rang, l.nom, l.prenom, l.club || '', l.categorie, l.sexe, fmtPts(l.points)]))}>Exporter (CSV)</button></p>
    <ul class="liste">
      ${liste.slice(0, nb).map((l) => html`<li key=${l.id || l.rang + l.nom + l.prenom}>
        <a class="ligne ligne-classement" href=${lien(['joueur', l.id])}>
          <span class="rang">${l.rang}</span>
          <span class="ligne-nom"><strong>${l.prenom} ${l.nom}</strong><small>${l.club || '—'}</small></span>
          <span><span class="pastille pastille-categorie">${l.categorie}</span></span>
          <span class="ligne-pts">${fmtPts(l.points)} <small>pts</small></span>
        </a></li>`)}
    </ul>
    ${liste.length > nb && html`<button class="btn btn-secondaire suite" type="button" onClick=${() => setNb(nb + PAGE)}>Afficher la suite · ${nb} sur ${liste.length}</button>`}
  </div>`;
}

/** Noms d'un côté du match, chacun menant à la fiche du joueur (sauf joueur masqué). */
export function Noms({ r }) {
  const l = Array.isArray(r.liste) ? r.liste : null;
  if (!l) return r.joueurs;
  return l.map((j, i) => html`${i > 0 ? ' / ' : ''}${j.id ? html`<a class="lien-joueur" href=${lien(['joueur', j.id])}>${j.nom}</a>` : j.nom}`);
}

function PointsCote({ r }) {
  if (r.points === null || r.points === undefined) return null;
  return html`<small class=${'pts-cote ' + (Number(r.points) >= 0 ? 'gain' : 'perte')}>${fmtVariation(r.points)} pts</small>`;
}

function ResultatsJoueur() {
  const [joueurs, setJoueurs] = useState(null);
  const [texte, setTexte] = useState('');
  const [choix, setChoix] = useState(null);
  const [histo, setHisto] = useState(null);
  const [erreur, setErreur] = useState('');
  useEffect(() => { api.joueursAvecResultats().then(setJoueurs).catch((e) => setErreur(msgErreur(e))); }, []);
  useEffect(() => {
    if (!choix) return;
    setHisto(null);
    api.historiquePublic(choix.id).then(setHisto).catch((e) => setErreur(msgErreur(e)));
  }, [choix]);
  const trouves = useMemo(() => {
    const mots = norm(texte).split(/\s+/).filter(Boolean);
    if (!mots.length) return [];
    return (joueurs || []).filter((j) => mots.every((m) => norm(`${j.prenom} ${j.nom}`).includes(m))).slice(0, 8);
  }, [joueurs, texte]);
  const bilan = bilanHisto(histo);
  if (erreur) return html`<p class="erreur" role="alert">${erreur}</p>`;
  if (joueurs === null) return html`<${Chargement} />`;
  return html`<div class="page-corps">
    <section class="carte filtres"><div class="recherche"><input id="rj-recherche" type="search" aria-label="Rechercher un joueur" placeholder="Taper un nom ou un prénom" value=${texte}
      onInput=${(e) => { setTexte(e.target.value); setChoix(null); }} /></div>
      ${trouves.length > 0 && !choix && html`<ul class="liste-choix" id="rj-liste">${trouves.map((j) => html`<li key=${j.id}>
        <button type="button" class="btn btn-secondaire" onClick=${() => { setChoix(j); setTexte(`${j.prenom} ${j.nom}`); }}>${j.prenom} ${j.nom}${j.club ? ' · ' + j.club : ''}</button></li>`)}</ul>`}
      ${texte && !choix && trouves.length === 0 && html`<p class="aide">Aucun joueur avec des résultats ne correspond.</p>`}
    </section>
    ${!choix && html`<p class="vide">Cherche un joueur pour voir tous ses matchs et les points gagnés ou perdus à chaque rencontre.</p>`}
    ${choix && html`<h2><a href=${lien(['joueur', choix.id])}>${choix.prenom} ${choix.nom}</a></h2>
      ${histo && html`<p id="rj-bilan"><strong>${bilan.v} victoire${bilan.v > 1 ? 's' : ''} · ${bilan.d} défaite${bilan.d > 1 ? 's' : ''}</strong> · <span class=${bilan.points >= 0 ? 'gain' : 'perte'}>${fmtVariation(bilan.points)} pts au total</span></p>`}
      <${ListeMatchs} histo=${histo} />`}
  </div>`;
}

function Resultats({ initial }) {
  const [vue, setVue] = useState('competition');
  return html`<div>
    <div class="puces vues" role="group" aria-label="Trier les résultats">
      <button type="button" class="puce" id="vue-comp" aria-pressed=${vue === 'competition'} onClick=${() => setVue('competition')}>Par compétition</button>
      <button type="button" class="puce" id="vue-joueur" aria-pressed=${vue === 'joueur'} onClick=${() => setVue('joueur')}>Par joueur</button>
    </div>
    ${vue === 'competition' ? html`<${ResultatsCompetition} initial=${initial} />` : html`<${ResultatsJoueur} />`}
  </div>`;
}

/** Résultats d'une compétition par équipes : rencontres par tour (avec date) et classement des équipes. */
function ResultatsEquipes({ competition }) {
  const [rencontres, setRencontres] = useState(null);
  const [erreur, setErreur] = useState('');
  useEffect(() => {
    setRencontres(null);
    api.rencontresPubliques(competition).then(setRencontres).catch((e) => setErreur(msgErreur(e)));
  }, [competition]);
  const { tours, classement } = useMemo(() => {
    const t = new Map();
    const eq = new Map();
    const get = (nom) => { if (!eq.has(nom)) eq.set(nom, { nom, j: 0, v: 0, n: 0, d: 0, pour: 0, contre: 0 }); return eq.get(nom); };
    (rencontres || []).forEach((r) => {
      const cle = `${r.date_rencontre || ''}|${r.tour}`;
      if (!t.has(cle)) t.set(cle, { tour: r.tour, date: r.date_rencontre, liste: [] });
      t.get(cle).liste.push(r);
      if (r.matchs.length === 0) return;
      const A = get(r.equipe_a), B = get(r.equipe_b);
      A.j += 1; B.j += 1; A.pour += r.score_a; A.contre += r.score_b; B.pour += r.score_b; B.contre += r.score_a;
      if (r.score_a > r.score_b) { A.v += 1; B.d += 1; } else if (r.score_b > r.score_a) { B.v += 1; A.d += 1; } else { A.n += 1; B.n += 1; }
    });
    return {
      tours: [...t.values()],
      classement: [...eq.values()].sort((x, y) => (y.v + y.n / 2) - (x.v + x.n / 2) || (y.pour - y.contre) - (x.pour - x.contre) || x.nom.localeCompare(y.nom))
    };
  }, [rencontres]);
  if (erreur) return html`<p class="erreur" role="alert">${erreur}</p>`;
  if (rencontres === null) return html`<${Chargement} />`;
  if (!rencontres.length) return html`<p class="vide">Aucune rencontre pour cette compétition.</p>`;
  return html`<div>
    ${classement.length > 0 && html`<section class="carte"><h2>Classement des équipes</h2>
      <ul class="historique">${classement.map((x, k) => html`<li key=${x.nom}><span style="flex:1"><strong>${k + 1}. ${x.nom}</strong>
        <small> ${x.j} rencontre${x.j > 1 ? 's' : ''} · ${x.v} V · ${x.n} N · ${x.d} D · matchs ${x.pour}-${x.contre}</small></span></li>`)}</ul></section>`}
    ${tours.map((t) => html`<section class="carte" key=${t.tour + t.date}>
      <h2>${t.tour}${t.date ? ' · ' + new Date(t.date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}</h2>
      <ul class="matchs">${t.liste.map((r) => html`<li class="match" key=${r.rencontre_id}>
        <div class="match-score">
          <span class=${r.score_a > r.score_b ? 'gagnant' : ''}>${r.equipe_a}</span>
          <strong>${r.matchs.length ? `${r.score_a} - ${r.score_b}` : 'à jouer'}</strong>
          <span class=${r.score_b > r.score_a ? 'gagnant' : ''}>${r.equipe_b}</span></div>
        ${r.matchs.length > 0 && html`<details><summary>Détail des matchs (${r.matchs.length})</summary>
          <ul class="matchs">${r.matchs.map((m, i) => html`<li class="match" key=${i}>
            <div class="match-tete"><strong>${m.type === 'double' ? 'Double' : 'Simple'}</strong></div>
            <div class="match-score">
              <span class=${m.sets_a > m.sets_b ? 'gagnant' : ''}><${Noms} r=${{ liste: m.a }} /></span>
              <strong>${m.sets_a} - ${m.sets_b}</strong>
              <span class=${m.sets_b > m.sets_a ? 'gagnant' : ''}><${Noms} r=${{ liste: m.b }} /></span></div>
            <small>${m.manches}</small></li>`)}</ul></details>`}
      </li>`)}</ul></section>`)}
  </div>`;
}

function ResultatsCompetition({ initial }) {
  const [comps, setComps] = useState(null);
  const [choix, setChoix] = useState('');
  const [lignes, setLignes] = useState(null);
  const [erreur, setErreur] = useState('');
  useEffect(() => { api.competitionsPubliques().then((c) => { setComps(c); setChoix(c.some((x) => x.id === initial) ? initial : c[0]?.id || ''); }).catch((e) => setErreur(msgErreur(e))); }, []);
  const compChoisie = comps?.find((c) => c.id === choix);
  const parEquipes = compChoisie?.type === 'equipe';
  useEffect(() => {
    if (!choix || parEquipes) { setLignes([]); return; }
    setLignes(null);
    api.resultatsPublics(choix).then(setLignes).catch((e) => setErreur(msgErreur(e)));
  }, [choix, parEquipes]);
  const matchs = useMemo(() => {
    const m = new Map();
    (lignes || []).forEach((r) => {
      if (!m.has(r.match_id)) m.set(r.match_id, { id: r.match_id, tour: r.tour, manches: r.manches, double: r.type_match === 'double' });
      m.get(r.match_id)[r.cote] = r;
    });
    return [...m.values()].filter((x) => x.A && x.B);
  }, [lignes]);
  function exporter() {
    const comp = comps.find((c) => c.id === choix);
    telechargerCsv(`resultats-${norm(comp?.nom || '').replace(/[^a-z0-9]+/g, '-')}.csv`,
      ['Compétition', 'Tour', 'Type', 'Joueur(s) A', 'Sets A', 'Points A', 'Joueur(s) B', 'Sets B', 'Points B', 'Manches (vues de A)'],
      matchs.map((x) => [comp?.nom || '', x.tour || '', x.double ? 'Double' : 'Simple', x.A.joueurs, x.A.sets_gagnes, x.A.points ?? '', x.B.joueurs, x.B.sets_gagnes, x.B.points ?? '', x.manches]));
  }
  if (erreur) return html`<p class="erreur" role="alert">${erreur}</p>`;
  if (comps === null) return html`<${Chargement} />`;
  if (!comps.length) return html`<p class="vide">Aucun résultat publié pour le moment.</p>`;
  return html`<div class="page-corps">
    <section class="carte filtres"><select aria-label="Compétition" value=${choix} onChange=${(e) => setChoix(e.target.value)}>
      ${comps.map((c) => html`<option key=${c.id} value=${c.id}>${c.nom} · ${new Date(c.date_debut + 'T12:00:00').toLocaleDateString('fr-FR')}</option>`)}</select></section>
    ${parEquipes && html`<${ResultatsEquipes} competition=${choix} />`}
    ${!parEquipes && matchs.length > 0 && html`<p><button class="btn btn-secondaire" type="button" id="exp-resultats" onClick=${exporter}>Exporter (CSV)</button></p>`}
    ${parEquipes ? null : lignes === null ? html`<${Chargement} />` : matchs.length === 0 ? html`<p class="vide">Aucun résultat validé pour cette compétition.</p>` : html`<ul class="matchs">
      ${matchs.map((x) => html`<li class="match" key=${x.id}>
        <div class="match-tete"><strong>${x.tour || 'Match'}</strong>${x.double ? html`<span class="pastille">Double</span>` : ''}</div>
        <div class="match-score">
          <span class=${x.A.sets_gagnes > x.B.sets_gagnes ? 'gagnant' : ''}><${Noms} r=${x.A} /><${PointsCote} r=${x.A} /></span>
          <strong>${x.A.sets_gagnes} - ${x.B.sets_gagnes}</strong>
          <span class=${x.B.sets_gagnes > x.A.sets_gagnes ? 'gagnant' : ''}><${Noms} r=${x.B} /><${PointsCote} r=${x.B} /></span></div>
        <small>${x.manches}</small></li>`)}
    </ul>`}
  </div>`;
}

export function OngletsPublics({ actif }) {
  const o = [['classement', 'Classement'], ['resultats', 'Résultats'], ['calendrier', 'Calendrier'], ['simulateur', 'Simulateur'], ['sinscrire', 'Je m\'inscris']];
  return html`<div class="puces" role="group" aria-label="Section">
    ${o.map(([k, t]) => html`<a class="puce" aria-pressed=${actif === k} href=${'#/' + k}>${t}</a>`)}
  </div>`;
}

export function PagePublique({ route, connecte }) {
  const onglet = route.parts[0] === 'resultats' ? 'resultats' : 'classement';
  return html`<div class="page">
    <div class="page-tete"><div><h1>${onglet === 'classement' ? 'Classement' : 'Résultats'}</h1><p>Fédération Tahitienne de Tennis de Table</p></div></div>
    <${OngletsPublics} actif=${onglet} />
    ${onglet === 'classement' ? html`<${Classement} />` : html`<${Resultats} initial=${route.query?.competition} />`}
  </div>`;
}
