// Feuille de rencontre : les matchs apparaissent dans l'ordre de la feuille papier, joueurs déjà remplis.
// Le juge-arbitre tape les scores comme sur le papier : « -7 7 9 -2 8 »
//   nombre seul = le joueur de gauche (A) gagne la manche, le nombre est le score de l'adversaire ;
//   signe moins  = A perd la manche, le nombre est le score de A.
import { html, useState } from '../preact.js';
import { api } from '../data.js';
import { nomComplet, msgErreur } from '../lib.js';
import { toast, BadgePts, Pastille } from '../ui.js';
import { LigneMatch } from './matchs.js';

const S = (a, b) => ({ t: 'S', a: [a], b: [b] });
const D = (a, b) => ({ t: 'D', a, b });
const MODELES = {
  // 4 joueurs par équipe : 16 simples + 2 doubles (A B C D contre W X Y Z)
  '16/2': { lA: ['A', 'B', 'C', 'D'], lB: ['W', 'X', 'Y', 'Z'], lignes: [
    S(0, 0), S(1, 1), S(2, 2), S(3, 3), S(0, 1), S(1, 0), S(3, 2), S(2, 3),
    D([0, 1], [0, 1]), D([2, 3], [2, 3]),
    S(3, 0), S(2, 1), S(0, 3), S(1, 2), S(2, 0), S(3, 1), S(0, 2), S(1, 3)] },
  // 3 joueurs par équipe : 9 simples + 1 double (A B C contre X Y Z)
  '9/1': { lA: ['A', 'B', 'C'], lB: ['X', 'Y', 'Z'], lignes: [
    S(0, 0), S(1, 1), S(2, 2), S(1, 0), D([0, 1], [0, 1]), S(0, 2), S(2, 1), S(1, 2), S(2, 0), S(0, 1)] },
};
export const modeleFeuille = (c) => MODELES[`${c.nb_simples}/${c.nb_doubles}`] || null;

/** Lit « 11-7 8-11 11-9 » : chaque manche s'écrit avec les DEUX scores (joueur de gauche d'abord). */
function lire(texte, n) {
  const t = (texte || '').trim();
  if (!t) return { vide: true };
  const manches = [];
  for (const tok of t.split(/[\s,;]+/).filter(Boolean)) {
    const m = /^(\d{1,2})[-:/.](\d{1,2})$/.exec(tok);
    if (!m) return { erreur: `« ${tok} » : écris les deux scores, par exemple 11-7.` };
    const x = Number(m[1]), y = Number(m[2]), g = Math.max(x, y), p = Math.min(x, y);
    if (g < 11 || g - p < 2 || (g > 11 && g - p !== 2)) return { erreur: `« ${tok} » n'est pas un score de manche possible.` };
    manches.push([x, y]);
  }
  let sa = 0, sb = 0;
  for (let i = 0; i < manches.length; i += 1) {
    if (sa === n || sb === n) return { erreur: `Le match était déjà fini avant la manche ${i + 1}.` };
    if (manches[i][0] > manches[i][1]) sa += 1; else sb += 1;
  }
  if (sa !== n && sb !== n) return { erreur: `Il manque des manches (${sa}-${sb} pour l'instant).` };
  return { manches, sa, sb };
}
const notation = (m) => m.manches.map((x) => `${x.score_a}-${x.score_b}`).join(' ');
const nomJ = (ctx, id) => { const l = ctx.licencieParId.get(id); return l ? nomComplet(l) : 'Joueur'; };

