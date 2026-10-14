// Inscriptions des joueurs à une compétition (responsable de club ou cadre fédéral).
import { html, useState, useMemo } from '../preact.js';
import { api } from '../data.js';
import { lien, norm, fmtPts, fmtDate, nomComplet, aujourdhuiISO, msgErreur, telechargerCsv } from '../lib.js';
import { Icone, Pastille, Champ, Dialogue, toast } from '../ui.js';
import { fmtXpf } from './competitions.js';

const TYPE_INSC = { individuelle: 'Simple', paire: 'Double', equipe: 'Équipe' };
/** Montant d'une inscription : un tarif par équipe, sinon un tarif par joueur. */
const montantInsc = (c, nbJoueurs) => (c.type === 'equipe' ? c.montant_xpf : nbJoueurs * c.montant_xpf);

function inscriptionsActives(ctx, c) {
  return ctx.inscriptions.filter((i) => i.competition_id === c.id && i.statut === 'active');
}

/** Le club (ou le cadre) peut-il encore agir sur les inscriptions ? */
function peutAgir(ctx, c) {
  if (ctx.estCadre) return c.statut === 'ouverte' || c.statut === 'cloturee';
  return c.statut === 'ouverte' && (!c.date_limite_inscription || aujourdhuiISO() <= c.date_limite_inscription);
}

export function licencePourCompetition(l, c) {
  return l.historique.find((x) => x.saison_id === c.saison_id && x.statut === 'active') || null;
}

/** Raison pour laquelle un joueur ne peut pas être choisi (null = éligible). */
export function raisonRefus(l, c, dejaPris) {
  if (l.statut !== 'actif') return 'Non licencié cette saison';
  const lc = licencePourCompetition(l, c);
  if (!lc) return 'Pas de licence pour cette saison';
  if (!c.ouverte_a_tous && lc.type !== 'competition') return 'Licence non compétition';
  if (dejaPris.has(l.id)) return 'Déjà inscrit';
  return null;
}

function DialogueInscription({ ctx, c, clubs, inscription, onFermer }) {
  const edition = !!inscription;
  const [clubId, setClubId] = useState(inscription?.club_id || clubs[0]?.id || '');
  const [sel, setSel] = useState(inscription ? inscription.joueurs.map((j) => j.licencie_id) : []);
  const [texte, setTexte] = useState('');
  const [nomEquipe, setNomEquipe] = useState(inscription?.nom_equipe || '');
  const [occupe, setOccupe] = useState(false);
  const max = c.type === 'double' ? 2 : Infinity;

  const dejaPris = useMemo(() => {
    const s = new Set();
    for (const i of inscriptionsActives(ctx, c)) {
      if (inscription && i.id === inscription.id) continue;
      i.joueurs.forEach((j) => s.add(j.licencie_id));
    }
    return s;
  }, [ctx.inscriptions, c.id]);

  const joueurs = useMemo(() => {
    const mots = norm(texte).split(/\s+/).filter(Boolean);
    return ctx.licencies
      .filter((l) => l.club_id === clubId)
      .filter((l) => mots.every((m) => norm(`${l.prenom} ${l.nom}`).includes(m)))
      .map((l) => ({ l, raison: raisonRefus(l, c, dejaPris) }))
      .sort((a, b) => (a.raison ? 1 : 0) - (b.raison ? 1 : 0) || norm(a.l.nom).localeCompare(norm(b.l.nom)));
  }, [ctx.licencies, clubId, texte, dejaPris]);

  function basculer(id) {
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= max ? s : [...s, id]));
  }
  function changerClub(id) { setClubId(id); setSel([]); }

  const equipe = c.type === 'equipe';
  const valide = c.type === 'double' ? sel.length === 2 : equipe ? true : sel.length >= 1;
  const aide = c.type === 'double' ? 'Choisis exactement 2 joueurs.' : c.type === 'equipe' ? 'Choisis au moins 2 joueurs. L’ordre de sélection fixe l’ordre dans l’équipe.' : 'Choisis les joueurs du club à inscrire.';

  async function envoyer() {
    setOccupe(true);
    try {
      await api.enregistrerInscription(c.id, clubId, equipe ? [] : sel, inscription?.id || null, equipe ? nomEquipe.trim() : null);
      await ctx.recharger();
      toast(edition ? 'Inscription modifiée.' : 'Inscription enregistrée.');
      onFermer();
    } catch (er) {
      toast(msgErreur(er), 'erreur');
      setOccupe(false);
    }
  }

  return html`<${Dialogue} titre=${edition ? 'Modifier l’inscription' : 'Inscrire des joueurs'} onFermer=${onFermer}>
    ${clubs.length > 1 && !edition && html`<${Champ} id="i-club" libelle="Club">
      <select id="i-club" value=${clubId} onChange=${(e) => changerClub(e.target.value)}>
        ${clubs.map((k) => html`<option key=${k.id} value=${k.id}>${k.nom}</option>`)}
      </select><//>`}
    ${c.type === 'equipe' && html`<${Champ} id="i-nom" libelle="Nom de l'équipe" aide="Par exemple « AITO 1 ». Laisse vide pour un nom automatique (club + numéro).">
      <input id="i-nom" type="text" value=${nomEquipe} onInput=${(e) => setNomEquipe(e.target.value)} /><//>`}
    ${equipe ? html`<p class="aide">Inscris l'équipe sans liste de joueurs : le juge-arbitre aligne les joueurs de ton club à chaque rencontre, et l'effectif se forme au fil des matchs. Un joueur qui a joué pour une équipe y reste pour toute la compétition.</p>
      <p class="avis">Tarif par équipe : <strong>${fmtXpf(c.montant_xpf)}</strong></p>` : html`<p class="aide">${aide}</p>
    <div class="recherche"><${Icone} nom="recherche" taille=${20} /><input type="search" aria-label="Rechercher un joueur" placeholder="Nom ou prénom" value=${texte} onInput=${(e) => setTexte(e.target.value)} /></div>
    <ul class="choix-joueurs">
      ${joueurs.length === 0 && html`<li class="vide">Aucun joueur.</li>`}
      ${joueurs.map(({ l, raison }) => {
        const rang = sel.indexOf(l.id) + 1;
        const desactive = !!raison || (!rang && sel.length >= max);
        return html`<li key=${l.id}>
          <label class=${'choix-ligne' + (desactive ? ' choix-inactif' : '')}>
            <input type="checkbox" checked=${rang > 0} disabled=${desactive} onChange=${() => basculer(l.id)} />
            <span class="choix-nom"><strong>${nomComplet(l)}</strong><small>${raison || `${l.categorie} · ${fmtPts(l.points)} pts`}</small></span>
            ${c.type === 'equipe' && rang > 0 && html`<${Pastille} genre="actif">N° ${rang}<//>`}
          </label>
        </li>`;
      })}
    </ul>
    <p class="avis"><strong>${sel.length}</strong> joueur${sel.length > 1 ? 's' : ''} · montant ${fmtXpf(montantInsc(c, sel.length))}</p>`}
    <div class="actions">
      <button class="btn btn-primaire" type="button" disabled=${!valide || occupe} onClick=${envoyer}>${occupe ? 'Enregistrement…' : 'Enregistrer'}</button>
      <button class="btn btn-secondaire" type="button" onClick=${onFermer}>Annuler</button>
    </div>
  <//>`;
}

