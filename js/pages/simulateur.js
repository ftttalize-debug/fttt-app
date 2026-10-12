// Simulateur de points (public) : estime le gain ou la perte de points selon le barème officiel.
import { html, useState, useEffect, useMemo } from '../preact.js';
import { api } from '../data.js';
import { pointsMatch, fmtVariation, fmtPts, msgErreur } from '../lib.js';
import { Chargement } from '../ui.js';
import { OngletsPublics } from './public.js';

const COEFS = [['0.5', '0,5'], ['0.75', '0,75'], ['1', '1'], ['1.25', '1,25'], ['1.5', '1,5']];
const nombre = (v) => (v === '' || v === null || isNaN(Number(v)) ? null : Number(v));

export function PageSimulateur({ route }) {
  const [bareme, setBareme] = useState(null);
  const [erreur, setErreur] = useState('');
  const [moi, setMoi] = useState('500');
  const [coef, setCoef] = useState(route?.query?.coef && COEFS.some((c) => c[0] === route.query.coef) ? route.query.coef : '1');
  const [matchs, setMatchs] = useState([{ id: 1, adv: '500', victoire: true }]);
  const [suite, setSuite] = useState(2);

  useEffect(() => { api.baremePublic().then(setBareme).catch((e) => setErreur(msgErreur(e))); }, []);

  const mesPts = nombre(moi);
  const lignes = useMemo(() => matchs.map((m) => {
    const adv = nombre(m.adv);
    if (!bareme || mesPts === null || adv === null) return { ...m, ecart: null, pts: null };
    const ecart = adv - mesPts;
    return { ...m, ecart, pts: pointsMatch(bareme, ecart, m.victoire, Number(coef)) };
  }), [matchs, bareme, mesPts, coef]);
  const total = lignes.reduce((t, l) => t + (l.pts || 0), 0);
  const complet = lignes.some((l) => l.pts !== null);

  const maj = (id, patch) => setMatchs(matchs.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  const ajouter = () => { setMatchs([...matchs, { id: suite, adv: '500', victoire: true }]); setSuite(suite + 1); };
  const retirer = (id) => setMatchs(matchs.filter((m) => m.id !== id));

  return html`<div class="page">
    <div class="page-tete"><div><h1>Simulateur de points</h1><p>Estime ce que te rapporte ou te coûte un match, selon le barème officiel.</p></div></div>
    <${OngletsPublics} actif="simulateur" />
    ${erreur && html`<p class="erreur" role="alert">${erreur}</p>`}
    ${!bareme && !erreur && html`<${Chargement} />`}
    ${bareme && html`<div class="page-corps">
      <section class="carte" aria-label="Paramètres">
        <div class="grille grille-2">
          <label class="champ-sim">Mes points
            <input id="s-moi" type="number" inputmode="decimal" step="0.1" value=${moi} onInput=${(e) => setMoi(e.target.value)} /></label>
          <label class="champ-sim">Coefficient de la compétition
            <select id="s-coef" value=${coef} onChange=${(e) => setCoef(e.target.value)}>
              ${COEFS.map(([v, t]) => html`<option value=${v}>${t}</option>`)}</select></label>
        </div>
        <p class="aide">Les points sont calculés sur ceux que chacun avait à la clôture de la compétition : tous les matchs d'une même compétition utilisent donc tes points de départ. Seuls les simples comptent.</p>
      </section>

      <ul class="matchs sim-matchs">
        ${lignes.map((l, i) => html`<li class="match sim-match" key=${l.id}>
          <div class="match-tete"><strong>Match ${i + 1}</strong>
            ${lignes.length > 1 && html`<button class="btn btn-lien" type="button" aria-label=${'Retirer le match ' + (i + 1)} onClick=${() => retirer(l.id)}>Retirer</button>`}</div>
          <label class="champ-sim">Points de l'adversaire
            <input class="s-adv" type="number" inputmode="decimal" step="0.1" value=${l.adv} onInput=${(e) => maj(l.id, { adv: e.target.value })} /></label>
          <div class="puces" role="group" aria-label=${'Résultat du match ' + (i + 1)}>
            <button type="button" class="puce s-vic" aria-pressed=${l.victoire} onClick=${() => maj(l.id, { victoire: true })}>Victoire</button>
            <button type="button" class="puce s-def" aria-pressed=${!l.victoire} onClick=${() => maj(l.id, { victoire: false })}>Défaite</button>
          </div>
          <p class="sim-res" role="status">${l.pts === null ? 'Renseigne les deux totaux de points.'
            : html`Écart ${l.ecart > 0 ? '+' : ''}${fmtPts(l.ecart)} · <strong class=${'s-pts ' + (l.pts >= 0 ? 'gain' : 'perte')}>${fmtVariation(l.pts)} pt${Math.abs(l.pts) > 1 ? 's' : ''}</strong>`}</p>
        </li>`)}
      </ul>
      <button class="btn btn-secondaire" type="button" id="s-ajout" onClick=${ajouter}>Ajouter un match</button>

      ${complet && html`<section class="carte sim-total" aria-label="Total" role="status">
        <p>Total sur ${lignes.length} match${lignes.length > 1 ? 's' : ''} : <strong id="s-total" class=${total >= 0 ? 'gain' : 'perte'}>${fmtVariation(Math.round(total * 10) / 10)} pts</strong></p>
        ${mesPts !== null && html`<p>Nouveau total estimé : <strong id="s-nouveau">${fmtPts(Math.round((mesPts + total) * 10) / 10)} pts</strong></p>`}
        <p class="aide">Simulation indicative. Les points sont appliqués après validation des matchs et clôture du mois par la fédération.</p>
      </section>`}

      <details class="carte bareme-detail">
        <summary>Voir le barème (coefficient 1)</summary>
        <div class="tableau-defilant"><table class="tableau-bareme">
          <thead><tr><th scope="col">Écart</th><th scope="col">Victoire</th><th scope="col">Défaite</th></tr></thead>
          <tbody>${bareme.map((b) => html`<tr>
            <td>${b.ecart_min === null ? `≤ ${b.ecart_max}` : b.ecart_max === null ? `≥ +${b.ecart_min}` : `${b.ecart_min > 0 ? '+' : ''}${b.ecart_min} à ${b.ecart_max > 0 ? '+' : ''}${b.ecart_max}`}</td>
            <td>${fmtVariation(b.points_victoire)}</td><td>${fmtVariation(b.points_defaite)}</td></tr>`)}</tbody>
        </table></div>
        <p class="aide">Écart = points de l'adversaire − tes points.</p>
      </details>
    </div>`}
  </div>`;
}
