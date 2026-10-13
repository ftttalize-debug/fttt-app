// Inscription des athlètes eux-mêmes, sans compte : numéro de licence + date de naissance.
import { html, useState } from '../preact.js';
import { api } from '../data.js';
import { fmtDate, fmtPts, msgErreur } from '../lib.js';
import { Champ, Pastille } from '../ui.js';
import { OngletsPublics } from './public.js';

const TYPES = { simple: 'Simple', double: 'Double', equipe: 'Par équipes' };
const xpf = (n) => (n ? `${Number(n).toLocaleString('fr-FR')} XPF` : 'Gratuit');

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

  async function agir(c, inscrire) {
    setErreur(''); setMessage(''); setOccupe(true);
    try {
      const n = moi.numero;
      const r = inscrire ? await api.athleteInscrire(n, naissance, c.id) : await api.athleteDesinscrire(n, naissance, c.id);
      if (r?.erreur) throw new Error(r.erreur);
      setMessage(inscrire ? `Tu es inscrit(e) à « ${c.nom} ». Ton club est informé : la facture est établie au nom du club.` : `Ton inscription à « ${c.nom} » est annulée.`);
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
      <ul class="liste-comp" id="comp-ouvertes">${liste.map((c) => html`<li class="carte-comp" key=${c.id}>
        <div class="match-tete"><strong>${c.nom}</strong>${c.inscrit && html`<${Pastille} genre="actif">Inscrit(e)<//>`}</div>
        <p class="comp-date">${c.date_fin && c.date_fin !== c.date_debut ? `Du ${fmtDate(c.date_debut)} au ${fmtDate(c.date_fin)}` : fmtDate(c.date_debut)}${c.lieu ? ' · ' + c.lieu : ''}</p>
        <p class="comp-infos">${TYPES[c.type] || c.type} · ${xpf(c.montant_xpf)}${c.date_limite ? ' · inscriptions jusqu\'au ' + fmtDate(c.date_limite) : ''}</p>
        ${c.inscrit
          ? html`<button class="btn btn-secondaire" type="button" disabled=${occupe} onClick=${() => agir(c, false)}>Me désinscrire</button>`
          : c.indisponible
            ? html`<p class="aide">${c.indisponible}</p>`
            : html`<button class="btn btn-primaire" type="button" disabled=${occupe} onClick=${() => agir(c, true)}>M'inscrire</button>`}
      </li>`)}</ul>`}
  </div>`;
}
