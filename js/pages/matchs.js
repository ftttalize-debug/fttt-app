// Matchs et scores d'une compétition : saisie par le juge-arbitre, validation par le cadre fédéral.
import { html, useState, useMemo } from '../preact.js';
import { api } from '../data.js';
import { norm, nomComplet, fmtPts, msgErreur } from '../lib.js';
import { Pastille, Champ, Dialogue, ChoixPersonne, toast } from '../ui.js';

const STATUT = { saisi: 'À valider', valide: 'Validé', rejete: 'À corriger' };
const GENRE = { saisi: 'alerte', valide: 'actif', rejete: 'archive' };
const TOURS = ['Poule', 'Tableau', '1/16 de finale', '1/8 de finale', '1/4 de finale', 'Demi-finale', 'Match pour la 3e place', 'Finale'];

/** Analyse la liste des manches [[a,b],…] pour un match en N sets gagnants. */
export function analyserManches(manches, n) {
  let sa = 0, sb = 0;
  for (let i = 0; i < manches.length; i += 1) {
    const [a, b] = manches[i];
    if (a === '' || b === '' || a === null || b === null) return { sa, sb, erreur: `Manche ${i + 1} : complète les deux scores.` };
    const x = Number(a), y = Number(b);
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0) return { sa, sb, erreur: `Manche ${i + 1} : score invalide.` };
    const max = Math.max(x, y), ecart = Math.abs(x - y);
    if (max < 11 || ecart < 2 || (max > 11 && ecart !== 2)) return { sa, sb, erreur: `Manche ${i + 1} (${x}-${y}) : 11 points avec 2 d'écart.` };
    if (sa === n || sb === n) return { sa, sb, erreur: `Manche ${i + 1} : le match est déjà terminé.` };
    if (x > y) sa += 1; else sb += 1;
  }
  if (sa !== n && sb !== n) return { sa, sb, erreur: null, enCours: true };
  return { sa, sb, erreur: null, enCours: false };
}

const nomJ = (ctx, id) => { const l = ctx.licencieParId.get(id); return l ? nomComplet(l) : 'Joueur'; };
const cote = (ctx, liste) => liste.map((p) => nomJ(ctx, p.licencie_id)).join(' / ');
const signe = (n) => (n > 0 ? '+' : '') + Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 1 });

