// Page publique « Stages » : un seul formulaire pour inscrire un ou plusieurs participants à un ou plusieurs stages.
// Sans compte. Chaque participant reçoit une licence événementielle (sans club) pour la durée du stage.
import { html, useState, useEffect, useMemo } from '../preact.js';
import { api } from '../data.js';
import { fmtDate, msgErreur, estMineur, emailValide, aujourdhuiISO, lireRoute } from '../lib.js';
import { Champ, Pastille, Chargement, toast } from '../ui.js';
import { OngletsPublics } from './public.js';
import { telechargerFiche, telechargerFiches, EMAIL_SECRETARIAT } from '../fiche-stage-pdf.js';

const xpf = (n) => `${Number(n || 0).toLocaleString('fr-FR')} XPF`;
const quand = (s) => (s.date_fin && s.date_fin !== s.date_debut ? `Du ${fmtDate(s.date_debut)} au ${fmtDate(s.date_fin)}` : fmtDate(s.date_debut));
let compteur = 0;
const participantVide = () => ({ cle: ++compteur, prenom: '', nom: '', naissance: '', sexe: '' });
const estMineurValide = (n) => !!n && n <= aujourdhuiISO() && estMineur(n);

function Confirmation({ stages, r, f, onRetour }) {
  const [occupe, setOccupe] = useState(false);
  const lignes = r.lignes || [];
  const confirmees = lignes.filter((l) => !l.deja && l.statut === 'inscrit');
  const attente = lignes.filter((l) => !l.deja && l.statut === 'attente');
  const deja = lignes.filter((l) => l.deja);
  const paiement = Array.isArray(r.paiement) ? r.paiement : [];
  const stageParId = new Map(stages.map((s) => [s.id, s]));

  // Une fiche par participant, avec tous ses stages confirmés
  const fiches = f.participants.map((p) => {
    const siens = confirmees.filter((l) => l.prenom.toLowerCase() === p.prenom.trim().toLowerCase() && l.nom.toLowerCase() === p.nom.trim().toLowerCase());
    if (!siens.length) return null;
    const mineur = estMineurValide(p.naissance);
    return {
      stages: siens.map((l) => stageParId.get(l.stage_id) || { nom: l.stage, date_debut: l.date_debut, date_fin: l.date_fin }),
      certificat: siens.some((l) => l.tarif === 'non_licencie'),
      inscription: {
        prenom: p.prenom.trim(), nom: p.nom.trim().toUpperCase(), date_naissance: p.naissance, mineur,
        telephone: mineur ? '' : f.contactTelephone.trim(), email: mineur ? '' : f.contactEmail.trim(),
        representant_nom: mineur ? f.contactNom.trim() : '', representant_telephone: f.contactTelephone.trim(), representant_email: f.contactEmail.trim(),
        autorisation_photo: f.autorisationPhoto
      }
    };
  }).filter(Boolean);
  const sansCertificat = fiches.filter((x) => x.certificat).map((x) => x.inscription.prenom);

  async function telecharger(fn) {
    setOccupe(true);
    try { await fn(); } catch (e) { toast(msgErreur(e), 'erreur'); } finally { setOccupe(false); }
  }
  const mailto = `mailto:${EMAIL_SECRETARIAT}?subject=${encodeURIComponent('Fiche d\'inscription signée - stage FTTT')}&body=${encodeURIComponent('Bonjour,\n\nVeuillez trouver ci-joint la fiche d\'inscription signée (photo ou scan à joindre à ce message).\n\nCordialement')}`;

  return html`<section class="carte" aria-live="polite">
    <h2>${confirmees.length ? 'Inscription enregistrée' : attente.length ? 'Tu es sur la liste d\'attente' : 'Déjà inscrit(e)'}</h2>
    ${confirmees.length > 0 && html`<ul class="liste-simple">
      ${confirmees.map((l, k) => html`<li key=${k}><strong>${l.prenom} ${l.nom}</strong> · ${l.stage} (${quand(l)}) · ${xpf(l.montant_xpf)} (${l.tarif === 'licencie' ? 'licencié' : 'non licencié'})</li>`)}
    </ul>`}
    ${attente.length > 0 && html`<p class="avis"><strong>Liste d'attente :</strong> ${attente.map((l) => `${l.prenom} ${l.nom} (${l.stage})`).join(', ')}. Le stage est complet : la fédération te contactera si une place se libère. Rien à régler pour ces stages pour le moment.</p>`}
    ${deja.length > 0 && html`<p class="aide">Déjà inscrit(e) : ${deja.map((l) => `${l.prenom} ${l.nom} (${l.stage})`).join(', ')}.</p>`}
    ${confirmees.length > 0 && html`<p class="avis">Total à régler : <strong>${xpf(r.total_xpf)}</strong>, licence événementielle incluse.</p>`}
    ${confirmees.length > 0 && r.mode_paiement === 'sur_place' && html`<p>Règlement <strong>sur place</strong> le premier jour. Une facture acquittée sera remise une fois le paiement effectué.</p>`}
    ${confirmees.length > 0 && r.mode_paiement === 'virement' && html`<div>
      <p>Règlement <strong>par virement</strong>${paiement.length ? ' :' : '. La fédération te communiquera ses coordonnées bancaires.'}</p>
      ${paiement.length > 0 && html`<ul class="liste-simple">${paiement.map((l, k) => html`<li key=${k}>${l}</li>`)}</ul>`}
      <p class="aide">Indique le nom du participant en référence du virement. Une facture acquittée sera remise après réception.</p>
    </div>`}
    ${fiches.length > 0 && html`<div class="avis">
      <p><strong>À apporter le premier jour :</strong></p>
      <ul class="liste-simple">
        <li>La fiche d'inscription, <strong>déjà remplie, il ne reste qu'à la signer</strong> (télécharge-la ci-dessous et imprime-la, ou envoie-nous la photo de la fiche signée à ${EMAIL_SECRETARIAT}).</li>
        ${sansCertificat.length > 0 && html`<li>Un <strong>certificat médical</strong> d'aptitude à la pratique sportive pour ${sansCertificat.join(', ')} (pas nécessaire pour un licencié).</li>`}
      </ul>
      <div class="etiquettes">
        ${fiches.length > 1
          ? html`<button class="btn btn-primaire" type="button" disabled=${occupe} onClick=${() => telecharger(() => telechargerFiches(fiches, 'inscription'))}>Télécharger toutes les fiches (PDF)</button>`
          : html`<button class="btn btn-primaire" type="button" disabled=${occupe} onClick=${() => telecharger(() => telechargerFiche(fiches[0]))}>Télécharger la fiche (PDF)</button>`}
        <a class="btn btn-secondaire" href=${mailto}>Envoyer la fiche signée par e-mail</a>
      </div></div>`}
    <button class="btn btn-secondaire" type="button" onClick=${onRetour}>Retour aux stages</button>
  </section>`;
}

function Formulaire({ stages, preselection, onFait }) {
  const [contact, setContact] = useState({ nom: '', telephone: '', email: '' });
  const [parts, setParts] = useState([participantVide()]);
  const [choisis, setChoisis] = useState(() => new Set(preselection));
  const [aut, setAut] = useState({ parentale: false, photo: false });
  const [mode, setMode] = useState('');
  const [site, setSite] = useState('');
  const [erreurs, setErreurs] = useState({});
  const [occupe, setOccupe] = useState(false);
  const [erreurGlobale, setErreurGlobale] = useState('');

  const majPart = (cle, p) => setParts((l) => l.map((x) => (x.cle === cle ? { ...x, ...p } : x)));
  const unMineur = useMemo(() => parts.some((p) => estMineurValide(p.naissance)), [parts]);
  const basculer = (id) => setChoisis((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  function valider() {
    const e = {};
    if (!contact.nom.trim()) e.contactNom = 'Obligatoire.';
    if (!contact.telephone.trim() && !contact.email.trim()) e.contactTelephone = 'Indique un téléphone ou une adresse e-mail.';
    if (!emailValide(contact.email)) e.contactEmail = 'Adresse e-mail invalide.';
    parts.forEach((p) => {
      const x = {};
      if (!p.prenom.trim()) x.prenom = 'Obligatoire.';
      if (!p.nom.trim()) x.nom = 'Obligatoire.';
      if (!p.naissance || p.naissance > aujourdhuiISO()) x.naissance = 'Date de naissance invalide.';
      if (!p.sexe) x.sexe = 'Obligatoire.';
      if (Object.keys(x).length) e['p' + p.cle] = x;
    });
    if (choisis.size === 0) e.stages = 'Choisis au moins un stage.';
    if (unMineur && !aut.parentale) e.parentale = 'L\'autorisation parentale est obligatoire.';
    if (!mode) e.mode = 'Choisis un mode de règlement.';
    return e;
  }

  async function envoyer(ev) {
    ev.preventDefault();
    const e = valider();
    setErreurs(e);
    setErreurGlobale('');
    if (Object.keys(e).length) return toast('Corrige les champs signalés.', 'erreur');
    setOccupe(true);
    try {
      const r = await api.sinscrireStages({
        stages: [...choisis], participants: parts.map((p) => ({ prenom: p.prenom.trim(), nom: p.nom.trim(), naissance: p.naissance, sexe: p.sexe })),
        contactNom: contact.nom.trim(), contactTelephone: contact.telephone.trim(), contactEmail: contact.email.trim(),
        autorisationParentale: aut.parentale, autorisationPhoto: aut.photo, modePaiement: mode, site
      });
      onFait({ r, f: { participants: parts, contactNom: contact.nom, contactTelephone: contact.telephone, contactEmail: contact.email, autorisationPhoto: aut.photo } });
    } catch (er) {
      setErreurGlobale(msgErreur(er));
    } finally {
      setOccupe(false);
    }
  }

  return html`<form class="page" style="gap:20px" onSubmit=${envoyer} noValidate>
    <section class="carte">
      <h2>1. Personne à contacter</h2>
      <p class="aide">Le parent ou tuteur légal si tu inscris un enfant, ou le participant lui-même s'il est majeur. Le parent n'a pas besoin d'être licencié.</p>
      <div class="grille grille-2">
        <div class="plein"><${Champ} id="c-nom" libelle="Nom et prénom" erreur=${erreurs.contactNom}>
          <input id="c-nom" type="text" autocomplete="name" value=${contact.nom} onInput=${(e) => setContact({ ...contact, nom: e.target.value })} />
        <//></div>
        <${Champ} id="c-tel" libelle="Téléphone" erreur=${erreurs.contactTelephone}>
          <input id="c-tel" type="tel" autocomplete="tel" value=${contact.telephone} onInput=${(e) => setContact({ ...contact, telephone: e.target.value })} />
        <//>
        <${Champ} id="c-mail" libelle="Adresse e-mail" erreur=${erreurs.contactEmail}>
          <input id="c-mail" type="email" autocomplete="email" value=${contact.email} onInput=${(e) => setContact({ ...contact, email: e.target.value })} />
        <//>
      </div>
    </section>

    <section class="carte">
      <h2>2. Participant${parts.length > 1 ? 's' : ''}</h2>
      ${parts.map((p, k) => {
        const er = erreurs['p' + p.cle] || {};
        return html`<div class="stage-ligne" key=${p.cle}>
          <div class="match-tete"><strong>Participant ${k + 1}</strong>
            ${parts.length > 1 && html`<button class="btn btn-secondaire" type="button" onClick=${() => setParts((l) => l.filter((x) => x.cle !== p.cle))}>Retirer</button>`}
          </div>
          <div class="grille grille-2" style="margin-top:10px">
            <${Champ} id=${'p-prenom-' + p.cle} libelle="Prénom" erreur=${er.prenom}>
              <input id=${'p-prenom-' + p.cle} type="text" autocomplete="off" value=${p.prenom} onInput=${(e) => majPart(p.cle, { prenom: e.target.value })} />
            <//>
            <${Champ} id=${'p-nom-' + p.cle} libelle="Nom" erreur=${er.nom}>
              <input id=${'p-nom-' + p.cle} type="text" autocomplete="off" value=${p.nom} onInput=${(e) => majPart(p.cle, { nom: e.target.value })} />
            <//>
            <${Champ} id=${'p-nais-' + p.cle} libelle="Date de naissance" erreur=${er.naissance}>
              <input id=${'p-nais-' + p.cle} type="date" value=${p.naissance} onInput=${(e) => majPart(p.cle, { naissance: e.target.value })} />
            <//>
            <${Champ} id=${'p-sexe-' + p.cle} libelle="Sexe" erreur=${er.sexe}>
              <select id=${'p-sexe-' + p.cle} value=${p.sexe} onChange=${(e) => majPart(p.cle, { sexe: e.target.value })}>
                <option value="">Choisir…</option>
                <option value="F">Fille / femme</option>
                <option value="M">Garçon / homme</option>
              </select>
            <//>
          </div>
        </div>`;
      })}
      ${parts.length < 8 && html`<button class="btn btn-secondaire" type="button" style="margin-top:10px" onClick=${() => setParts((l) => [...l, participantVide()])}>+ Ajouter un autre enfant</button>`}
    </section>

    <section class="carte">
      <h2>3. Stages</h2>
      <p class="aide">Coche tous les stages qui t'intéressent : ils s'appliquent à chaque participant. Tarif par participant et par stage, licence événementielle incluse.</p>
      ${stages.length === 0 ? html`<p class="vide">Aucun stage n'est ouvert aux inscriptions pour le moment.</p>` : html`<ul class="liste-comp">
        ${stages.map((s) => {
          const restantes = s.places_max - s.places_prises;
          const complet = restantes <= 0;
          return html`<li class="carte-comp" key=${s.id}>
            <div class="case">
              <input id=${'st-' + s.id} type="checkbox" checked=${choisis.has(s.id)} onChange=${() => basculer(s.id)} />
              <label for=${'st-' + s.id}><strong>${s.nom}</strong></label>
            </div>
            <p class="comp-date">${quand(s)}${s.lieu ? ' · ' + s.lieu : ''}</p>
            <p class="comp-infos">Licencié(e) FTTT : ${xpf(s.tarif_licencie)} · Non licencié(e) : ${xpf(s.tarif_non_licencie)}</p>
            ${complet ? html`<${Pastille} genre="alerte">Complet : liste d'attente<//>` : html`<${Pastille} genre="actif">${restantes} place${restantes > 1 ? 's' : ''} restante${restantes > 1 ? 's' : ''}<//>`}
          </li>`;
        })}</ul>`}
      ${erreurs.stages && html`<p class="erreur" role="alert">${erreurs.stages}</p>`}
    </section>

    <section class="carte">
      <h2>4. Autorisations et règlement</h2>
      ${unMineur && html`<div class=${'champ' + (erreurs.parentale ? ' champ-erreur' : '')}>
        <div class="case">
          <input id="a-par" type="checkbox" checked=${aut.parentale} onChange=${(e) => setAut({ ...aut, parentale: e.target.checked })} />
          <label for="a-par">J'autorise mon ou mes enfants à participer aux stages choisis (autorisation parentale).</label>
        </div>
        ${erreurs.parentale && html`<p class="erreur" role="alert">${erreurs.parentale}</p>`}
      </div>`}
      <div class="case">
        <input id="a-photo" type="checkbox" checked=${aut.photo} onChange=${(e) => setAut({ ...aut, photo: e.target.checked })} />
        <label for="a-photo">J'autorise la FTTT à prendre et à utiliser des photos et vidéos du stage (site, réseaux sociaux). Facultatif.</label>
      </div>
      <${Champ} id="a-mode" libelle="Mode de règlement" erreur=${erreurs.mode}>
        <select id="a-mode" value=${mode} onChange=${(e) => setMode(e.target.value)}>
          <option value="">Choisir…</option>
          <option value="sur_place">Sur place, le premier jour</option>
          <option value="virement">Par virement</option>
        </select>
      <//>
      <div style="position:absolute;left:-9999px" aria-hidden="true">
        <label for="a-site">Ne pas remplir</label>
        <input id="a-site" type="text" tabindex="-1" autocomplete="off" value=${site} onInput=${(e) => setSite(e.target.value)} />
      </div>
      <p class="aide">Le tarif licencié est appliqué automatiquement aux participants qui ont une licence FTTT cette saison. Un certificat médical d'aptitude sera à remettre le premier jour (sauf pour les licenciés). Les informations saisies servent uniquement à gérer les stages et ne sont visibles que de la fédération.</p>
    </section>

    ${erreurGlobale && html`<p class="erreur" role="alert">${erreurGlobale}</p>`}
    <div class="etiquettes">
      <button class="btn btn-primaire" type="submit" disabled=${occupe}>${occupe ? 'Envoi…' : 'Valider l\'inscription'}</button>
    </div>
  </form>`;
}

export function PageStages() {
  const [stages, setStages] = useState(null);
  const [erreur, setErreur] = useState('');
  const [resultat, setResultat] = useState(null);
  const idDirect = useMemo(() => lireRoute().query.stage || '', []);

  const charger = () => api.stagesPublics().then(setStages).catch((e) => setErreur(msgErreur(e)));
  useEffect(() => { charger(); }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [resultat]);
  const presel = useMemo(() => (stages && idDirect && stages.some((s) => s.id === idDirect) ? [idDirect] : []), [stages]);

  return html`<div class="page">
    <div class="page-tete"><div><h1>Stages</h1><p>Inscris un ou plusieurs enfants à un ou plusieurs stages, sans compte.</p></div></div>
    <${OngletsPublics} actif="stages" />
    ${resultat
      ? html`<${Confirmation} stages=${stages || []} r=${resultat.r} f=${resultat.f} onRetour=${() => { setResultat(null); charger(); }} />`
      : erreur ? html`<p class="erreur" role="alert">${erreur}</p>`
      : !stages ? html`<${Chargement} />`
      : html`${idDirect && presel.length === 0 && html`<p class="avis">Ce stage n'est plus ouvert aux inscriptions. Voici les stages disponibles.</p>`}
        <${Formulaire} key=${presel.join(',')} stages=${stages} preselection=${presel} onFait=${setResultat} />`}
  </div>`;
}