export function FeuilleRencontre({ ctx, c, r, modele, listeA, listeB, matchs, nomA, nomB, onEdit }) {
  const [n, setN] = useState(matchs.find((m) => m.sets_gagnants)?.sets_gagnants || 3);
  const [edits, setEdits] = useState({});
  const [erreurs, setErreurs] = useState({});
  const [paires, setPaires] = useState({});
  const [occupe, setOccupe] = useState(null);

  const simples = matchs.filter((m) => m.type_match !== 'double');
  const doubles = matchs.filter((m) => m.type_match === 'double').slice().sort((x, y) => x.created_at.localeCompare(y.created_at));
  let kd = 0;
  const utilises = new Set();
  const lignes = modele.lignes.map((l, i) => {
    let a = l.a, b = l.b, saved = null;
    if (l.t === 'D') {
      saved = doubles[kd] || null; kd += 1;
      if (saved) { a = saved.A.map((p) => listeA.indexOf(p.licencie_id)); b = saved.B.map((p) => listeB.indexOf(p.licencie_id)); }
      else if (paires[i]) { a = paires[i].a; b = paires[i].b; }
    } else {
      saved = simples.find((m) => m.A[0]?.licencie_id === listeA[a[0]] && m.B[0]?.licencie_id === listeB[b[0]]) || null;
    }
    if (saved) utilises.add(saved.id);
    return { ...l, i, a, b, saved, idsA: a.map((k) => listeA[k]), idsB: b.map((k) => listeB[k]) };
  });
  const extras = matchs.filter((m) => !utilises.has(m.id));
  const nomsDe = (ids) => ids.map((id) => nomJ(ctx, id)).join(' / ');

  async function agir(i, fn, message) {
    setOccupe(i);
    try { await fn(); await ctx.recharger(); setErreurs((e) => ({ ...e, [i]: '' })); if (message) toast(message); return true; }
    catch (e) { setErreurs((x) => ({ ...x, [i]: msgErreur(e) })); return false; }
    finally { setOccupe(null); }
  }
  async function enregistrer(L) {
    const texte = edits[L.i];
    if (texte === undefined) return;
    const lec = lire(texte, n);
    if (lec.vide) { setEdits(({ [L.i]: _, ...reste }) => reste); return; }
    if (lec.erreur) { setErreurs((e) => ({ ...e, [L.i]: lec.erreur })); return; }
    if (L.idsA.some((x) => !x) || L.idsB.some((x) => !x)) { setErreurs((e) => ({ ...e, [L.i]: 'Choisis les joueurs du double.' })); return; }
    if (new Set([...L.idsA, ...L.idsB]).size !== L.idsA.length + L.idsB.length) { setErreurs((e) => ({ ...e, [L.i]: 'Un joueur apparaît deux fois.' })); return; }
    const ok = await agir(L.i, () => api.saisirMatchRencontre({ rencontre: r.id, type: L.t === 'D' ? 'double' : 'simple', setsGagnants: n,
      coteA: L.idsA, coteB: L.idsB, manches: lec.manches, match: L.saved?.id }));
    if (ok) setEdits(({ [L.i]: _, ...reste }) => reste);
  }
  const forfait = (L, v) => agir(L.i, () => (v === '' ? api.supprimerMatch(L.saved.id)
    : api.saisirForfaitRencontre({ rencontre: r.id, type: L.t === 'D' ? 'double' : 'simple', coteA: L.idsA, coteB: L.idsB, coteForfait: v, match: L.saved?.id })));
  const effacer = (L) => agir(L.i, () => api.supprimerMatch(L.saved.id), 'Match effacé.');
  const suivant = (e) => {
    const champs = [...document.querySelectorAll('.lf-input:not([disabled])')];
    const k = champs.indexOf(e.target);
    if (champs[k + 1]) champs[k + 1].focus(); else e.target.blur();
  };
  const choisir = (L, cote, pos, val) => setPaires((p) => {
    const cur = p[L.i] || { a: L.a.slice(), b: L.b.slice() };
    const x = { a: cur.a.slice(), b: cur.b.slice() }; x[cote][pos] = Number(val); return { ...p, [L.i]: x };
  });

  return html`<div class="feuille">
    <div class="lf-entete">
      <span><strong>Sets gagnants</strong></span>
      ${[3, 4].map((v) => html`<button key=${v} type="button" class="puce" aria-pressed=${n === v} disabled=${matchs.length > 0 && v !== n && false} onClick=${() => setN(v)}>${v}</button>`)}
    </div>
    <p class="aide">Tape les scores de chaque manche avec <strong>les deux scores</strong>, le 1er joueur en premier, séparés par un espace. Exemple : <strong>11-7 8-11 11-9 11-5</strong>. Valide avec Entrée : le match est enregistré et tu passes au suivant.</p>
    <ol class="lf-liste">${lignes.map((L) => {
      const s = L.saved; const fixe = s && s.statut === 'valide';
      const valeur = edits[L.i] ?? (s && !s.forfait_cote ? notation(s) : '');
      const lec = edits[L.i] !== undefined ? lire(edits[L.i], n) : null;
      const gagneA = s && s.setsA > s.setsB;
      return html`<li key=${L.i} class=${'lf' + (s ? ' lf-fait' : '')}>
        <div class="lf-noms"><span class="lf-num">${L.i + 1}</span>
          ${L.t === 'D' ? html`<span class="lf-double">Double</span>` : ''}
          <span class=${gagneA ? 'gagnant' : ''}>${L.t === 'D' && !s ? '' : html`${nomsDe(L.idsA)} <small>${L.a.map((k) => modele.lA[k]).join('+')}</small>`}</span>
          ${L.t === 'D' && !s ? html`<span class="lf-paire">${[0, 1].map((p) => html`<select key=${'a' + p} aria-label=${`Joueur ${p + 1} de ${nomA}`} value=${L.a[p]} onChange=${(e) => choisir(L, 'a', p, e.target.value)}>
              ${listeA.map((id, k) => html`<option key=${id} value=${k}>${nomJ(ctx, id)}</option>`)}</select>`)}</span>` : ''}
          <span class="lf-contre">contre</span>
          <span class=${s && !gagneA ? 'gagnant' : ''}>${L.t === 'D' && !s ? '' : html`${nomsDe(L.idsB)} <small>${L.b.map((k) => modele.lB[k]).join('+')}</small>`}</span>
          ${L.t === 'D' && !s ? html`<span class="lf-paire">${[0, 1].map((p) => html`<select key=${'b' + p} aria-label=${`Joueur ${p + 1} de ${nomB}`} value=${L.b[p]} onChange=${(e) => choisir(L, 'b', p, e.target.value)}>
              ${listeB.map((id, k) => html`<option key=${id} value=${k}>${nomJ(ctx, id)}</option>`)}</select>`)}</span>` : ''}
        </div>
        ${s && s.forfait_cote
          ? html`<div class="lf-etat"><${Pastille} genre="alerte">Forfait de ${s.forfait_cote === 'A' ? nomA : nomB}<//> <small>3-0 pour l'adversaire, aucun point</small></div>`
          : html`<input class="lf-input" type="text" inputmode="text" autocapitalize="off" autocomplete="off" spellcheck="false" enterkeyhint="next"
              placeholder="ex. 11-7 8-11 11-9 11-5" aria-label=${`Scores du match ${L.i + 1}`} disabled=${fixe || occupe === L.i} value=${valeur}
              onInput=${(e) => setEdits((x) => ({ ...x, [L.i]: e.target.value.replace(/[−–—]/g, '-') }))}
              onBlur=${() => enregistrer(L)} onKeyDown=${(e) => { if (e.key === 'Enter') { e.preventDefault(); enregistrer(L).then(() => suivant(e)); } }} />`}
        <div class="lf-etat">
          ${lec && !lec.vide && !lec.erreur ? html`<span class="lf-ok">${lec.sa}-${lec.sb} · ${lec.sa > lec.sb ? 'victoire de' : 'défaite de'} ${nomsDe(L.idsA)}</span>` : ''}
          ${lec && lec.erreur ? html`<span class="lf-err">${lec.erreur}</span>` : ''}
          ${erreurs[L.i] ? html`<span class="lf-err" role="alert">${erreurs[L.i]}</span>` : ''}
          ${!lec && s && !s.forfait_cote ? html`<span class="lf-ok">${s.setsA}-${s.setsB} · enregistré${s.statut === 'rejete' ? ' (rejeté : à corriger)' : ''}${fixe ? ' · validé' : ''}</span>` : ''}
          ${fixe && s.type_match !== 'double' ? html`<span class="lf-pts">${s.A[0] ? html`<${BadgePts} v=${s.A[0].points_finaux} />` : ''} / ${s.B[0] ? html`<${BadgePts} v=${s.B[0].points_finaux} />` : ''}</span>` : ''}
        </div>
        ${!fixe && html`<div class="lf-actions">
          <select class="lf-forfait" aria-label="Forfait" value=${s?.forfait_cote || ''} disabled=${occupe === L.i} onChange=${(e) => forfait(L, e.target.value)}>
            <option value="">Match joué</option><option value="A">Forfait de ${nomA}</option><option value="B">Forfait de ${nomB}</option></select>
          ${s && html`<button class="btn btn-lien" type="button" disabled=${occupe === L.i} onClick=${() => effacer(L)}>Effacer</button>`}
        </div>`}
      </li>`; })}</ol>
    ${extras.length > 0 && html`<h4>Autres matchs de la rencontre</h4><ul class="matchs">${extras.map((m) => html`<${LigneMatch} key=${m.id} ctx=${ctx} c=${c} m=${m} peutSaisir=${true} onEdit=${onEdit} />`)}</ul>`}
  </div>`;
}
