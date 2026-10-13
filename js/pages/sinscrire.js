// Inscription des athlètes eux-mêmes, sans compte : numéro de licence + date de naissance.
import { html, useState } from '../preact.js';
import { api } from '../data.js';
import { fmtDate, fmtPts, msgErreur } from '../lib.js';
import { Champ, Pastille } from '../ui.js';
import { OngletsPublics } from './public.js';

const TYPES = { simple: 'Simple', double: 'Double', equipe: 'Par équipes' };
const xpf = (n) => (n ? `${Number(n).toLocaleString('fr-FR')} XPF` : 'Gratuit');


function CarteComp({ c, occupe, agir }) {
  const [partenaire, setPartenaire] = useState('');
  const double = c.type === 'double';
  return html`<li class="carte-comp">
    <div class="match-tete"><strong>${c.nom}</strong>${c.inscrit && html`<${Pastille} genre="actif">Inscrit(e)<//>`}</div>
    <p class="comp-date">${c.date_fin && c.date_fin !== c.date_debut ? `Du ${fmtDate(c.date_debut)} au ${fmtDate(c.date_fin)}` : fmtDate(c.date_debut)}${c.lieu ? ' · ' + c.lieu : ''}</p>
    <p class="comp-infos">${TYPES[c.type] || c.type} · ${xpf(c.montant_xpf)}${c.date_limite ? ' · inscriptions jusqu\'au ' + fmtDate(c.date_limite) : ''}</p>
    ${c.inscrit && double && c.partenaire && html`<p>Double avec <strong>${c.partenaire}</strong></p>`}
    ${c.inscrit
      ? html`<button class="btn btn-secondaire" type="button" disabled=${occupe} onClick=${() => agir(c, 'desinscrire')}>${double ? 'Annuler le double' : 'Me désinscrire'}</button>`
      : html`
        ${double && (c.propositions_recues || []).map((p) => html`<div class="proposition" key=${p.id}>
          <p><strong>${p.proposant}</strong>${p.club ? ' (' + p.club + ')' : ''} te propose de jouer le double avec lui/elle.</p>
          <div class="etiquettes">
            <button class="btn btn-primaire" type="button" disabled=${occupe} onClick=${() => agir(c, 'accepter', p.id)}>Accepter</button>
            <button class="btn btn-secondaire" type="button" disabled=${occupe} onClick=${() => agir(c, 'refuser', p.id)}>Refuser</button>
          </div></div>`)}
        ${double && (c.propositions_envoyees || []).map((p) => html`<div class="proposition" key=${p.id}>
          <p>En attente de la réponse de <strong>${p.partenaire}</strong>${p.club ? ' (' + p.club + ')' : ''}.</p>
          <button class="btn btn-secondaire" type="button" disabled=${occupe} onClick=${() => agir(c, 'annuler', p.id)}>Annuler la proposition</button></div>`)}
        ${c.indisponible
          ? html`<p class="aide">${c.indisponible}</p>`
          : double
            ? html`<div class="proposition">
                <label for=${'part-' + c.id}>N° de licence de ton partenaire</label>
                <input id=${'part-' + c.id} autocomplete="off" autocapitalize="characters" placeholder="FTTT-00123" value=${partenaire} onInput=${(e) => setPartenaire(e.target.value)} />
                <button class="btn btn-primaire" type="button" disabled=${occupe || !partenaire.trim()} onClick=${() => agir(c, 'proposer', partenaire)}>Proposer le double</button></div>`
            : html`<button class="btn btn-primaire" type="button" disabled=${occupe} onClick=${() => agir(c, 'inscrire')}>M'inscrire</button>`}`}
  </li>`;
}

export function PageSinscrire() {
  const [numero, setNumero] = useState('');
  const [naissance, setNaissance] = useState('');
  const [moi, setMoi] = useState(null);
  const [liste, setListe] = useState(null);
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');
  const [occupe, setOccupe] = useState(false);

  async function charger(n, d) {
    const r = await api.athleteCompetitions(n, d);
    if (r?.erreur) throw new Error(r.erreur);
    setListe(r.competitions || []);
  }

  async function connecter(e) {
    e.preventDefault();
    setErreur(''); setMessage(''); setOccupe(true);
    try {
      const n = numero.trim().toUpperCase();
      const r = await api.athleteIdentifier(n, naissance);
      if (r?.erreur) throw new Error(r.erreur);
      setMoi(r);
      await charger(n, naissance);
    } catch (err) { setErreur(msgErreur(err)); setMoi(null); setListe(null); }
    setOccupe(false);
  }

  // action : 'inscrire' | 'desinscrire' | 'proposer' | 'annuler' | 'accepter' | 'refuser'
  async function agir(c, action, cible) {
    setErreur(''); setMessage(''); setOccupe(true);
    try {
      const n = moi.numero;
      let r; let ok = '';
      if (action === 'inscrire') { r = await api.athleteInscrire(n, naissance, c.id); ok = `Tu es inscrit(e) à « ${c.nom} ». Ton club est informé : la facture est établie au nom du club.`; }
      else if (action === 'desinscrire') { r = await api.athleteDesinscrire(n, naissance, c.id); ok = `Ton inscription à « ${c.nom} » est annulée.`; }
      else if (action === 'proposer') { r = await api.athleteProposerDouble(n, naissance, c.id, cible); ok = `Proposition envoyée à ${r?.partenaire || 'ton partenaire'}${r?.club ? ' (' + r.club + ')' : ''}. Le double sera inscrit quand il l'aura confirmée sur cette page, avec son numéro et sa date de naissance.`; }
      else if (action === 'annuler') { r = await api.athleteAnnulerProposition(n, naissance, cible); ok = 'Proposition annulée.'; }
      else if (action === 'accepter') { r = await api.athleteRepondreDouble(n, naissance, cible, true); ok = `Double confirmé et inscrit à « ${c.nom} ». Chaque club est facturé pour son joueur.`; }
      else { r = await api.athleteRepondreDouble(n, naissance, cible, false); ok = 'Proposition refusée.'; }
      if (r?.erreur) throw new Error(r.erreur);
      setMessage(ok);
      await charger(n, naissance);
    } catch (err) { setErreur(msgErreur(err)); }
    setOccupe(false);
  }

  function quitter() { setMoi(null); setListe(null); setNumero(''); setNaissance(''); setMessage(''); setErreur(''); }

  return html`<div class="page">
    <div class="page-tete"><div><h1>Je m'inscris</h1><p>Inscription aux compétitions avec ton numéro de licence</p></div></div>
    <${OngletsPublics} actif="sinscrire" />
    ${!moi && html`<form class="carte" id="form-sinscrire" onSubmit=${connecter}>
      <p>Saisis ton numéro de licence (par exemple FTTT-00123) et ta date de naissance. Ton club te communique ton numéro.</p>
      <${Champ} id="s-num" libelle="Numéro de licence">
        <input id="s-num" autocomplete="off" autocapitalize="characters" placeholder="FTTT-00123" value=${numero} onInput=${(e) => setNumero(e.target.value)} required />
      <//>
      <${Champ} id="s-nais" libelle="Date de naissance">
        <input id="s-nais" type="date" value=${naissance} onInput=${(e) => setNaissance(e.target.value)} required />
      <//>
      ${erreur && html`<p class="erreur" role="alert">${erreur}</p>`}
      <button class="btn btn-primaire" type="submit" disabled=${occupe}>${occupe ? 'Vérification…' : 'Continuer'}</button>
    </form>`}
    ${moi && html`<section class="carte" id="mon-espace">
      <div class="match-tete"><strong>${moi.prenom} ${moi.nom}</strong><${Pastille} genre=${moi.actif ? 'actif' : 'archive'}>${moi.actif ? 'Licence active' : 'Licence non active'}<//></div>
      <p>${moi.club || 'Sans club'} · ${fmtPts(moi.points)} points · n° ${moi.numero}</p>
      <button class="btn btn-secondaire" type="button" onClick=${quitter}>Ce n'est pas moi / Quitter</button>
    </section>`}
    ${message && html`<p class="succes" role="status">${message}</p>`}
    ${moi && erreur && html`<p class="erreur" role="alert">${erreur}</p>`}
    ${moi && liste && liste.length === 0 && html`<p class="vide">Aucune compétition n'est ouverte aux inscriptions pour le moment.</p>`}
    ${moi && liste && liste.length > 0 && html`<h2>Compétitions ouvertes</h2>
      <ul class="liste-comp" id="comp-ouvertes">${liste.map((c) => html`<${CarteComp} key=${c.id} c=${c} occupe=${occupe} agir=${agir} />`)}</ul>`}
  </div>`;
}
