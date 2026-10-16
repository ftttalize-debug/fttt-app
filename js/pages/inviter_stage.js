// Le club invite les parents de ses jeunes à s'inscrire à un stage : un e-mail avec le lien d'inscription part automatiquement.
// Le club n'inscrit personne : c'est le parent qui s'inscrit.
import { html, useState, useEffect, useMemo } from '../preact.js';
import { api } from '../data.js';
import { fmtDate, msgErreur } from '../lib.js';
import { Pastille, Champ, Chargement, toast } from '../ui.js';

const quand = (s) => (s.date_fin && s.date_fin !== s.date_debut ? `Du ${fmtDate(s.date_debut)} au ${fmtDate(s.date_fin)}` : fmtDate(s.date_debut));

export function PageInviterStage({ ctx }) {
  const clubs = ctx.estCadre ? ctx.clubs.filter((k) => k.actif) : ctx.clubs.filter((k) => ctx.clubsResponsable.includes(k.id));
  const [club, setClub] = useState(clubs[0]?.id || '');
  const [stages, setStages] = useState(null);
  const [jeunes, setJeunes] = useState(null);
  const [coches, setCoches] = useState(new Set());
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  const [bilan, setBilan] = useState(null);

  useEffect(() => { api.stagesPublics().then(setStages).catch((e) => setErreur(msgErreur(e))); }, []);
  const charger = () => {
    if (!club) return setJeunes(null);
    setJeunes(null);
    api.invitablesStage(club).then((l) => { setJeunes(l); setCoches(new Set()); }).catch((e) => setErreur(msgErreur(e)));
  };
  useEffect(() => { setBilan(null); charger(); }, [club]);

  const invitables = (jeunes || []).filter((j) => j.a_email && !j.deja_inscrit);
  const bascule = (id) => setCoches((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toutCocher = () => setCoches(new Set(invitables.filter((j) => !j.invite_le).map((j) => j.licencie_id)));

  async function envoyer() {
    setOccupe(true);
    setErreur('');
    try {
      const ids = [...coches];
      const renvoyer = (jeunes || []).some((j) => coches.has(j.licencie_id) && j.invite_le);
      const r = await api.inviterStage(club, ids, renvoyer);
      let envoi = null;
      if (r.en_file > 0) {
        try { envoi = await api.envoyerInvitationsStage(); }
        catch (e) { envoi = { erreur: msgErreur(e) }; }
      }
      setBilan({ ...r, envoi });
      toast(r.en_file > 0 ? 'Invitations envoyées.' : 'Aucune invitation envoyée.');
      charger();
    } catch (e) { setErreur(msgErreur(e)); } finally { setOccupe(false); }
  }

  return html`<div class="page">
    <div class="page-tete"><div><h1>Stages</h1><p>Invite les parents de ton club : ils reçoivent par e-mail le lien pour inscrire leur enfant aux stages ouverts.</p></div></div>
    ${clubs.length === 0 && html`<p class="vide">Aucun club à gérer.</p>`}
    ${erreur && html`<p class="erreur" role="alert">${erreur}</p>`}
    ${clubs.length > 0 && html`<section class="carte">
      <div class="grille grille-2">
        ${clubs.length > 1 && html`<${Champ} id="iv-club" libelle="Club">
          <select id="iv-club" value=${club} onChange=${(e) => setClub(e.target.value)}>${clubs.map((k) => html`<option key=${k.id} value=${k.id}>${k.nom}</option>`)}</select>
        <//>`}
      </div>
      ${stages && stages.length > 0 && html`<p class="aide">Stages ouverts, annoncés dans l'e-mail :</p>
        <ul class="liste-simple">${stages.map((s) => html`<li key=${s.id}><strong>${s.nom}</strong> · ${quand(s)}</li>`)}</ul>`}
      ${stages && stages.length === 0 && html`<p class="avis">Aucun stage n'est ouvert aux inscriptions pour le moment : l'invitation n'est pas possible.</p>`}
    </section>`}
    ${club && !jeunes && !erreur && html`<${Chargement} />`}
    ${jeunes && html`<section class="carte">
      <h2>Inviter les parents</h2>
      <p class="aide">L'e-mail part à l'adresse du représentant légal inscrite sur la fiche du jeune (ou à celle du licencié s'il est majeur). Pour qu'un jeune puisse être invité, complète cette adresse sur sa fiche.</p>
      <div class="etiquettes"><button class="btn btn-secondaire" type="button" onClick=${toutCocher}>Cocher ceux pas encore invités</button>
        <button class="btn btn-secondaire" type="button" onClick=${() => setCoches(new Set())}>Tout décocher</button></div>
      <ul style="margin-top:12px;list-style:none;padding:0">
        ${jeunes.map((j) => html`<li key=${j.licencie_id} class="stage-ligne">
          <div class="case">
            <input id=${'iv-' + j.licencie_id} type="checkbox" disabled=${!j.a_email} checked=${coches.has(j.licencie_id)} onChange=${() => bascule(j.licencie_id)} />
            <label for=${'iv-' + j.licencie_id}><strong>${j.prenom} ${j.nom}</strong></label>
          </div>
          <span class="etiquettes">
            ${j.deja_inscrit && html`<${Pastille} genre="actif">Déjà inscrit à un stage<//>`}
            ${!j.a_email && html`<${Pastille} genre="alerte">Pas d'e-mail sur la fiche<//>`}
            ${j.invite_le && html`<${Pastille} genre="neutre">Invité le ${fmtDate(String(j.invite_le).slice(0, 10))}<//>`}
          </span>
        </li>`)}
      </ul>
      ${jeunes.length === 0 && html`<p class="vide">Aucun licencié actif dans ce club pour la saison en cours.</p>`}
      <div class="etiquettes" style="margin-top:14px">
        <button class="btn btn-primaire" type="button" disabled=${occupe || coches.size === 0 || !stages || stages.length === 0} onClick=${envoyer}>${occupe ? 'Envoi…' : `Envoyer l'invitation (${coches.size})`}</button>
      </div>
    </section>`}
    ${bilan && html`<section class="avis" aria-live="polite">
      ${bilan.en_file > 0 && !bilan.envoi?.erreur && html`<p><strong>${bilan.en_file} invitation${bilan.en_file > 1 ? 's' : ''} envoyée${bilan.en_file > 1 ? 's' : ''}.</strong></p>`}
      ${bilan.envoi?.erreur && html`<p class="erreur">Les invitations sont enregistrées mais l'envoi des e-mails a échoué : ${bilan.envoi.erreur}. Préviens la fédération.</p>`}
      ${bilan.envoi?.echecs > 0 && html`<p class="erreur">${bilan.envoi.echecs} e-mail(s) n'ont pas pu partir. Préviens la fédération.</p>`}
      ${bilan.sans_email?.length > 0 && html`<p>Sans adresse e-mail sur la fiche : ${bilan.sans_email.join(', ')}.</p>`}
      ${bilan.deja_invites?.length > 0 && html`<p>Déjà invités : ${bilan.deja_invites.join(', ')}.</p>`}
    </section>`}
  </div>`;
}