function DialogueMatch({ ctx, c, match, onFermer }) {
  const edition = !!match;
  const [tour, setTour] = useState(match?.tour || '');
  const [type, setType] = useState(match?.type_match || 'simple');
  const [n, setN] = useState(match?.sets_gagnants || 3);
  const nb = type === 'double' ? 2 : 1;
  const [A, setA] = useState(match ? match.A.map((p) => p.licencie_id) : []);
  const [B, setB] = useState(match ? match.B.map((p) => p.licencie_id) : []);
  const [manches, setManches] = useState(match ? match.manches.map((x) => [String(x.score_a), String(x.score_b)]) : [['', ''], ['', ''], ['', '']]);
  const [occupe, setOccupe] = useState(false);

  const joueurs = useMemo(() => {
    const ids = new Set();
    ctx.inscriptions.filter((i) => i.competition_id === c.id && i.statut === 'active').forEach((i) => i.joueurs.forEach((j) => ids.add(j.licencie_id)));
    return [...ids].map((id) => ctx.licencieParId.get(id)).filter(Boolean)
      .map((l) => ({ id: l.id, libelle: nomComplet(l), detail: l.clubNom, cle: norm(`${l.prenom} ${l.nom}`) }));
  }, [ctx.inscriptions, c.id]);

  const rempli = manches.filter((m) => m[0] !== '' || m[1] !== '');
  const analyse = analyserManches(rempli.length ? rempli : [], n);
  const pris = [...A, ...B];
  const complet = A.length === nb && B.length === nb && A.every(Boolean) && B.every(Boolean);
  const doublon = new Set(pris.filter(Boolean)).size !== pris.filter(Boolean).length;
  const valide = complet && !doublon && rempli.length > 0 && !analyse.erreur && analyse.enCours === false;

  const place = (cotes, setCotes, i) => (id) => setCotes((x) => { const y = x.slice(); y[i] = id || undefined; return y; });
  const majManche = (i, k, v) => setManches((ms) => ms.map((m, j) => (j === i ? (k === 0 ? [v, m[1]] : [m[0], v]) : m)));
  const ajouterManche = () => setManches((ms) => (ms.length < 2 * n - 1 ? [...ms, ['', '']] : ms));
  const changerType = (t) => { setType(t); setA([]); setB([]); };

  async function envoyer() {
    setOccupe(true);
    try {
      await api.saisirMatch({
        competition: c.id, tour, type, setsGagnants: n, coteA: A, coteB: B,
        manches: rempli.map(([a, b]) => [Number(a), Number(b)]), match: match?.id
      });
      await ctx.recharger();
      toast(edition ? 'Match corrigé.' : 'Match enregistré.');
      onFermer();
    } catch (er) {
      toast(msgErreur(er), 'erreur');
      setOccupe(false);
    }
  }

  const champsJoueurs = (label, cotes, setCotes, prefixe) => html`<div class="grille">
    ${Array.from({ length: nb }, (_, i) => html`<${Champ} key=${prefixe + i} id=${`m-${prefixe}${i}`} libelle=${nb > 1 ? `${label} ${i + 1}` : label}>
      <${ChoixPersonne} id=${`m-${prefixe}${i}`} options=${joueurs.filter((o) => !pris.includes(o.id) || cotes[i] === o.id)} valeur=${cotes[i]} onChange=${place(cotes, setCotes, i)} /><//>`)}
  </div>`;

  return html`<${Dialogue} titre=${edition ? 'Corriger le match' : 'Saisir un match'} onFermer=${onFermer}>
    <div class="grille grille-2">
      <${Champ} id="m-tour" libelle="Tour">
        <input id="m-tour" list="m-tours" type="text" value=${tour} onInput=${(e) => setTour(e.target.value)} />
        <datalist id="m-tours">${TOURS.map((t) => html`<option key=${t} value=${t}></option>`)}</datalist><//>
      <${Champ} id="m-type" libelle="Type">
        <select id="m-type" value=${type} disabled=${edition} onChange=${(e) => changerType(e.target.value)}>
          <option value="simple">Simple</option><option value="double">Double (sans points)</option></select><//>
    </div>
    <div class="champ"><span class="etiquette">Sets gagnants</span>
      <div class="puces" role="group" aria-label="Sets gagnants">
        ${[3, 4].map((v) => html`<button key=${v} type="button" class="puce" aria-pressed=${n === v}
          onClick=${() => { setN(v); setManches((ms) => ms.slice(0, 2 * v - 1)); }}>${v} sets gagnants</button>`)}
      </div></div>
    ${champsJoueurs(nb > 1 ? 'Paire A' : 'Joueur A', A, setA, 'a')}
    ${champsJoueurs(nb > 1 ? 'Paire B' : 'Joueur B', B, setB, 'b')}
    <div class="champ"><span class="etiquette">Score de chaque manche</span>
      <ul class="manches-saisie">
        ${manches.map((m, i) => html`<li key=${i}><span>Manche ${i + 1}</span>
          <input type="text" inputmode="numeric" aria-label=${`Manche ${i + 1}, score A`} value=${m[0]} onInput=${(e) => majManche(i, 0, e.target.value.replace(/\D/g, ''))} />
          <span>-</span>
          <input type="text" inputmode="numeric" aria-label=${`Manche ${i + 1}, score B`} value=${m[1]} onInput=${(e) => majManche(i, 1, e.target.value.replace(/\D/g, ''))} /></li>`)}
      </ul>
      ${manches.length < 2 * n - 1 && html`<button class="btn btn-lien" type="button" onClick=${ajouterManche}>+ Ajouter une manche</button>`}
    </div>
    ${analyse.erreur ? html`<p class="erreur" role="alert">${analyse.erreur}</p>`
      : doublon ? html`<p class="erreur" role="alert">Un joueur apparaît deux fois.</p>`
      : html`<p class="avis">Score en manches : <strong>${analyse.sa} - ${analyse.sb}</strong>${analyse.enCours === false ? ` · victoire de ${analyse.sa > analyse.sb ? 'A' : 'B'}` : rempli.length ? ' · match en cours : continue la saisie' : ''}</p>`}
    <div class="actions">
      <button class="btn btn-primaire" type="button" disabled=${!valide || occupe} onClick=${envoyer}>${occupe ? 'Enregistrement…' : 'Enregistrer'}</button>
      <button class="btn btn-secondaire" type="button" onClick=${onFermer}>Annuler</button>
    </div>
  <//>`;
}

