// Factures : liste, téléchargement PDF et suivi (cadre fédéral) ; consultation pour les responsables de club.
import { html, useState } from '../preact.js';
import { api } from '../data.js';
import { lien, naviguer, fmtDate, msgErreur, aujourdhuiISO, telechargerCsv } from '../lib.js';
import { Icone, Pastille, toast } from '../ui.js';
import { fmtXpf } from './competitions.js';
import { telechargerFacture } from '../facture-pdf.js';

export const STATUTS_FACTURE = { generee: 'À envoyer', envoyee: 'Envoyée', reglee: 'Réglée', annulee: 'Annulée' };
const GENRE = { generee: 'alerte', envoyee: 'neutre', reglee: 'actif', annulee: 'archive' };

function Ligne({ ctx, f }) {
  const [occupe, setOccupe] = useState(false);
  const comp = ctx.competitionParId.get(f.competition_id);
  async function pdf() {
    setOccupe(true);
    try { await telechargerFacture(ctx, f); } catch (e) { toast(msgErreur(e), 'erreur'); } finally { setOccupe(false); }
  }
  async function statut(s, message) {
    setOccupe(true);
    try { await api.changerStatutFacture(f.id, s); await ctx.recharger(); toast(message); }
    catch (e) { toast(msgErreur(e), 'erreur'); } finally { setOccupe(false); }
  }
  return html`<li class="facture">
    <div class="facture-corps">
      <strong>${f.numero}</strong> <${Pastille} genre=${GENRE[f.statut]}>${STATUTS_FACTURE[f.statut]}<//>
      <div class="aide">${f.clubNom} · ${comp ? comp.nom : '—'}</div>
      <small>${fmtDate(String(f.created_at).slice(0, 10))}${f.date_envoi ? ' · envoyée le ' + fmtDate(String(f.date_envoi).slice(0, 10)) : ''}</small>
    </div>
    <div class="facture-montant">${fmtXpf(f.montant_xpf)}</div>
    <div class="etiquettes">
      <button class="btn btn-secondaire" type="button" disabled=${occupe} onClick=${pdf}><${Icone} nom="telecharger" taille=${18} /> PDF</button>
      ${ctx.estCadre && f.statut === 'generee' && html`<button class="btn btn-lien" type="button" disabled=${occupe} onClick=${() => statut('envoyee', 'Marquée comme envoyée.')}>Marquer envoyée</button>`}
      ${ctx.estCadre && (f.statut === 'generee' || f.statut === 'envoyee') && html`<button class="btn btn-lien" type="button" disabled=${occupe} onClick=${() => statut('reglee', 'Marquée comme réglée.')}>Marquer réglée</button>`}
      ${ctx.estCadre && f.statut !== 'annulee' && f.statut !== 'reglee' && html`<button class="btn btn-lien" type="button" disabled=${occupe} onClick=${() => statut('annulee', 'Facture annulée.')}>Annuler</button>`}
    </div>
  </li>`;
}

