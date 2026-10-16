// Compétitions par équipes : rencontres par tour, feuille de rencontre (joueurs alignés), matchs, classement des équipes.
import { html, useState, useMemo } from '../preact.js';
import { api } from '../data.js';
import { nomComplet, fmtDate, fmtPts, norm, msgErreur, aujourdhuiISO } from '../lib.js';
import { Pliable, Pastille, Champ, Dialogue, toast } from '../ui.js';
import { DialogueMatch, LigneMatch } from './matchs.js';
import { FeuilleRencontre, modeleFeuille } from './feuille.js';
import { raisonRefus } from './inscriptions.js';

const TOURS = ['Journée 1', 'Journée 2', 'Journée 3', 'Journée 4', 'Journée 5', 'Journée 6', 'Demi-finale', 'Finale'];

const toursDe = (ctx, c) => (ctx.tours || []).filter((t) => t.competition_id === c.id).slice().sort((a, b) => a.date_tour.localeCompare(b.date_tour) || a.nom.localeCompare(b.nom, 'fr', { numeric: true }));

const nomEquipe = (ctx, i) => (i ? i.nom_equipe || ctx.clubParId.get(i.club_id)?.nom || 'Équipe' : '—');

/** Score d'une rencontre : nombre de matchs gagnés par chaque équipe (les doubles comptent, sans points). */
function scoreRencontre(ctx, r) {
  const ms = ctx.matchs.filter((m) => m.rencontre_id === r.id && m.statut !== 'rejete');
  let a = 0, b = 0;
  for (const m of ms) { if (m.setsA > m.setsB) a += 1; else if (m.setsB > m.setsA) b += 1; }
  return { a, b, nb: ms.length };
}

function DialogueRencontre({ ctx, c, equipes, onFermer, tourInitial }) {
  const tours = toursDe(ctx, c);
  const [tour, setTour] = useState(tourInitial || tours[0]?.nom || '');
  const date = tours.find((t) => t.nom === tour)?.date_tour || '';
  const [ea, setEa] = useState(equipes[0]?.id || '');
  const [eb, setEb] = useState(equipes[1]?.id || '');
  const [occupe, setOccupe] = useState(false);
  async function creer() {
    setOccupe(true);
    try {
      await api.creerRencontre(c.id, tour, date, ea, eb);
      await ctx.recharger();
      toast('Rencontre créée.');
      onFermer();
    } catch (er) { toast(msgErreur(er), 'erreur'); setOccupe(false); }
  }
  const select = (id, val, set) => html`<select id=${id} value=${val} onChange=${(e) => set(e.target.value)}>
    ${equipes.map((i) => html`<option key=${i.id} value=${i.id}>${nomEquipe(ctx, i)}</option>`)}</select>`;
  return html`<${Dialogue} titre="Nouvelle rencontre" onFermer=${onFermer}>
    <div class="grille grille-2">
      <${Champ} id="r-tour" libelle="Tour" aide=${tours.length ? '' : 'Crée d\'abord les tours dans « Tours et dates ».'}>
        <select id="r-tour" value=${tour} onChange=${(e) => setTour(e.target.value)}>
          ${tours.map((t) => html`<option key=${t.id} value=${t.nom}>${t.nom} · ${fmtDate(t.date_tour)}</option>`)}</select><//>
      <${Champ} id="r-a" libelle="Équipe A">${select('r-a', ea, setEa)}<//>
      <${Champ} id="r-b" libelle="Équipe B">${select('r-b', eb, setEb)}<//>
    </div>
    <div class="actions">
      <button class="btn btn-primaire" type="button" disabled=${occupe || !tour || !ea || !eb || ea === eb} onClick=${creer}>${occupe ? 'Création…' : 'Créer'}</button>
      <button class="btn btn-secondaire" type="button" onClick=${onFermer}>Annuler</button>
    </div><//>`;
}