export function CarteInscriptions({ ctx, c }) {
  const [dialogue, setDialogue] = useState(null); // { inscription } ou {}
  const [aAnnuler, setAAnnuler] = useState(null);
  const [occupe, setOccupe] = useState(false);

  if (c.statut === 'brouillon') return null;
  const gere = ctx.estCadre ? ctx.clubs.filter((k) => k.actif) : ctx.clubs.filter((k) => ctx.clubsResponsable.includes(k.id));
  const toutes = inscriptionsActives(ctx, c);
  const visibles = toutes.slice().sort((a, b) => (ctx.clubParId.get(a.club_id)?.nom || '').localeCompare(ctx.clubParId.get(b.club_id)?.nom || ''));
  const agir = gere.length > 0 && peutAgir(ctx, c);
  const clubsPossibles = c.type === 'simple' ? gere.filter((k) => !toutes.some((i) => i.club_id === k.id)) : gere;
  const nbJoueurs = toutes.reduce((n, i) => n + i.joueurs.length, 0);
  const montantTotal = toutes.reduce((n, i) => n + montantInsc(c, i.joueurs.length), 0);

  function exporter() {
    const lignes = [];
    visibles.filter((i) => ctx.estCadre || ctx.clubsResponsable.includes(i.club_id)).forEach((i) => {
      i.joueurs.forEach((j, k) => {
        const l = ctx.licencieParId.get(j.licencie_id);
        lignes.push([c.nom, ctx.clubParId.get(i.club_id)?.nom || '', i.nom_equipe || '', TYPE_INSC[i.type], k + 1, l?.nom || '', l?.prenom || '', l?.categorie || '', l ? fmtPts(l.points) : '', c.type === 'equipe' ? (k === 0 ? c.montant_xpf : 0) : c.montant_xpf]);
      });
    });
    telechargerCsv(`inscriptions-${norm(c.nom).replace(/[^a-z0-9]+/g, '-')}-${aujourdhuiISO()}.csv`,
      ['Compétition', 'Club', 'Équipe', 'Type', 'Rang', 'Nom', 'Prénom', 'Catégorie', 'Points actuels', 'Montant (XPF)'], lignes);
  }

  async function annuler() {
    setOccupe(true);
    try {
      await api.annulerInscription(aAnnuler.id);
      await ctx.recharger();
      toast('Inscription annulée.');
      setAAnnuler(null);
    } catch (er) {
      toast(msgErreur(er), 'erreur');
    } finally {
      setOccupe(false);
    }
  }

  return html`<section class="carte" aria-label="Inscriptions">
    <h2>Inscriptions</h2>
    ${visibles.length > 0 && html`<p><button class="btn btn-secondaire" type="button" id="exp-inscriptions" onClick=${exporter}><${Icone} nom="telecharger" taille=${18} /> Exporter (CSV)</button></p>`}
    ${ctx.estCadre && html`<p class="aide">${toutes.length} inscription${toutes.length > 1 ? 's' : ''} · ${nbJoueurs} joueur${nbJoueurs > 1 ? 's' : ''} · ${fmtXpf(montantTotal)} au total</p>`}
    ${gere.length > 0 && !agir && c.statut === 'ouverte' && html`<p class="avis">La date limite est passée (${fmtDate(c.date_limite_inscription)}). Contacte la fédération pour toute modification.</p>`}
    ${gere.length > 0 && c.statut !== 'ouverte' && !ctx.estCadre && html`<p class="avis">Les inscriptions sont closes.</p>`}
    ${visibles.length === 0 ? html`<p class="aide">Aucune inscription pour le moment.</p>` : html`<ul class="historique inscriptions">
      ${visibles.map((i) => {
        const club = ctx.clubParId.get(i.club_id);
        const mienne = ctx.estCadre || ctx.clubsResponsable.includes(i.club_id);
        const interClubs = i.joueurs.some((j) => j.club_id && j.club_id !== i.club_id);
        const mesJoueurs = ctx.estCadre ? i.joueurs : i.joueurs.filter((j) => ctx.clubsResponsable.includes(j.club_id || i.club_id));
        const concerne = mesJoueurs.length > 0;
        return html`<li key=${i.id}>
          <div style="flex:1;min-width:0">
            <strong>${i.nom_equipe || club?.nom || '—'}</strong> <${Pastille}>${TYPE_INSC[i.type]}<//>${i.nom_equipe && html` <small>${club?.nom || ''}</small>`}
            <div class="aide">${i.type === 'equipe' && i.joueurs.length === 0 ? 'Effectif : se forme au fil des matchs' : i.joueurs.map((j) => { const l = ctx.licencieParId.get(j.licencie_id); const autre = j.club_id && j.club_id !== i.club_id; return (l ? nomComplet(l) : (j.nom_affiche || 'Joueur')) + (autre ? ' (' + (ctx.clubParId.get(j.club_id)?.nom || 'autre club') + ')' : ''); }).join(', ')}</div>
            ${(mienne || concerne) && html`<small>${c.type === 'equipe' ? `Tarif par équipe : ${fmtXpf(c.montant_xpf)}` : `${mesJoueurs.length} × ${fmtXpf(c.montant_xpf)} = ${fmtXpf(mesJoueurs.length * c.montant_xpf)}`}${interClubs ? ' · double entre deux clubs : chaque club paie son joueur' : ''}</small>`}
          </div>
          ${mienne && agir && html`<div class="etiquettes">
            <button class="btn btn-lien" type="button" onClick=${() => setDialogue({ inscription: i })}>Modifier</button>
            <button class="btn btn-lien" type="button" onClick=${() => setAAnnuler(i)}>Annuler</button>
          </div>`}
        </li>`;
      })}
    </ul>`}
    ${agir && clubsPossibles.length > 0 && html`<div class="actions"><button class="btn btn-primaire" type="button" onClick=${() => setDialogue({})}>
      ${c.type === 'double' ? 'Inscrire une paire' : c.type === 'equipe' ? 'Inscrire une équipe' : 'Inscrire des joueurs'}</button></div>`}
    ${agir && c.type === 'simple' && clubsPossibles.length === 0 && html`<p class="aide">Ton club est déjà inscrit : utilise « Modifier » pour changer la liste des joueurs.</p>`}
    ${dialogue && html`<${DialogueInscription} ctx=${ctx} c=${c} clubs=${dialogue.inscription ? ctx.clubs.filter((k) => k.id === dialogue.inscription.club_id) : clubsPossibles}
      inscription=${dialogue.inscription} onFermer=${() => setDialogue(null)} />`}
    ${aAnnuler && html`<${Dialogue} titre="Annuler cette inscription ?" onFermer=${() => setAAnnuler(null)}>
      <p>L’inscription de ${aAnnuler.nom_equipe || ctx.clubParId.get(aAnnuler.club_id)?.nom} (${aAnnuler.joueurs.length} joueur${aAnnuler.joueurs.length > 1 ? 's' : ''}) sera annulée.</p>
      <div class="actions">
        <button class="btn btn-danger" type="button" disabled=${occupe} onClick=${annuler}>Annuler l’inscription</button>
        <button class="btn btn-secondaire" type="button" onClick=${() => setAAnnuler(null)}>Garder</button>
      </div><//>`}
  </section>`;
}
