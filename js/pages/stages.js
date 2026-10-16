// Page publique « Stages » : liste des stages ouverts et inscription sans compte (licence événementielle).
import { html, useState, useEffect, useMemo } from '../preact.js';
import { api } from '../data.js';
import { fmtDate, msgErreur, estMineur, emailValide, aujourdhuiISO } from '../lib.js';
import { Champ, Pastille, Chargement } from '../ui.js';
import { OngletsPublics } from './public.js';

const xpf = (n) => `${Number(n || 0).toLocaleString('fr-FR')} XPF`;
const quand = (s) => (s.date_fin && s.date_fin !== s.date_debut ? `Du ${fmtDate(s.date_debut)} au ${fmtDate(s.date_fin)}` : fmtDate(s.date_debut));
const VIDE = {
  prenom: '', nom: '', naissance: '', sexe: '', telephone: '', email: '',
  representantNom: '', representantTelephone: '', representantEmail: '',
  autorisationParentale: false, autorisationPhoto: false, modePaiement: '', site: ''
};

function CarteStage({ s, onChoisir }) {
  const restantes = s.places_max - s.places_prises;
  const complet = restantes <= 0;
  return html`<li class="carte-comp">
    <div class="match-tete"><strong>${s.nom}</strong>
      ${complet ? html`<${Pastille} genre="alerte">Complet<//>` : html`<${Pastille} genre="actif">${restantes} place${restantes > 1 ? 's' : ''} restante${restantes > 1 ? 's' : ''}<//>`}
    </div>
    <p class="comp-date">${quand(s)}${s.lieu ? ' · ' + s.lieu : ''}</p>
    <p class="comp-infos">Licencié(e) FTTT : ${xpf(s.tarif_licencie)} · Non licencié(e) : ${xpf(s.tarif_non_licencie)} · licence événementielle incluse</p>
    ${complet && html`<p class="aide">Le stage est complet : tu peux t'inscrire sur la liste d'attente${s.en_attente ? ` (${s.en_attente} personne${s.en_attente > 1 ? 's' : ''} en attente)` : ''}.</p>`}
    <button class="btn btn-primaire" type="button" onClick=${() => onChoisir(s)}>${complet ? 'Rejoindre la liste d\'attente' : 'S\'inscrire'}</button>
  </li>`;
}

function Confirmation({ stage, r, onRetour }) {
  const attente = r.statut === 'attente';
  const lignes = Array.isArray(r.paiement) ? r.paiement : [];
  return html`<section class="carte" aria-live="polite">
    <h2>${attente ? 'Tu es sur la liste d\'attente' : 'Inscription enregistrée'}</h2>
    <p><strong>${stage.nom}</strong> · ${quand(stage)}${stage.lieu ? ' · ' + stage.lieu : ''}</p>
    ${attente
      ? html`<p class="avis">Le stage est complet. La fédération te contactera si une place se libère. Aucun règlement n'est à faire pour le moment.</p>`
      : html`<p class="avis">Ton inscription est confirmée. Montant à régler : <strong>${xpf(r.montant_xpf)}</strong> (${r.tarif === 'licencie' ? 'tarif licencié' : 'tarif non licencié'}, licence événementielle incluse).</p>`}
    ${!attente && r.mode_paiement === 'sur_place' && html`<p>Règlement <strong>sur place</strong> le jour du stage. Une facture acquittée te sera remise une fois le paiement effectué.</p>`}
    ${!attente && r.mode_paiement === 'virement' && html`<div>
      <p>Règlement <strong>par virement</strong>${lignes.length ? ' :' : '. La fédération te communiquera ses coordonnées bancaires.'}</p>
      ${lignes.length > 0 && html`<ul class="liste-simple">${lignes.map((l, i) => html`<li key=${i}>${l}</li>`)}</ul>`}
      <p class="aide">Indique le nom du participant en référence du virement. Une facture acquittée te sera remise après réception.</p>
    </div>`}
    <button class="btn btn-secondaire" type="button" onClick=${onRetour}>Retour aux stages</button>
  </section>`;
}

function Formulaire({ stage, onAnnuler, onFait }) {
  const [f, setF] = useState(VIDE);
  const [erreurs, setErreurs] = useState({});
  const [occupe, setOccupe] = useState(false);
  const [erreurGlobale, setErreurGlobale] = useState('');
  const maj = (p) => setF((x) => ({ ...x, ...p }));
  const mineur = useMemo(() => !!f.naissance && f.naissance <= aujourdhuiISO() && estMineur(f.naissance), [f.naissance]);

  function valider() {
    const e = {};
    if (!f.prenom.trim()) e.prenom = 'Obligatoire.';
    if (!f.nom.trim()) e.nom = 'Obligatoire.';
    if (!f.naissance || f.naissance > aujourdhuiISO()) e.naissance = 'Date de naissance invalide.';
    if (!f.sexe) e.sexe = 'Obligatoire.';
    if (!emailValide(f.email)) e.email = 'Adresse e-mail invalide.';
    if (!emailValide(f.representantEmail)) e.representantEmail = 'Adresse e-mail invalide.';
    if (mineur) {
      if (!f.representantNom.trim()) e.representantNom = 'Le nom du parent ou tuteur est obligatoire.';
      if (!f.representantTelephone.trim() && !f.representantEmail.trim()) e.representantTelephone = 'Indique un téléphone ou un e-mail du parent ou tuteur.';
      if (!f.autorisationParentale) e.autorisationParentale = 'L\'autorisation parentale est obligatoire.';
    } else if (!f.telephone.trim() && !f.email.trim()) {
      e.telephone = 'Indique un téléphone ou une adresse e-mail.';
    }
    if (!f.modePaiement) e.modePaiement = 'Choisis un mode de règlement.';
    return e;
  }

  async function envoyer(ev) {
    ev.preventDefault();
    const e = valider();
    setErreurs(e);
    setErreurGlobale('');
    if (Object.keys(e).length) return;
    setOccupe(true);
    try {
      const r = await api.sinscrireStage({ stage: stage.id, ...f, prenom: f.prenom.trim(), nom: f.nom.trim() });
      onFait(r);
    } catch (er) {
      setErreurGlobale(msgErreur(er));
    } finally {
      setOccupe(false);
    }
  }

  return html`<form class="page" style="gap:20px" onSubmit=${envoyer} noValidate>
    <section class="carte">
      <h2>${stage.nom}</h2>
      <p class="comp-date">${quand(stage)}${stage.lieu ? ' · ' + stage.lieu : ''}</p>
      <p class="aide">Tarif : ${xpf(stage.tarif_licencie)} si tu as une licence FTTT cette saison, sinon ${xpf(stage.tarif_non_licencie)}. Il est appliqué automatiquement. La licence événementielle est incluse.</p>
    </section>
    <section class="carte">
      <h2>Participant</h2>
      <div class="grille grille-2">
        <${Champ} id="s-prenom" libelle="Prénom" erreur=${erreurs.prenom}>
          <input id="s-prenom" type="text" autocomplete="given-name" value=${f.prenom} onInput=${(e) => maj({ prenom: e.target.value })} />
        <//>
        <${Champ} id="s-nom" libelle="Nom" erreur=${erreurs.nom}>
          <input id="s-nom" type="text" autocomplete="family-name" value=${f.nom} onInput=${(e) => maj({ nom: e.target.value })} />
        <//>
        <${Champ} id="s-naissance" libelle="Date de naissance" erreur=${erreurs.naissance}>
          <input id="s-naissance" type="date" autocomplete="bday" value=${f.naissance} onInput=${(e) => maj({ naissance: e.target.value })} />
        <//>
        <${Champ} id="s-sexe" libelle="Sexe" erreur=${erreurs.sexe}>
          <select id="s-sexe" value=${f.sexe} onChange=${(e) => maj({ sexe: e.target.value })}>
            <option value="">Choisir…</option>
            <option value="F">Femme / fille</option>
            <option value="M">Homme / garçon</option>
          </select>
        <//>
        <${Champ} id="s-tel" libelle=${mineur ? 'Téléphone du participant (facultatif)' : 'Téléphone'} erreur=${erreurs.telephone}>
          <input id="s-tel" type="tel" autocomplete="tel" value=${f.telephone} onInput=${(e) => maj({ telephone: e.target.value })} />
        <//>
        <${Champ} id="s-mail" libelle=${mineur ? 'E-mail du participant (facultatif)' : 'Adresse e-mail'} erreur=${erreurs.email}>
          <input id="s-mail" type="email" autocomplete="email" value=${f.email} onInput=${(e) => maj({ email: e.target.value })} />
        <//>
      </div>
    </section>
    ${mineur && html`<section class="carte">
      <h2>Parent ou tuteur légal</h2>
      <p class="aide">Le participant est mineur : ces informations sont obligatoires. Le parent n'a pas besoin d'être licencié.</p>
      <div class="grille grille-2">
        <div class="plein"><${Champ} id="s-rep" libelle="Nom et prénom du parent ou tuteur" erreur=${erreurs.representantNom}>
          <input id="s-rep" type="text" autocomplete="name" value=${f.representantNom} onInput=${(e) => maj({ representantNom: e.target.value })} />
        <//></div>
        <${Champ} id="s-rep-tel" libelle="Téléphone" erreur=${erreurs.representantTelephone}>
          <input id="s-rep-tel" type="tel" value=${f.representantTelephone} onInput=${(e) => maj({ representantTelephone: e.target.value })} />
        <//>
        <${Champ} id="s-rep-mail" libelle="Adresse e-mail" erreur=${erreurs.representantEmail}>
          <input id="s-rep-mail" type="email" value=${f.representantEmail} onInput=${(e) => maj({ representantEmail: e.target.value })} />
        <//>
      </div>
      <div class=${'champ' + (erreurs.autorisationParentale ? ' champ-erreur' : '')}>
        <div class="case">
          <input id="s-autpar" type="checkbox" checked=${f.autorisationParentale} onChange=${(e) => maj({ autorisationParentale: e.target.checked })} />
          <label for="s-autpar">J'autorise mon enfant à participer à ce stage (autorisation parentale).</label>
        </div>
        ${erreurs.autorisationParentale && html`<p class="erreur" role="alert">${erreurs.autorisationParentale}</p>`}
      </div>
    </section>`}
    <section class="carte">
      <h2>Photos et règlement</h2>
      <div class="case">
        <input id="s-photo" type="checkbox" checked=${f.autorisationPhoto} onChange=${(e) => maj({ autorisationPhoto: e.target.checked })} />
        <label for="s-photo">J'autorise la FTTT à prendre et à utiliser des photos et vidéos du stage (site, réseaux sociaux). Facultatif.</label>
      </div>
      <${Champ} id="s-mode" libelle="Mode de règlement" erreur=${erreurs.modePaiement}>
        <select id="s-mode" value=${f.modePaiement} onChange=${(e) => maj({ modePaiement: e.target.value })}>
          <option value="">Choisir…</option>
          <option value="sur_place">Sur place, le jour du stage</option>
          <option value="virement">Par virement</option>
        </select>
      <//>
      <div style="position:absolute;left:-9999px" aria-hidden="true">
        <label for="s-site">Ne pas remplir</label>
        <input id="s-site" type="text" tabindex="-1" autocomplete="off" value=${f.site} onInput=${(e) => maj({ site: e.target.value })} />
      </div>
      <p class="aide">Les informations saisies servent uniquement à gérer ce stage et ne sont visibles que de la fédération.</p>
    </section>
    ${erreurGlobale && html`<p class="erreur" role="alert">${erreurGlobale}</p>`}
    <div class="etiquettes">
      <button class="btn btn-primaire" type="submit" disabled=${occupe}>${occupe ? 'Envoi…' : (stage.places_prises >= stage.places_max ? 'Rejoindre la liste d\'attente' : 'Valider mon inscription')}</button>
      <button class="btn btn-secondaire" type="button" disabled=${occupe} onClick=${onAnnuler}>Annuler</button>
    </div>
  </form>`;
}

export function PageStages() {
  const [stages, setStages] = useState(null);
  const [erreur, setErreur] = useState('');
  const [choix, setChoix] = useState(null);
  const [resultat, setResultat] = useState(null);

  const charger = () => api.stagesPublics().then(setStages).catch((e) => setErreur(msgErreur(e)));
  useEffect(() => { charger(); }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [choix, resultat]);

  return html`<div class="page">
    <div class="page-tete"><div><h1>Stages</h1><p>Inscris-toi à un stage de la fédération, sans compte.</p></div></div>
    <${OngletsPublics} actif="stages" />
    ${resultat
      ? html`<${Confirmation} stage=${choix} r=${resultat} onRetour=${() => { setResultat(null); setChoix(null); charger(); }} />`
      : choix
        ? html`<${Formulaire} stage=${choix} onAnnuler=${() => setChoix(null)} onFait=${setResultat} />`
        : erreur ? html`<p class="erreur" role="alert">${erreur}</p>`
        : !stages ? html`<${Chargement} />`
        : stages.length === 0 ? html`<p class="vide">Aucun stage n'est ouvert aux inscriptions pour le moment. Reviens bientôt.</p>`
        : html`<ul class="liste-comp">${stages.map((s) => html`<${CarteStage} key=${s.id} s=${s} onChoisir=${setChoix} />`)}</ul>`}
  </div>`;
}
