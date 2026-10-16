// Gestion des stages (cadre fédéral) : création, inscrits, liste d'attente, paiements, facture acquittée.
import { html, useState, useEffect, useMemo } from '../preact.js';
import { api } from '../data.js';
import { fmtDate, msgErreur, telechargerCsv, ageExact } from '../lib.js';
import { Pastille, Champ, Chargement, toast } from '../ui.js';
import { telechargerFactureStage } from '../facture-stage-pdf.js';
import { telechargerFiche, telechargerFiches } from '../fiche-stage-pdf.js';

const xpf = (n) => `${Number(n || 0).toLocaleString('fr-FR')} XPF`;
const quand = (s) => (s.date_fin && s.date_fin !== s.date_debut ? `Du ${fmtDate(s.date_debut)} au ${fmtDate(s.date_fin)}` : fmtDate(s.date_debut));
const STATUTS = { brouillon: 'Brouillon (non visible)', ouvert: 'Ouvert aux inscriptions', clos: 'Clos' };
const MODES = { sur_place: 'sur place', virement: 'virement' };

function FormStage({ stage, onFait, onAnnuler }) {
  const [f, setF] = useState(stage ? {
    nom: stage.nom, date_debut: stage.date_debut, date_fin: stage.date_fin, lieu: stage.lieu || '',
    tarif_licencie: String(stage.tarif_licencie), tarif_non_licencie: String(stage.tarif_non_licencie),
    places_max: String(stage.places_max), statut: stage.statut
  } : { nom: '', date_debut: '', date_fin: '', lieu: '', tarif_licencie: '8000', tarif_non_licencie: '9000', places_max: '45', statut: 'ouvert' });
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  const maj = (p) => setF((x) => ({ ...x, ...p }));

  async function enregistrer(e) {
    e.preventDefault();
    const entier = (v) => (/^\d+$/.test(String(v).trim()) ? parseInt(v, 10) : NaN);
    const v = {
      nom: f.nom.trim(), date_debut: f.date_debut, date_fin: f.date_fin || f.date_debut, lieu: f.lieu.trim() || null,
      tarif_licencie: entier(f.tarif_licencie), tarif_non_licencie: entier(f.tarif_non_licencie), places_max: entier(f.places_max), statut: f.statut
    };
    if (!v.nom || !v.date_debut) return setErreur('Le nom et la date de début sont obligatoires.');
    if (v.date_fin < v.date_debut) return setErreur('La date de fin est avant la date de début.');
    if ([v.tarif_licencie, v.tarif_non_licencie].some(Number.isNaN)) return setErreur('Les tarifs doivent être des nombres entiers (XPF).');
    if (Number.isNaN(v.places_max) || v.places_max < 1) return setErreur('Le nombre de places doit être au moins 1.');
    setOccupe(true);
    setErreur('');
    try {
      const r = stage ? (await api.majStage(stage.id, v))[0] : await api.creerStage(v);
      toast(stage ? 'Stage modifié.' : 'Stage créé.');
      onFait(r);
    } catch (er) { setErreur(msgErreur(er)); } finally { setOccupe(false); }
  }

  return html`<form class="carte" onSubmit=${enregistrer} noValidate>
    <h2>${stage ? 'Modifier le stage' : 'Nouveau stage'}</h2>
    <div class="grille grille-2">
      <div class="plein"><${Champ} id="g-nom" libelle="Nom du stage"><input id="g-nom" type="text" value=${f.nom} onInput=${(e) => maj({ nom: e.target.value })} /><//></div>
      <${Champ} id="g-debut" libelle="Début"><input id="g-debut" type="date" value=${f.date_debut} onInput=${(e) => maj({ date_debut: e.target.value })} /><//>
      <${Champ} id="g-fin" libelle="Fin"><input id="g-fin" type="date" value=${f.date_fin} onInput=${(e) => maj({ date_fin: e.target.value })} /><//>
      <div class="plein"><${Champ} id="g-lieu" libelle="Lieu"><input id="g-lieu" type="text" value=${f.lieu} onInput=${(e) => maj({ lieu: e.target.value })} /><//></div>
      <${Champ} id="g-tl" libelle="Tarif licencié (XPF)"><input id="g-tl" inputmode="numeric" value=${f.tarif_licencie} onInput=${(e) => maj({ tarif_licencie: e.target.value })} /><//>
      <${Champ} id="g-tn" libelle="Tarif non licencié (XPF)"><input id="g-tn" inputmode="numeric" value=${f.tarif_non_licencie} onInput=${(e) => maj({ tarif_non_licencie: e.target.value })} /><//>
      <${Champ} id="g-places" libelle="Nombre de places"><input id="g-places" inputmode="numeric" value=${f.places_max} onInput=${(e) => maj({ places_max: e.target.value })} /><//>
      <${Champ} id="g-statut" libelle="Statut" aide="Seuls les stages « ouverts » apparaissent sur la page publique.">
        <select id="g-statut" value=${f.statut} onChange=${(e) => maj({ statut: e.target.value })}>
          ${Object.entries(STATUTS).map(([k, v]) => html`<option key=${k} value=${k}>${v}</option>`)}
        </select>
      <//>
    </div>
    ${erreur && html`<p class="erreur" role="alert">${erreur}</p>`}
    <div class="etiquettes" style="margin-top:14px">
      <button class="btn btn-primaire" type="submit" disabled=${occupe}>Enregistrer</button>
      <button class="btn btn-secondaire" type="button" disabled=${occupe} onClick=${onAnnuler}>Annuler</button>
    </div>
  </form>`;
}

