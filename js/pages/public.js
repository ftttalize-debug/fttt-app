// Pages publiques (lisibles sans connexion) : classement et résultats. Seuls le nom, le club,
// la catégorie, les points et les résultats validés sont affichés.
import { html, useState, useEffect, useMemo } from '../preact.js';
import { api } from '../data.js';
import { norm, fmtPts, CATEGORIES, msgErreur, lien } from '../lib.js';
import { Chargement } from '../ui.js';

const libelleMois = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
const PAGE = 50;

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
      .filter((l) => (cat ? norm(l.categorie) === norm(cat) : true))
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
          <option value="">Toutes les catégories</option>${CATEGORIES.map((c) => html`<option key=${c} value=${c}>${c}</option>`)}</select>
        <select aria-label="Sexe" value=${sexe} onChange=${(e) => { setSexe(e.target.value); setNb(PAGE); }}>
          <option value="">Dames et messieurs</option><option value="F">Dames</option><option value="M">Messieurs</option></select>
      </div>
    </section>
    <p class="compte-resultats" role="status">${liste.length} joueur${liste.length > 1 ? 's' : ''}</p>
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

function Resultats({ initial }) {
  const [comps, setComps] = useState(null);
  const [choix, setChoix] = useState('');
  const [lignes, setLignes] = useState(null);
  const [erreur, setErreur] = useState('');
  useEffect(() => { api.competitionsPubliques().then((c) => { setComps(c); setChoix(c.some((x) => x.id === initial) ? initial : c[0]?.id || ''); }).catch((e) => setErreur(msgErreur(e))); }, []);
  useEffect(() => {
    if (!choix) { setLignes([]); return; }
    setLignes(null);
    api.resultatsPublics(choix).then(setLignes).catch((e) => setErreur(msgErreur(e)));
  }, [choix]);
  const matchs = useMemo(() => {
    const m = new Map();
    (lignes || []).forEach((r) => {
      if (!m.has(r.match_id)) m.set(r.match_id, { id: r.match_id, tour: r.tour, manches: r.manches, double: r.type_match === 'double' });
      m.get(r.match_id)[r.cote] = r;
    });
    return [...m.values()].filter((x) => x.A && x.B);
  }, [lignes]);
  if (erreur) return html`<p class="erreur" role="alert">${erreur}</p>`;
  if (comps === null) return html`<${Chargement} />`;
  if (!comps.length) return html`<p class="vide">Aucun résultat publié pour le moment.</p>`;
  return html`<div class="page-corps">
    <section class="carte filtres"><select aria-label="Compétition" value=${choix} onChange=${(e) => setChoix(e.target.value)}>
      ${comps.map((c) => html`<option key=${c.id} value=${c.id}>${c.nom} · ${new Date(c.date_debut + 'T12:00:00').toLocaleDateString('fr-FR')}</option>`)}</select></section>
    ${lignes === null ? html`<${Chargement} />` : matchs.length === 0 ? html`<p class="vide">Aucun résultat validé pour cette compétition.</p>` : html`<ul class="matchs">
      ${matchs.map((x) => html`<li class="match" key=${x.id}>
        <div class="match-tete"><strong>${x.tour || 'Match'}</strong>${x.double ? html`<span class="pastille">Double</span>` : ''}</div>
        <div class="match-score">
          <span class=${x.A.sets_gagnes > x.B.sets_gagnes ? 'gagnant' : ''}><${Noms} r=${x.A} /></span>
          <strong>${x.A.sets_gagnes} - ${x.B.sets_gagnes}</strong>
          <span class=${x.B.sets_gagnes > x.A.sets_gagnes ? 'gagnant' : ''}><${Noms} r=${x.B} /></span></div>
        <small>${x.manches}</small></li>`)}
    </ul>`}
  </div>`;
}

export function OngletsPublics({ actif }) {
  const o = [['classement', 'Classement'], ['resultats', 'Résultats'], ['calendrier', 'Calendrier'], ['simulateur', 'Simulateur']];
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