function DialogueComposition({ ctx, c, r, equipe, onFermer }) {
  const deja = ctx.compositions.filter((x) => x.rencontre_id === r.id && x.inscription_id === equipe.id).sort((a, b) => (a.rang || 0) - (b.rang || 0)).map((x) => x.licencie_id);
  const [sel, setSel] = useState(deja);
  const [texte, setTexte] = useState('');
  const [occupe, setOccupe] = useState(false);
  // joueurs déjà dans l'effectif d'une autre équipe de la compétition : bloqués pour toute la compétition
  const bloques = useMemo(() => {
    const m = new Map();
    ctx.inscriptions.filter((i) => i.competition_id === c.id && i.statut === 'active' && i.type === 'equipe' && i.id !== equipe.id)
      .forEach((i) => i.joueurs.forEach((j) => m.set(j.licencie_id, nomEquipe(ctx, i))));
    return m;
  }, [ctx.inscriptions, c.id, equipe.id]);
  const candidats = useMemo(() => {
    const mots = norm(texte).split(/\s+/).filter(Boolean);
    return ctx.licencies.filter((l) => l.club_id === equipe.club_id)
      .filter((l) => mots.every((m) => norm(`${l.prenom} ${l.nom}`).includes(m)))
      .map((l) => ({ l, raison: bloques.has(l.id) ? `Joue pour ${bloques.get(l.id)}` : raisonRefus(l, c, new Set()), dansEquipe: equipe.joueurs.some((j) => j.licencie_id === l.id) }))
      .sort((a, b) => (a.raison ? 1 : 0) - (b.raison ? 1 : 0) || (b.dansEquipe ? 1 : 0) - (a.dansEquipe ? 1 : 0) || norm(a.l.nom).localeCompare(norm(b.l.nom)));
  }, [ctx.licencies, texte, bloques, equipe.joueurs]);
  const bascule = (id) => setSel((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  async function envoyer() {
    setOccupe(true);
    try {
      await api.enregistrerComposition(r.id, equipe.id, sel);
      await ctx.recharger();
      toast('Feuille de rencontre enregistrée.');
      onFermer();
    } catch (er) { toast(msgErreur(er), 'erreur'); setOccupe(false); }
  }
  return html`<${Dialogue} titre=${`Joueurs alignés : ${nomEquipe(ctx, equipe)}`} onFermer=${onFermer}>
    <p class="aide">Coche les joueurs présents parmi les licenciés du club. Un joueur rejoint l'effectif de l'équipe dès son premier match saisi, et ne peut plus jouer pour une autre équipe de cette compétition.</p>
    <div class="recherche"><input type="search" aria-label="Rechercher un joueur" placeholder="Nom ou prénom" value=${texte} onInput=${(e) => setTexte(e.target.value)} /></div>
    <ul class="choix-joueurs">${candidats.length === 0 && html`<li class="vide">Aucun joueur.</li>`}${candidats.map(({ l, raison, dansEquipe }) => { const rang = sel.indexOf(l.id) + 1;
      return html`<li key=${l.id}><label class=${'choix-ligne' + (raison ? ' choix-inactif' : '')}>
        <input type="checkbox" checked=${rang > 0} disabled=${!!raison} onChange=${() => bascule(l.id)} />
        <span class="choix-nom"><strong>${nomComplet(l)}</strong><small>${raison || (dansEquipe ? 'Dans l\'effectif' : `${l.categorie} · ${fmtPts(l.points)} pts`)}</small></span>
        ${rang > 0 && html`<${Pastille} genre="actif">N° ${rang}<//>`}</label></li>`; })}</ul>
    <p class="avis"><strong>${sel.length}</strong> joueur${sel.length > 1 ? 's' : ''} aligné${sel.length > 1 ? 's' : ''}</p>
    <div class="actions">
      <button class="btn btn-primaire" type="button" disabled=${!sel.length || occupe} onClick=${envoyer}>${occupe ? 'Enregistrement…' : 'Enregistrer'}</button>
      <button class="btn btn-secondaire" type="button" onClick=${onFermer}>Annuler</button>
    </div><//>`;
}

function Rencontre({ ctx, c, r, peutSaisir }) {
  const [ouvert, setOuvert] = useState(false);
  const [dialogue, setDialogue] = useState(null);
  const [occupe, setOccupe] = useState(false);
  const ea = ctx.inscriptions.find((i) => i.id === r.equipe_a);
  const eb = ctx.inscriptions.find((i) => i.id === r.equipe_b);
  const sc = scoreRencontre(ctx, r);
  const total = (c.nb_simples ?? 0) + (c.nb_doubles ?? 0);
  const liste = (id) => ctx.compositions.filter((x) => x.rencontre_id === r.id && x.inscription_id === id).sort((a, b) => (a.rang || 0) - (b.rang || 0)).map((x) => x.licencie_id);
  const listeA = liste(r.equipe_a), listeB = liste(r.equipe_b);
  const matchs = ctx.matchs.filter((m) => m.rencontre_id === r.id).slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
  const nomsListe = (l) => (l.length ? l.map((id) => { const x = ctx.licencieParId.get(id); return x ? nomComplet(x) : 'Joueur'; }).join(', ') : 'Aucun joueur aligné');
  const pret = listeA.length > 0 && listeB.length > 0;
  const modele = modeleFeuille(c);
  const feuille = !!(peutSaisir && pret && modele && listeA.length === modele.lA.length && listeB.length === modele.lB.length);
  async function supprimer() {
    setOccupe(true);
    try { await api.supprimerRencontre(r.id); await ctx.recharger(); toast('Rencontre supprimée.'); } catch (er) { toast(msgErreur(er), 'erreur'); setOccupe(false); }
  }
  return html`<li class="match">
    <button class="rencontre-tete" type="button" aria-expanded=${ouvert} onClick=${() => setOuvert(!ouvert)}>
      <span class="match-score">
        <span class=${sc.a > sc.b ? 'gagnant' : ''}>${nomEquipe(ctx, ea)}</span>
        <strong>${sc.a} - ${sc.b}</strong>
        <span class=${sc.b > sc.a ? 'gagnant' : ''}>${nomEquipe(ctx, eb)}</span>
      </span>
      <small>${sc.nb} match${sc.nb > 1 ? 's' : ''} saisi${sc.nb > 1 ? 's' : ''}${total ? ` sur ${total}` : ''} · ${ouvert ? 'Toucher pour fermer' : 'Toucher pour ouvrir'}</small>
    </button>
    ${ouvert && html`<div>
      <p class="aide"><strong>${nomEquipe(ctx, ea)}</strong> : ${nomsListe(listeA)}</p>
      <p class="aide"><strong>${nomEquipe(ctx, eb)}</strong> : ${nomsListe(listeB)}</p>
      ${peutSaisir && html`<div class="etiquettes">
        <button class="btn btn-secondaire" type="button" onClick=${() => setDialogue({ comp: ea })}>Feuille ${nomEquipe(ctx, ea)}</button>
        <button class="btn btn-secondaire" type="button" onClick=${() => setDialogue({ comp: eb })}>Feuille ${nomEquipe(ctx, eb)}</button>
      </div>`}
      ${feuille ? html`<${FeuilleRencontre} ctx=${ctx} c=${c} r=${r} modele=${modele} listeA=${listeA} listeB=${listeB} matchs=${matchs}
          nomA=${nomEquipe(ctx, ea)} nomB=${nomEquipe(ctx, eb)} onEdit=${(x) => setDialogue({ match: x })} />`
        : matchs.length > 0 && html`<ul class="matchs">${matchs.map((m) => html`<${LigneMatch} key=${m.id} ctx=${ctx} c=${c} m=${m} peutSaisir=${peutSaisir} onEdit=${(x) => setDialogue({ match: x })} />`)}</ul>`}
      <div class="actions">
        ${peutSaisir && html`<button class=${feuille ? 'btn btn-lien' : 'btn btn-primaire'} type="button" disabled=${!pret} onClick=${() => setDialogue({ saisie: true })}>${feuille ? 'Ajouter un match hors feuille' : 'Saisir un match'}</button>`}
        ${peutSaisir && matchs.length === 0 && html`<button class="btn btn-lien" type="button" disabled=${occupe} onClick=${supprimer}>Supprimer la rencontre</button>`}
      </div>
      ${peutSaisir && !pret && html`<p class="aide">Aligne d'abord les joueurs des deux équipes (feuille de rencontre).</p>`}
    </div>`}
    ${dialogue?.comp && html`<${DialogueComposition} ctx=${ctx} c=${c} r=${r} equipe=${dialogue.comp} onFermer=${() => setDialogue(null)} />`}
    ${(dialogue?.saisie || dialogue?.match) && html`<${DialogueMatch} ctx=${ctx} c=${c} match=${dialogue.match}
      rencontre=${{ id: r.id, tour: r.tour, listeA, listeB, nomA: nomEquipe(ctx, ea), nomB: nomEquipe(ctx, eb) }} onFermer=${() => setDialogue(null)} />`}
  </li>`;
}

/** Classement : victoires de rencontre (1 point), égalités (0,5), puis différence de matchs. */
function Classement({ ctx, c, equipes, rencontres }) {
  const lignes = useMemo(() => {
    const t = new Map(equipes.map((i) => [i.id, { id: i.id, nom: nomEquipe(ctx, i), j: 0, v: 0, n: 0, d: 0, pour: 0, contre: 0 }]));
    for (const r of rencontres) {
      const s = scoreRencontre(ctx, r);
      if (!s.nb) continue;
      const A = t.get(r.equipe_a), B = t.get(r.equipe_b);
      if (!A || !B) continue;
      A.j += 1; B.j += 1; A.pour += s.a; A.contre += s.b; B.pour += s.b; B.contre += s.a;
      if (s.a > s.b) { A.v += 1; B.d += 1; } else if (s.b > s.a) { B.v += 1; A.d += 1; } else { A.n += 1; B.n += 1; }
    }
    return [...t.values()].filter((x) => x.j > 0).sort((x, y) => (y.v + y.n / 2) - (x.v + x.n / 2) || (y.pour - y.contre) - (x.pour - x.contre) || x.nom.localeCompare(y.nom));
  }, [ctx.matchs, ctx.inscriptions, rencontres]);
  if (!lignes.length) return null;
  return html`<${Pliable} petit titre="Classement des équipes" ouvert=${false}>
    <ul class="historique">${lignes.map((x, k) => html`<li key=${x.id}><span style="flex:1"><strong>${k + 1}. ${x.nom}</strong>
      <small> ${x.j} rencontre${x.j > 1 ? 's' : ''} · ${x.v} V · ${x.n} N · ${x.d} D · matchs ${x.pour}-${x.contre}</small></span></li>`)}</ul><//>`;
}

/** Tours de la compétition par équipes, chacun avec sa date. */
export function CarteTours({ ctx, c }) {
  const [dialogue, setDialogue] = useState(null); // { tour } pour modifier, {} pour ajouter
  const [nom, setNom] = useState('');
  const [date, setDate] = useState('');
  const [occupe, setOccupe] = useState(false);
  const estJuge = ctx.moi && ctx.juges.some((j) => j.competition_id === c.id && j.licencie_id === ctx.moi.id);
  const peut = ctx.estCadre || (estJuge && c.statut === 'cloturee');
  const tours = toursDe(ctx, c);
  if (!peut && tours.length === 0) return null;
  const ouvrir = (t) => { setNom(t?.nom || ''); setDate(t?.date_tour || ''); setDialogue({ tour: t }); };
  async function agir(fn, message) {
    setOccupe(true);
    try { await fn(); await ctx.recharger(); toast(message); setDialogue(null); } catch (er) { toast(msgErreur(er), 'erreur'); } finally { setOccupe(false); }
  }
  const enregistrer = () => (dialogue.tour
    ? agir(() => api.modifierTour(dialogue.tour.id, nom.trim(), date), 'Tour modifié.')
    : agir(() => api.creerTour(c.id, nom.trim(), date), 'Tour ajouté.'));
  const nbRencontres = (t) => ctx.rencontres.filter((r) => r.competition_id === c.id && r.tour === t.nom).length;
  return html`<${Pliable} titre="Gérer les journées" ouvert=${false}>
    <p class="aide">Une compétition par équipes se joue en plusieurs tours, chacun à sa date (du ${fmtDate(c.date_debut)} au ${fmtDate(c.date_fin)}). Les rencontres se rattachent à un tour.</p>
    ${tours.length === 0 ? html`<p class="aide">Aucun tour défini.</p>` : html`<ul class="historique">${tours.map((t) => html`<li key=${t.id}>
      <span style="flex:1"><strong>${t.nom}</strong> · <span style="white-space:nowrap">${fmtDate(t.date_tour)}</span><br /><small style="white-space:nowrap">${nbRencontres(t)}\u00a0rencontre${nbRencontres(t) > 1 ? 's' : ''}</small></span>
      ${peut && html`<span class="etiquettes"><button class="btn btn-lien" type="button" onClick=${() => ouvrir(t)}>Modifier</button>
        ${nbRencontres(t) === 0 && html`<button class="btn btn-lien" type="button" disabled=${occupe} onClick=${() => agir(() => api.supprimerTour(t.id), 'Tour supprimé.')}>Supprimer</button>`}</span>`}
    </li>`)}</ul>`}
    ${peut && html`<div class="actions"><button class="btn btn-secondaire" type="button" onClick=${() => ouvrir(null)}>Ajouter un tour</button></div>`}
    ${dialogue && html`<${Dialogue} titre=${dialogue.tour ? 'Modifier le tour' : 'Ajouter un tour'} onFermer=${() => setDialogue(null)}>
      <${Champ} id="t-nom" libelle="Nom du tour"><input id="t-nom" list="t-noms" type="text" value=${nom} onInput=${(e) => setNom(e.target.value)} />
        <datalist id="t-noms">${TOURS.map((t) => html`<option key=${t} value=${t}></option>`)}</datalist><//>
      <${Champ} id="t-date" libelle="Date" aide="Comprise entre le début et la fin de la compétition."><input id="t-date" type="date" value=${date} min=${c.date_debut} max=${c.date_fin} onInput=${(e) => setDate(e.target.value)} /><//>
      <div class="actions">
        <button class="btn btn-primaire" type="button" disabled=${occupe || !nom.trim() || !date} onClick=${enregistrer}>${occupe ? 'Enregistrement…' : 'Enregistrer'}</button>
        <button class="btn btn-secondaire" type="button" onClick=${() => setDialogue(null)}>Annuler</button>
      </div><//>`}
  <//>`;
}

/** Effectif de chaque équipe, déduit des matchs joués. Le cadre peut retirer un joueur qui n'a aucun match. */
function Effectifs({ ctx, c, equipes, peut }) {
  const [occupe, setOccupe] = useState(false);
  if (!equipes.length) return null;
  async function retirer(i, j) {
    setOccupe(true);
    try { await api.retirerJoueurEquipe(i.id, j.licencie_id); await ctx.recharger(); toast('Joueur retiré de l\'effectif.'); } catch (er) { toast(msgErreur(er), 'erreur'); } finally { setOccupe(false); }
  }
  return html`<${Pliable} petit titre="Effectifs des équipes" ouvert=${false}>
    <p class="aide">L'effectif se forme au fil des matchs : un joueur qui a joué pour une équipe y reste pour toute la compétition.</p>
    <ul class="historique">${equipes.map((i) => html`<li key=${i.id} style="display:block"><strong>${nomEquipe(ctx, i)}</strong> <small>${ctx.clubParId.get(i.club_id)?.nom || ''}</small>
      ${i.joueurs.length === 0 ? html`<div class="aide">Aucun joueur pour le moment.</div>` : html`<div class="aide">${i.joueurs.map((j, k) => { const l = ctx.licencieParId.get(j.licencie_id);
        return html`${k > 0 ? ', ' : ''}${l ? nomComplet(l) : j.nom_affiche || 'Joueur'}${peut && html` <button class="btn btn-lien" type="button" disabled=${occupe} onClick=${() => retirer(i, j)}>retirer</button>`}`; })}</div>`}
    </li>`)}</ul><//>`;
}

export function CarteRencontres({ ctx, c }) {
  const [dialogue, setDialogue] = useState(false);
  const [occupe, setOccupe] = useState(false);
  if (c.statut !== 'cloturee' && c.statut !== 'terminee') return null;
  const estJuge = ctx.moi && ctx.juges.some((j) => j.competition_id === c.id && j.licencie_id === ctx.moi.id);
  const peutSaisir = ctx.estCadre ? true : estJuge && c.statut === 'cloturee';
  const equipes = ctx.inscriptions.filter((i) => i.competition_id === c.id && i.statut === 'active' && i.type === 'equipe');
  const rencontres = ctx.rencontres.filter((r) => r.competition_id === c.id)
    .slice().sort((a, b) => String(a.date_rencontre).localeCompare(String(b.date_rencontre)) || a.tour.localeCompare(b.tour, 'fr', { numeric: true }));
  const aValider = ctx.matchs.filter((m) => m.competition_id === c.id && m.statut === 'saisi').length;
  if (!peutSaisir && rencontres.length === 0) return null;
  async function valider() {
    setOccupe(true);
    try {
      const nb = await api.validerMatchs(c.id);
      await ctx.recharger();
      toast(`${nb} match${nb > 1 ? 's' : ''} validé${nb > 1 ? 's' : ''}.`);
    } catch (e) { toast(msgErreur(e), 'erreur'); } finally { setOccupe(false); }
  }
  const tours = toursDe(ctx, c);
  const aujourdhui = aujourdhuiISO();
  const prochain = tours.find((t) => t.date_tour >= aujourdhui) || tours[tours.length - 1];
  const rencontresDe = (t) => rencontres.filter((r) => r.tour === t.nom);
  const aValiderDe = (t) => { const ids = new Set(rencontresDe(t).map((r) => r.id)); return ctx.matchs.filter((m) => m.statut === 'saisi' && ids.has(m.rencontre_id)).map((m) => m.id); };
  async function agirTour(fn, message) {
    setOccupe(true);
    try { const n = await fn(); await ctx.recharger(); toast(typeof message === 'function' ? message(n) : message); } catch (e) { toast(msgErreur(e), 'erreur'); } finally { setOccupe(false); }
  }
  return html`<${Pliable} titre="Journées et rencontres" ouvert=${true}>
    ${tours.length === 0 && peutSaisir && html`<p class="avis">Définis d'abord les journées et leurs dates dans « Tours et dates ».</p>`}
    <p class="aide">${c.nb_simples != null || c.nb_doubles != null ? `Format : ${c.nb_simples ?? 0} simples et ${c.nb_doubles ?? 0} doubles par rencontre. ` : ''}Touche une journée pour l'ouvrir, puis une rencontre pour saisir ses matchs. Seuls les simples donnent des points (coefficient ${Number(c.coefficient).toLocaleString('fr-FR')}), à la validation.</p>
    ${tours.map((t) => { const ferme = !!t.cloture; const saisie = peutSaisir && (!ferme || ctx.estCadre); const nbV = aValiderDe(t).length;
      return html`<${Pliable} key=${t.id} petit titre=${`${t.nom} · ${fmtDate(t.date_tour)}`}
        resume=${`${rencontresDe(t).length} rencontre${rencontresDe(t).length > 1 ? 's' : ''}${ferme ? ' · clôturée' : ''}`} ouvert=${prochain?.id === t.id}>
      ${ferme && html`<p class="aide"><${Pastille} genre="alerte">Journée clôturée<//> ${ctx.estCadre ? 'Tu peux encore corriger, valider ou rouvrir.' : 'Plus de modification : la fédération va valider les matchs.'}</p>`}
      ${rencontresDe(t).length === 0 ? html`<p class="aide">Aucune rencontre pour cette journée.</p>` : html`<ul class="matchs">${rencontresDe(t).map((r) => html`<${Rencontre} key=${r.id} ctx=${ctx} c=${c} r=${r} peutSaisir=${saisie} />`)}</ul>`}
      <div class="actions">
        ${saisie && html`<button class="btn btn-primaire" type="button" disabled=${equipes.length < 2} onClick=${() => setDialogue(t.nom)}>Nouvelle rencontre · ${t.nom}</button>`}
        ${peutSaisir && !ferme && rencontresDe(t).length > 0 && html`<button class="btn btn-secondaire" type="button" disabled=${occupe}
          onClick=${() => { if (window.confirm(`Clôturer ${t.nom} pour ce tableau ? Les juges ne pourront plus modifier ses matchs.`)) agirTour(() => api.cloturerTour(t.id), `${t.nom} clôturée.`); }}>Clôturer la journée</button>`}
        ${ctx.estCadre && ferme && nbV > 0 && html`<button class="btn btn-secondaire" type="button" disabled=${occupe}
          onClick=${() => agirTour(() => api.validerMatchs(c.id, aValiderDe(t)), (n) => `${n} match${n > 1 ? 's' : ''} validé${n > 1 ? 's' : ''}.`)}>Valider la journée (${nbV})</button>`}
        ${ctx.estCadre && ferme && html`<button class="btn btn-lien" type="button" disabled=${occupe} onClick=${() => agirTour(() => api.rouvrirTour(t.id), `${t.nom} rouverte.`)}>Rouvrir la journée</button>`}
      </div>
    <//>`; })}
    <${Classement} ctx=${ctx} c=${c} equipes=${equipes} rencontres=${rencontres} />
    <${Effectifs} ctx=${ctx} c=${c} equipes=${equipes} peut=${ctx.estCadre} />
    ${ctx.estCadre && aValider > 0 && html`<div class="actions"><button class="btn btn-secondaire" type="button" disabled=${occupe} onClick=${valider}>Valider les matchs saisis (${aValider})</button></div>`}
    ${equipes.length < 2 && peutSaisir && html`<p class="aide">Il faut au moins deux équipes inscrites.</p>`}
    ${dialogue && html`<${DialogueRencontre} ctx=${ctx} c=${c} equipes=${equipes} tourInitial=${typeof dialogue === 'string' ? dialogue : ''} onFermer=${() => setDialogue(false)} />`}
  <//>`;
}