// Fiche d'une personne : tous ses stages confirmés, regroupés par clé (prénom+nom+naissance)
function fichePour(i, data) {
  const siens = data.inscriptions.filter((x) => x.cle === i.cle && x.statut === 'inscrit');
  const lignes = siens.length ? siens : [i];
  const stages = lignes.map((x) => data.stages.find((s) => s.id === x.stage_id)).filter(Boolean).sort((a, b) => (a.date_debut < b.date_debut ? -1 : 1));
  return { stages, certificat: lignes.some((x) => x.tarif === 'non_licencie'), inscription: i };
}

function LigneInscrit({ i, stage, ctx, data, agir }) {
  const [occupe, setOccupe] = useState(false);
  async function lancer(fn, message) {
    setOccupe(true);
    try { await fn(); await agir(); if (message) toast(message); } catch (e) { toast(msgErreur(e), 'erreur'); } finally { setOccupe(false); }
  }
  async function pdf() {
    setOccupe(true);
    try { await telechargerFactureStage({ stage, inscription: i, federation: ctx.federation }); }
    catch (e) { toast(msgErreur(e), 'erreur'); } finally { setOccupe(false); }
  }
  async function fiche() {
    setOccupe(true);
    try { await telechargerFiche(fichePour(i, data)); } catch (e) { toast(msgErreur(e), 'erreur'); } finally { setOccupe(false); }
  }
  const age = ageExact(i.date_naissance);
  // La fiche et le certificat concernent la personne : on les met à jour pour tous ses stages d'un coup
  const groupe = data.inscriptions.filter((x) => x.cle === i.cle && x.statut === 'inscrit').map((x) => x.id);
  return html`<li class=${'stage-ligne' + (i.statut === 'attente' ? ' attente' : '') + (i.statut === 'annule' ? ' annule' : '')}>
    <div class="match-tete"><strong>${i.prenom} ${i.nom}</strong>
      <span class="etiquettes">
        <${Pastille} genre="neutre">${age} ans<//>
        ${i.statut === 'inscrit' && (i.paye ? html`<${Pastille} genre="actif">Payé · ${MODES[i.mode_paiement] || ''}<//>` : html`<${Pastille} genre="alerte">À payer<//>`)}
        ${i.statut === 'attente' && html`<${Pastille} genre="alerte">Liste d'attente<//>`}
        ${i.statut === 'inscrit' && (i.fiche_recue ? html`<${Pastille} genre="actif">Fiche signée reçue<//>` : html`<${Pastille} genre="alerte">Fiche à recevoir<//>`)}
        ${i.statut === 'inscrit' && i.tarif === 'non_licencie' && (i.certificat_recu ? html`<${Pastille} genre="actif">Certificat reçu<//>` : html`<${Pastille} genre="alerte">Certificat à recevoir<//>`)}
      </span>
    </div>
    <p class="comp-infos">${xpf(i.montant_xpf)} (${i.tarif === 'licencie' ? 'licencié' : 'non licencié'}) · règlement prévu ${MODES[i.mode_paiement] || '—'}${i.numero_facture ? ' · ' + i.numero_facture : ''}</p>
    <p class="stage-contact">${[i.telephone, i.email].filter(Boolean).join(' · ') || ''}</p>
    ${i.mineur && html`<p class="stage-contact">Parent / tuteur : ${i.representant_nom}${i.representant_telephone ? ' · ' + i.representant_telephone : ''}${i.representant_email ? ' · ' + i.representant_email : ''}</p>`}
    <p class="stage-contact">${i.mineur ? (i.autorisation_parentale ? 'Autorisation parentale : oui' : 'Autorisation parentale : non') + ' · ' : ''}Photos : ${i.autorisation_photo ? 'oui' : 'non'}</p>
    <div class="etiquettes">
      ${i.statut === 'attente' && html`<button class="btn btn-primaire" type="button" disabled=${occupe} onClick=${() => lancer(() => api.stageChangerStatut(i.id, 'inscrit'), 'Inscription confirmée.')}>Valider l'inscription</button>`}
      ${i.statut !== 'annule' && html`<button class="btn btn-secondaire" type="button" disabled=${occupe} onClick=${fiche}>Fiche d'inscription (PDF)</button>`}
      ${i.statut === 'inscrit' && html`<button class="btn btn-secondaire" type="button" disabled=${occupe} onClick=${() => lancer(() => api.majInscriptionsStage(groupe, { fiche_recue: !i.fiche_recue }), i.fiche_recue ? 'Fiche marquée non reçue.' : 'Fiche signée reçue.')}>${i.fiche_recue ? 'Fiche non reçue' : 'Fiche signée reçue'}</button>`}
      ${i.statut === 'inscrit' && i.tarif === 'non_licencie' && html`<button class="btn btn-secondaire" type="button" disabled=${occupe} onClick=${() => lancer(() => api.majInscriptionsStage(groupe, { certificat_recu: !i.certificat_recu }), i.certificat_recu ? 'Certificat marqué non reçu.' : 'Certificat médical reçu.')}>${i.certificat_recu ? 'Certificat non reçu' : 'Certificat reçu'}</button>`}
      ${i.statut === 'inscrit' && !i.paye && html`<button class="btn btn-primaire" type="button" disabled=${occupe} onClick=${() => lancer(() => api.stageMarquerPaye(i.id, true, 'sur_place'), 'Paiement enregistré.')}>Payé sur place</button>`}
      ${i.statut === 'inscrit' && !i.paye && html`<button class="btn btn-secondaire" type="button" disabled=${occupe} onClick=${() => lancer(() => api.stageMarquerPaye(i.id, true, 'virement'), 'Paiement enregistré.')}>Payé par virement</button>`}
      ${i.statut === 'inscrit' && i.paye && html`<button class="btn btn-primaire" type="button" disabled=${occupe} onClick=${pdf}>Facture acquittée (PDF)</button>`}
      ${i.statut === 'inscrit' && i.paye && html`<button class="btn btn-secondaire" type="button" disabled=${occupe} onClick=${() => lancer(() => api.stageMarquerPaye(i.id, false), 'Paiement annulé.')}>Annuler le paiement</button>`}
      ${i.statut !== 'annule' && html`<button class="btn btn-secondaire" type="button" disabled=${occupe} onClick=${() => { if (confirm(`Annuler l'inscription de ${i.prenom} ${i.nom} ?`)) lancer(() => api.stageChangerStatut(i.id, 'annule'), 'Inscription annulée.'); }}>Annuler l'inscription</button>`}
      ${i.statut === 'annule' && html`<button class="btn btn-secondaire" type="button" disabled=${occupe} onClick=${() => lancer(() => api.stageChangerStatut(i.id, 'attente'), 'Remise en liste d\'attente.')}>Remettre en liste d'attente</button>`}
    </div>
  </li>`;
}

function Detail({ stage, inscriptions, ctx, data, recharger, onRetour, onModifier }) {
  const inscrits = inscriptions.filter((i) => i.statut === 'inscrit');
  const attente = inscriptions.filter((i) => i.statut === 'attente');
  const annules = inscriptions.filter((i) => i.statut === 'annule');
  const payes = inscrits.filter((i) => i.paye);
  const encaisse = payes.reduce((n, i) => n + i.montant_xpf, 0);

  async function toutesLesFiches() {
    try {
      const vus = new Set();
      const fiches = [];
      for (const i of inscrits) { if (vus.has(i.cle)) continue; vus.add(i.cle); fiches.push(fichePour(i, data)); }
      await telechargerFiches(fiches, stage.nom);
    } catch (e) { toast(msgErreur(e), 'erreur'); }
  }
  const lienStage = `${location.origin}${location.pathname}#/stages?stage=${stage.id}`;
  async function copierLien() {
    try { await navigator.clipboard.writeText(lienStage); toast('Lien copié : colle-le dans ta publication Facebook.'); }
    catch { window.prompt('Copie ce lien :', lienStage); }
  }
  function exporter() {
    telechargerCsv(`stage-${stage.nom.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`,
      ['Statut', 'Nom', 'Prénom', 'Date de naissance', 'Sexe', 'Téléphone', 'E-mail', 'Parent / tuteur', 'Tél. parent', 'E-mail parent', 'Autorisation parentale', 'Photos', 'Fiche signée reçue', 'Certificat reçu', 'Tarif', 'Montant XPF', 'Règlement prévu', 'Payé', 'Date paiement', 'N° facture'],
      inscriptions.map((i) => [i.statut, i.nom, i.prenom, i.date_naissance, i.sexe, i.telephone, i.email, i.representant_nom, i.representant_telephone, i.representant_email,
        i.autorisation_parentale ? 'oui' : 'non', i.autorisation_photo ? 'oui' : 'non', i.fiche_recue ? 'oui' : 'non', i.tarif === 'non_licencie' ? (i.certificat_recu ? 'oui' : 'non') : 'licencié', i.tarif, i.montant_xpf, i.mode_paiement, i.paye ? 'oui' : 'non', i.date_paiement, i.numero_facture]));
  }
  const liste = (titre, l) => l.length > 0 && html`<h2>${titre} (${l.length})</h2><ul class="liste-comp">${l.map((i) => html`<${LigneInscrit} key=${i.id} i=${i} stage=${stage} ctx=${ctx} data=${data} agir=${recharger} />`)}</ul>`;

  return html`<div>
    <button class="btn btn-secondaire" type="button" onClick=${onRetour}>← Tous les stages</button>
    <section class="carte" style="margin-top:12px">
      <div class="match-tete"><h2 style="margin:0">${stage.nom}</h2><${Pastille} genre=${stage.statut === 'ouvert' ? 'actif' : 'neutre'}>${STATUTS[stage.statut]}<//></div>
      <p class="comp-date">${quand(stage)}${stage.lieu ? ' · ' + stage.lieu : ''}</p>
      <p class="comp-infos">Licencié ${xpf(stage.tarif_licencie)} · Non licencié ${xpf(stage.tarif_non_licencie)}</p>
      <p><strong>${inscrits.length} / ${stage.places_max}</strong> inscrits · ${attente.length} en attente · ${payes.length} payé${payes.length > 1 ? 's' : ''} (${xpf(encaisse)} encaissés) · ${inscrits.filter((i) => i.fiche_recue).length} fiche${inscrits.filter((i) => i.fiche_recue).length > 1 ? 's' : ''} signée${inscrits.filter((i) => i.fiche_recue).length > 1 ? 's' : ''} reçue${inscrits.filter((i) => i.fiche_recue).length > 1 ? 's' : ''}</p>
      ${stage.statut === 'ouvert' && html`<p class="aide">Lien direct à publier sur Facebook : ${lienStage}</p>`}
      <div class="etiquettes">
        <button class="btn btn-secondaire" type="button" onClick=${onModifier}>Modifier le stage</button>
        <button class="btn btn-secondaire" type="button" disabled=${inscriptions.length === 0} onClick=${exporter}>Exporter (CSV)</button>
        <button class="btn btn-secondaire" type="button" disabled=${inscrits.length === 0} onClick=${toutesLesFiches}>Toutes les fiches à signer (PDF)</button>
        <button class="btn btn-secondaire" type="button" onClick=${copierLien}>Copier le lien d'inscription</button>
      </div>
    </section>
    ${inscriptions.length === 0 && html`<p class="vide">Aucune inscription pour le moment.</p>`}
    ${liste('Inscrits', inscrits)}
    ${liste('Liste d\'attente', attente)}
    ${liste('Annulés', annules)}
  </div>`;
}

export function PageGestionStages({ ctx }) {
  const [data, setData] = useState(null);
  const [erreur, setErreur] = useState('');
  const [sel, setSel] = useState(null);
  const [form, setForm] = useState(null); // null | 'nouveau' | 'modifier'

  const recharger = () => api.stagesCadre().then(setData).catch((e) => setErreur(msgErreur(e)));
  useEffect(() => { recharger(); }, []);
  const stage = data && sel ? data.stages.find((s) => s.id === sel) : null;
  const parStage = useMemo(() => {
    const m = new Map();
    for (const i of data?.inscriptions || []) { if (!m.has(i.stage_id)) m.set(i.stage_id, []); m.get(i.stage_id).push(i); }
    return m;
  }, [data]);

  let contenu;
  if (erreur) contenu = html`<p class="erreur" role="alert">${erreur}</p>`;
  else if (!data) contenu = html`<${Chargement} />`;
  else if (form) {
    contenu = html`<${FormStage} stage=${form === 'modifier' ? stage : null} onAnnuler=${() => setForm(null)}
      onFait=${async (r) => { await recharger(); setSel(r.id); setForm(null); }} />`;
  } else if (stage) {
    contenu = html`<${Detail} stage=${stage} inscriptions=${parStage.get(stage.id) || []} ctx=${ctx} data=${data} recharger=${recharger}
      onRetour=${() => setSel(null)} onModifier=${() => setForm('modifier')} />`;
  } else {
    contenu = html`<div>
      <button class="btn btn-primaire" type="button" onClick=${() => setForm('nouveau')}>Nouveau stage</button>
      ${data.stages.length === 0 ? html`<p class="vide" style="margin-top:12px">Aucun stage. Crée le premier.</p>` : html`<ul class="liste-comp" style="margin-top:12px">
        ${[...data.stages].sort((a, b) => (a.date_debut < b.date_debut ? -1 : 1)).map((s) => {
          const l = parStage.get(s.id) || [];
          const n = l.filter((i) => i.statut === 'inscrit').length;
          const w = l.filter((i) => i.statut === 'attente').length;
          return html`<li class="carte-comp" key=${s.id}>
            <div class="match-tete"><strong>${s.nom}</strong><${Pastille} genre=${s.statut === 'ouvert' ? 'actif' : 'neutre'}>${STATUTS[s.statut]}<//></div>
            <p class="comp-date">${quand(s)}${s.lieu ? ' · ' + s.lieu : ''}</p>
            <p class="comp-infos">${n} / ${s.places_max} inscrits${w ? ` · ${w} en attente` : ''}</p>
            <button class="btn btn-secondaire" type="button" onClick=${() => setSel(s.id)}>Ouvrir</button>
          </li>`;
        })}</ul>`}
    </div>`;
  }
  return html`<div class="page">
    <div class="page-tete"><div><h1>Stages</h1><p>Inscriptions de l'extérieur, liste d'attente et paiements</p></div></div>
    ${contenu}
  </div>`;
}