function LigneMatch({ ctx, c, m, peutSaisir, onEdit }) {
  const [occupe, setOccupe] = useState(false);
  async function act(fn, message) {
    setOccupe(true);
    try { await fn(); await ctx.recharger(); toast(message); } catch (e) { toast(msgErreur(e), 'erreur'); } finally { setOccupe(false); }
  }
  const gagnantA = m.setsA > m.setsB;
  const a = m.A[0], b = m.B[0];
  return html`<li class="match">
    <div class="match-tete">
      <strong>${m.tour || 'Match'}</strong>
      <${Pastille} genre=${GENRE[m.statut]}>${STATUT[m.statut]}<//>
      ${m.type_match === 'double' && html`<${Pastille}>Double<//>`}
    </div>
    <div class="match-score">
      <span class=${gagnantA ? 'gagnant' : ''}>${cote(ctx, m.A)}</span>
      <strong>${m.setsA} - ${m.setsB}</strong>
      <span class=${!gagnantA ? 'gagnant' : ''}>${cote(ctx, m.B)}</span>
    </div>
    <small>${m.manches.map((x) => `${x.score_a}-${x.score_b}`).join(', ')} · en ${m.sets_gagnants} sets gagnants</small>
    ${m.statut === 'valide' && m.type_match === 'simple' && a && b && a.points_finaux !== null && html`<small>
      Points : ${nomJ(ctx, a.licencie_id)} ${signe(a.points_finaux)} · ${nomJ(ctx, b.licencie_id)} ${signe(b.points_finaux)}</small>`}
    <div class="etiquettes">
      ${peutSaisir && m.statut !== 'valide' && html`<button class="btn btn-lien" type="button" disabled=${occupe} onClick=${() => onEdit(m)}>Corriger</button>
        <button class="btn btn-lien" type="button" disabled=${occupe} onClick=${() => act(() => api.supprimerMatch(m.id), 'Match supprimé.')}>Supprimer</button>`}
      ${ctx.estCadre && m.statut === 'saisi' && html`<button class="btn btn-lien" type="button" disabled=${occupe} onClick=${() => act(() => api.rejeterMatch(m.id), 'Match renvoyé au juge.')}>Rejeter</button>`}
      ${ctx.estCadre && m.statut === 'valide' && html`<button class="btn btn-lien" type="button" disabled=${occupe} onClick=${() => act(() => api.invaliderMatch(m.id), 'Validation retirée.')}>Invalider</button>`}
    </div>
  </li>`;
}

export function CarteMatchs({ ctx, c }) {
  const [dialogue, setDialogue] = useState(null);
  const [occupe, setOccupe] = useState(false);
  if (c.statut !== 'cloturee' && c.statut !== 'terminee') return null;
  const estJuge = ctx.moi && ctx.juges.some((j) => j.competition_id === c.id && j.licencie_id === ctx.moi.id);
  const peutSaisir = ctx.estCadre ? true : estJuge && c.statut === 'cloturee';
  const matchs = ctx.matchs.filter((m) => m.competition_id === c.id).slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
  const aValider = matchs.filter((m) => m.statut === 'saisi').length;
  async function valider() {
    setOccupe(true);
    try {
      const nb = await api.validerMatchs(c.id);
      await ctx.recharger();
      toast(`${nb} match${nb > 1 ? 's' : ''} validé${nb > 1 ? 's' : ''}.`);
    } catch (e) { toast(msgErreur(e), 'erreur'); } finally { setOccupe(false); }
  }
  if (!peutSaisir && matchs.length === 0) return null;
  return html`<section class="carte" aria-label="Matchs">
    <h2>Matchs et scores</h2>
    ${peutSaisir && html`<p class="aide">Coefficient ${Number(c.coefficient).toLocaleString('fr-FR')}. Les points des simples sont calculés à la validation, d'après les points de chaque joueur à la clôture.</p>`}
    ${matchs.length === 0 ? html`<p class="aide">Aucun match saisi.</p>` : html`<ul class="matchs">${matchs.map((m) => html`<${LigneMatch} key=${m.id} ctx=${ctx} c=${c} m=${m} peutSaisir=${peutSaisir} onEdit=${(x) => setDialogue({ match: x })} />`)}</ul>`}
    <div class="actions">
      ${peutSaisir && html`<button class="btn btn-primaire" type="button" onClick=${() => setDialogue({})}>Saisir un match</button>`}
      ${ctx.estCadre && aValider > 0 && html`<button class="btn btn-secondaire" type="button" disabled=${occupe} onClick=${valider}>Valider les matchs saisis (${aValider})</button>`}
    </div>
    ${dialogue && html`<${DialogueMatch} ctx=${ctx} c=${c} match=${dialogue.match} onFermer=${() => setDialogue(null)} />`}
  </section>`;
}

export function CarteJuges({ ctx, c }) {
  const [ajout, setAjout] = useState(null);
  const [occupe, setOccupe] = useState(false);
  if (!ctx.estCadre || c.statut === 'brouillon') return null;
  const juges = ctx.juges.filter((j) => j.competition_id === c.id);
  const options = ctx.licencies.filter((l) => !juges.some((j) => j.licencie_id === l.id))
    .map((l) => ({ id: l.id, libelle: nomComplet(l), detail: l.clubNom, cle: norm(`${l.prenom} ${l.nom}`) }));
  async function agir(fn, message) {
    setOccupe(true);
    try { await fn(); await ctx.recharger(); toast(message); setAjout(null); } catch (e) { toast(msgErreur(e), 'erreur'); } finally { setOccupe(false); }
  }
  return html`<section class="carte" aria-label="Juges-arbitres">
    <h2>Juges-arbitres</h2>
    ${juges.length === 0 ? html`<p class="aide">Aucun juge-arbitre désigné. Il saisira les scores une fois les inscriptions closes.</p>` : html`<ul class="historique">
      ${juges.map((j) => html`<li key=${j.id}><strong style="flex:1">${nomJ(ctx, j.licencie_id)}</strong>
        <button class="btn btn-lien" type="button" disabled=${occupe} onClick=${() => agir(() => api.retirerJuge(j.id), 'Juge retiré.')}>Retirer</button></li>`)}</ul>`}
    <${Champ} id="j-ajout" libelle="Désigner un juge-arbitre" aide="Il doit avoir un compte de connexion pour saisir les scores.">
      <${ChoixPersonne} id="j-ajout" options=${options} valeur=${ajout} onChange=${setAjout} /><//>
    <div class="actions"><button class="btn btn-primaire" type="button" disabled=${!ajout || occupe} onClick=${() => agir(() => api.ajouterJuge(c.id, ajout), 'Juge désigné.')}>Désigner</button></div>
  </section>`;
}

export function HistoriqueMatchs({ ctx, l }) {
  const mes = ctx.matchs.filter((m) => m.statut === 'valide' && [...m.A, ...m.B].some((p) => p.licencie_id === l.id))
    .sort((a, b) => (b.date_validation || '').localeCompare(a.date_validation || ''));
  if (!mes.length) return null;
  return html`<section class="carte" aria-label="Historique des matchs">
    <h2>Historique des matchs</h2>
    <ul class="matchs">
      ${mes.map((m) => {
        const moi = [...m.A, ...m.B].find((p) => p.licencie_id === l.id);
        const monCote = moi.cote === 'A' ? m.A : m.B;
        const adverse = moi.cote === 'A' ? m.B : m.A;
        const mesSets = moi.cote === 'A' ? m.setsA : m.setsB;
        const sesSets = moi.cote === 'A' ? m.setsB : m.setsA;
        const comp = ctx.competitionParId.get(m.competition_id);
        return html`<li class="match" key=${m.id}>
          <div class="match-tete"><strong>${comp?.nom || '—'}</strong>${m.tour ? html`<small>${m.tour}</small>` : ''}
            <${Pastille} genre=${mesSets > sesSets ? 'actif' : 'archive'}>${mesSets > sesSets ? 'Victoire' : 'Défaite'}<//></div>
          <div>contre ${cote(ctx, adverse)} · <strong>${mesSets} - ${sesSets}</strong></div>
          <small>${m.manches.map((x) => (moi.cote === 'A' ? `${x.score_a}-${x.score_b}` : `${x.score_b}-${x.score_a}`)).join(', ')}${moi.points_finaux !== null && m.type_match === 'simple' ? ' · ' + signe(moi.points_finaux) + ' pts' : ''}</small>
        </li>`;
      })}
    </ul>
  </section>`;
}