export function PageFactures({ ctx, route }) {
  const q = route.query;
  const statut = q.statut || 'toutes';
  const liste = ctx.factures
    .filter((f) => (statut === 'toutes' ? true : f.statut === statut))
    .filter((f) => (q.competition ? f.competition_id === q.competition : true))
    .filter((f) => (q.club ? f.club_id === q.club : true))
    .sort((a, b) => b.numero.localeCompare(a.numero));
  const total = liste.filter((f) => f.statut !== 'annulee').reduce((n, f) => n + f.montant_xpf, 0);
  const aRegler = liste.filter((f) => f.statut === 'generee' || f.statut === 'envoyee').reduce((n, f) => n + f.montant_xpf, 0);
  const change = (cle, v) => naviguer(['factures'], { ...q, [cle]: v }, true);
  const comp = q.competition ? ctx.competitionParId.get(q.competition) : null;
  function exporter() {
    telechargerCsv(`factures-${aujourdhuiISO()}.csv`,
      ['Numéro', 'Date', 'Club', 'Compétition', 'Montant (XPF)', 'Statut'],
      liste.map((f) => [f.numero, fmtDate(String(f.created_at).slice(0, 10)), f.clubNom, ctx.competitionParId.get(f.competition_id)?.nom || '', f.montant_xpf, STATUTS_FACTURE[f.statut]]));
  }
  return html`<div class="page">
    <div class="page-tete"><div><h1>Factures</h1>
      <p>${comp ? comp.nom + ' · ' : ''}${liste.length} facture${liste.length > 1 ? 's' : ''} · ${fmtXpf(total)} · ${fmtXpf(aRegler)} à régler</p></div>
      <div class="page-actions"><button class="btn btn-secondaire" type="button" id="exp-factures" disabled=${!liste.length} onClick=${exporter}><${Icone} nom="telecharger" taille=${20} /> Exporter (CSV)</button></div></div>
    <section class="carte filtres" aria-label="Filtres">
      <div class="puces" role="group" aria-label="Statut">
        ${[['toutes', 'Toutes'], ['generee', 'À envoyer'], ['envoyee', 'Envoyées'], ['reglee', 'Réglées'], ['annulee', 'Annulées']].map(([v, l]) => html`
          <button key=${v} type="button" class="puce" aria-pressed=${statut === v} onClick=${() => change('statut', v === 'toutes' ? '' : v)}>${l}</button>`)}
      </div>
      ${ctx.estCadre && ctx.clubs.length > 1 && html`<div class="filtres-ligne"><select aria-label="Club" value=${q.club || ''} onChange=${(e) => change('club', e.target.value)}>
        <option value="">Tous les clubs</option>${ctx.clubs.map((c) => html`<option key=${c.id} value=${c.id}>${c.nom}</option>`)}</select></div>`}
    </section>
    ${comp && html`<a class="retour" href=${lien(['factures'])}>Voir toutes les factures</a>`}
    ${liste.length === 0 ? html`<p class="vide">Aucune facture.</p>` : html`<ul class="liste-factures">${liste.map((f) => html`<${Ligne} key=${f.id} ctx=${ctx} f=${f} />`)}</ul>`}
  </div>`;
}

export function CarteFacturation({ ctx, c }) {
  const [occupe, setOccupe] = useState(false);
  if (!ctx.estCadre || (c.statut !== 'cloturee' && c.statut !== 'terminee')) return null;
  const factures = ctx.factures.filter((f) => f.competition_id === c.id);
  const actives = ctx.inscriptions.filter((i) => i.competition_id === c.id && i.statut === 'active' && i.joueurs.length > 0);
  const sans = actives.filter((i) => !ctx.factures.some((f) => f.inscription_id === i.id));
  async function generer() {
    setOccupe(true);
    try {
      const n = await api.genererFactures(c.id);
      await ctx.recharger();
      toast(n === 0 ? 'Aucune nouvelle facture à générer.' : `${n} facture${n > 1 ? 's' : ''} générée${n > 1 ? 's' : ''}.`);
    } catch (e) { toast(msgErreur(e), 'erreur'); } finally { setOccupe(false); }
  }
  return html`<section class="carte" aria-label="Facturation">
    <h2>Facturation</h2>
    <p class="aide">${factures.length} facture${factures.length > 1 ? 's' : ''} · ${sans.length} inscription${sans.length > 1 ? 's' : ''} sans facture</p>
    ${c.montant_xpf === 0 && html`<p class="avis">Compétition gratuite : aucune facture n'est créée.</p>`}
    <div class="actions">
      <button class="btn btn-primaire" type="button" disabled=${occupe || c.montant_xpf === 0 || sans.length === 0} onClick=${generer}>${occupe ? 'Génération…' : 'Générer les factures'}</button>
      ${factures.length > 0 && html`<a class="btn btn-secondaire" href=${lien(['factures'], { competition: c.id })}>Voir les factures</a>`}
    </div>
  </section>`;
}
