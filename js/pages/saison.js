// Vue « Saison » : les 12 mois d'un coup d'œil (compétitions, stages, événements). Lecture publique, sans compte.
// Grand écran : grille de 12 mois comme le calendrier papier. Téléphone : un mois à la fois, même code couleur.
import { html, useState, useEffect, useMemo } from '../preact.js';
import { api } from '../data.js';
import { msgErreur, lien, aujourdhuiISO, fmtDate } from '../lib.js';
import { Chargement } from '../ui.js';
import { OngletsPublics } from './public.js';

const MOIS = ['Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin'];
const JOURS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const TYPES = {
  competition: ['Compétition', 'sg-competition'],
  equipe: ['Par équipe', 'sg-equipe'],
  stage: ['Stage', 'sg-stage'],
  ittf: ['ITTF / international', 'sg-ittf'],
  evenement: ['Événement', 'sg-evenement']
};
const deux = (n) => String(n).padStart(2, '0');
const iso = (a, m, d) => `${a}-${deux(m + 1)}-${deux(d)}`;
const nbJours = (a, m) => new Date(Date.UTC(a, m + 1, 0)).getUTCDate();

/** Les 12 mois d'une saison : juillet de l'année `an` à juin de `an + 1`. */
const moisDeSaison = (an) => MOIS.map((nom, i) => ({ nom, a: i < 6 ? an : an + 1, m: (6 + i) % 12 }));

function saisonDuJour() {
  const j = aujourdhuiISO();
  const a = Number(j.slice(0, 4));
  return Number(j.slice(5, 7)) >= 7 ? a : a - 1;
}

/** Regroupe les compétitions par événement ; une compétition par équipes apparaît à la date de chaque tour. */
function construire(comps, evts, stagesOuverts = new Set()) {
  const items = [];
  const groupes = new Map();
  for (const c of comps) { const k = c.evenement_id || c.id; if (!groupes.has(k)) groupes.set(k, []); groupes.get(k).push(c); }
  for (const [k, g] of groupes) {
    const titre = g[0].nom.split(' – ')[0];
    const tours = g.flatMap((c) => (Array.isArray(c.tours) ? c.tours : []));
    if (tours.length) {
      const vus = new Set();
      for (const t of tours) {
        if (vus.has(t.date)) continue;
        vus.add(t.date);
        items.push({ cle: `${k}|${t.date}`, titre, detail: t.nom, debut: t.date, fin: t.date, type: 'equipe', pageComp: true });
      }
      continue;
    }
    const plages = new Map();
    for (const c of g) {
      const f = c.date_fin || c.date_debut;
      const cle = `${c.date_debut}|${f}`;
      if (!plages.has(cle)) plages.set(cle, { debut: c.date_debut, fin: f, noms: [] });
      plages.get(cle).noms.push(c.nom.includes(' – ') ? c.nom.split(' – ').slice(1).join(' – ') : c.nom);
    }
    for (const [cle, p] of plages) {
      const noms = p.noms.filter((n) => n !== titre);
      items.push({ cle: `${k}|${cle}`, titre, detail: noms.length > 4 ? `${noms.length} tableaux` : noms.join(', '), debut: p.debut, fin: p.fin, type: 'competition', pageComp: true });
    }
  }
  for (const e of evts) items.push({ cle: e.id, titre: e.nom, detail: e.lieu || '', debut: e.date_debut, fin: e.date_fin, type: e.categorie, annule: !!e.annule, pageStage: stagesOuverts.has(e.id) });
  return items;
}

/** Index « jour (AAAA-MM-JJ) → éléments qui tombent ce jour-là », limité à la saison affichée. */
function indexer(items, mois) {
  const premier = iso(mois[0].a, mois[0].m, 1);
  const dernier = iso(mois[11].a, mois[11].m, nbJours(mois[11].a, mois[11].m));
  const idx = new Map();
  for (const it of items) {
    if (it.fin < premier || it.debut > dernier) continue;
    const d = new Date(`${it.debut < premier ? premier : it.debut}T00:00:00Z`);
    const f = new Date(`${it.fin > dernier ? dernier : it.fin}T00:00:00Z`);
    for (; d <= f; d.setUTCDate(d.getUTCDate() + 1)) {
      const k = d.toISOString().slice(0, 10);
      if (!idx.has(k)) idx.set(k, []);
      idx.get(k).push(it);
    }
  }
  return idx;
}

const infobulle = (it) => `${it.titre}${it.detail ? ' – ' + it.detail : ''} (${it.debut === it.fin ? fmtDate(it.debut) : fmtDate(it.debut) + ' → ' + fmtDate(it.fin)})${it.annule ? ' – annulé' : ''}`;

function Bloc({ it }) {
  const [, classe] = TYPES[it.type] || TYPES.evenement;
  const texte = html`<span class="sg-texte">${it.titre}${it.annule ? ' (annulé)' : ''}</span>`;
  return it.pageComp || it.pageStage
    ? html`<a class=${'sg-lien ' + classe + (it.annule ? ' sg-annule' : '')} href=${lien([it.pageStage ? 'stages' : 'calendrier'])} title=${infobulle(it) + (it.pageStage ? ' – inscriptions ouvertes' : '')}>${texte}</a>`
    : html`<span class=${'sg-lien ' + classe + (it.annule ? ' sg-annule' : '')} title=${infobulle(it)}>${texte}</span>`;
}

/** Cellules d'un mois : un même élément sur plusieurs jours consécutifs forme un seul bloc (rowspan). */
function planMois(mo, idx) {
  const n = nbJours(mo.a, mo.m);
  const plan = [];
  let tete = null;
  for (let d = 1; d <= n; d++) {
    const its = idx.get(iso(mo.a, mo.m, d)) || [];
    if (its.length === 1) {
      if (tete && tete.it === its[0]) { tete.rowspan += 1; plan[d] = { skip: true }; } else { tete = { it: its[0], rowspan: 1 }; plan[d] = { tete }; }
    } else { tete = null; plan[d] = its.length ? { multi: its } : {}; }
  }
  return plan;
}

function Grille({ mois, idx, aujourdhui }) {
  const plans = mois.map((mo) => planMois(mo, idx));
  const lignes = [];
  for (let d = 1; d <= 31; d++) {
    lignes.push(html`<tr key=${d}>
      ${mois.map((mo, i) => {
        if (d > nbJours(mo.a, mo.m)) return html`<td key=${i} colspan="3" class="sg-nul"></td>`;
        const wd = new Date(Date.UTC(mo.a, mo.m, d)).getUTCDay();
        const we = wd === 0 || wd === 6 ? ' sg-we' : '';
        const auj = iso(mo.a, mo.m, d) === aujourdhui ? ' sg-auj' : '';
        const p = plans[i][d];
        return html`<${Fragment2} key=${i}>
          <td class=${'sg-j' + we + auj}>${JOURS[wd]}</td><td class=${'sg-n' + we + auj}>${d}</td>
          ${p.skip ? null : p.tete ? html`<td class=${'sg-c sg-bloc' + we} rowspan=${p.tete.rowspan}><div class="sg-box"><${Bloc} it=${p.tete.it} /></div></td>`
            : p.multi ? html`<td class=${'sg-c sg-bloc' + we}><div class="sg-box sg-multi">${p.multi.map((it) => html`<${Bloc} key=${it.cle} it=${it} />`)}</div></td>`
            : html`<td class=${'sg-c' + we}></td>`}
        <//>`;
      })}
    </tr>`);
  }
  return html`<div class="sg-defile"><table class="sg-table" aria-label="Calendrier de la saison">
    <thead><tr>${mois.map((mo) => html`<th key=${mo.m} colspan="3" scope="colgroup">${mo.nom}${mois.length === 1 ? ' ' + mo.a : ''}</th>`)}</tr></thead>
    <tbody>${lignes}</tbody></table></div>`;
}

// Petit composant pour renvoyer plusieurs cellules d'une même colonne de mois.
function Fragment2({ children }) { return children; }

export function PageSaison() {
  const [an, setAn] = useState(saisonDuJour());
  const [comps, setComps] = useState(null);
  const [evts, setEvts] = useState([]);
  const [stagesOuverts, setStagesOuverts] = useState(() => new Set());
  const [erreur, setErreur] = useState('');
  const [petit, setPetit] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 820px)').matches);
  const mois = useMemo(() => moisDeSaison(an), [an]);
  const [choix, setChoix] = useState(() => {
    const j = aujourdhui();
    const i = moisDeSaison(saisonDuJour()).findIndex((mo) => iso(mo.a, mo.m, 1).slice(0, 7) === j.slice(0, 7));
    return i < 0 ? 0 : i;
  });

  useEffect(() => {
    api.calendrierPublic().then(setComps).catch((e) => setErreur(msgErreur(e)));
    api.evenementsCalendrier().then(setEvts).catch(() => setEvts([]));
    api.stagesPublics().then((l) => setStagesOuverts(new Set(l.map((x) => x.evenement_id).filter(Boolean)))).catch(() => {});
  }, []);
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const q = window.matchMedia('(max-width: 820px)');
    const f = () => setPetit(q.matches);
    q.addEventListener('change', f);
    return () => q.removeEventListener('change', f);
  }, []);

  const items = useMemo(() => (comps ? construire(comps, evts || [], stagesOuverts) : []), [comps, evts, stagesOuverts]);
  const idx = useMemo(() => indexer(items, mois), [items, mois]);
  const aujourdhui_ = aujourdhui();

  return html`<div class="page page-large">
    <div class="page-tete"><div><h1>Saison ${an}-${an + 1}</h1><p>Compétitions, stages et événements de la saison</p></div></div>
    <${OngletsPublics} actif="saison" />
    <div class="sg-barre">
      <button class="btn btn-secondaire" type="button" onClick=${() => setAn(an - 1)} aria-label="Saison précédente">◀ ${an - 1}-${an}</button>
      <button class="btn btn-secondaire" type="button" onClick=${() => setAn(an + 1)} aria-label="Saison suivante">${an + 1}-${an + 2} ▶</button>
    </div>
    <ul class="sg-legende" aria-label="Légende">
      ${Object.values(TYPES).map(([nom, classe]) => html`<li key=${classe}><span class=${'sg-pastille ' + classe}></span>${nom}</li>`)}
    </ul>
    ${petit && html`<div class="puces sg-mois" role="group" aria-label="Mois">
      ${mois.map((mo, i) => html`<button key=${mo.m} type="button" class="puce" aria-pressed=${choix === i} onClick=${() => setChoix(i)}>${mo.nom.slice(0, 4)}.</button>`)}
    </div>`}
    ${erreur && html`<p class="erreur" role="alert">${erreur}</p>`}
    ${!comps && !erreur && html`<${Chargement} />`}
    ${comps && html`<${Grille} mois=${petit ? [mois[choix]] : mois} idx=${idx} aujourdhui=${aujourdhui_} />`}
    ${comps && items.length === 0 && html`<p class="vide">Rien n'est encore au calendrier pour cette saison.</p>`}
  </div>`;
}

function aujourdhui() { return aujourdhuiISO(); }
