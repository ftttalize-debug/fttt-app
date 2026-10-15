// « Mon profil » : fiche de licence, résultats et inscriptions de l'athlète, sans compte (prénom + nom + date de naissance).
import { html, useState, useEffect, useMemo } from '../preact.js';
import { api } from '../data.js';
import { fmtDate, fmtPts, msgErreur } from '../lib.js';
import { Champ, Pastille, Chargement } from '../ui.js';
import { OngletsPublics } from './public.js';
import { ListeMatchs, bilanHisto } from './joueur.js';
import { telechargerAttestation } from '../attestation-pdf.js';

const CLE = 'fttt-profil';
const TYPES = { simple: 'Simple', double: 'Double', equipe: 'Par équipes' };
const GENRES = { dames: 'Dames', messieurs: 'Messieurs', mixte: 'Mixte', uni: 'Uni' };
const LICENCES = { competition: 'Compétition', loisir: 'Loisir', dirigeant: 'Dirigeant' };
const MSG_INCONNU = 'Aucune fiche ne correspond. Vérifie l\'orthographe de ton prénom et de ton nom, ta date de naissance, ou utilise ton numéro de licence.';

export function lireSouvenir() {
  try { const v = JSON.parse(localStorage.getItem(CLE) || 'null'); return v && v.identifiant && v.naissance ? v : null; } catch (e) { return null; }
}
const ecrireSouvenir = (v) => { try { v ? localStorage.setItem(CLE, JSON.stringify(v)) : localStorage.removeItem(CLE); } catch (e) { /* stockage indisponible */ } };

function Inscriptions({ liste }) {
  const ligne = (c) => html`<li class="carte-comp" key=${c.id}>
    <div class="match-tete"><strong>${c.nom}</strong>${c.statut_competition === 'ouverte' && html`<${Pastille} genre="actif">Inscriptions ouvertes<//>`}</div>
    <p class="comp-date">${c.date_fin && c.date_fin !== c.date_debut ? `Du ${fmtDate(c.date_debut)} au ${fmtDate(c.date_fin)}` : fmtDate(c.date_debut)}${c.lieu ? ' · ' + c.lieu : ''}</p>
    <p class="comp-infos">${[TYPES[c.type] || c.type, GENRES[c.genre], c.categorie_max ? c.categorie_max + ' et moins' : null].filter(Boolean).join(' · ')}${c.nom_equipe ? ' · équipe ' + c.nom_equipe : ''}${c.partenaire ? ' · avec ' + c.partenaire : ''}</p>
  </li>`;
  const avenir = liste.filter((c) => c.a_venir).sort((a, b) => String(a.date_debut).localeCompare(String(b.date_debut)));
  const passees = liste.filter((c) => !c.a_venir);
  return html`<div>
    <h3>À venir</h3>
    ${avenir.length ? html`<ul class="liste-comp">${avenir.map(ligne)}</ul>` : html`<p class="vide">Aucune inscription à venir.</p>`}
    <h3>Passées</h3>
    ${passees.length ? html`<ul class="liste-comp">${passees.map(ligne)}</ul>` : html`<p class="vide">Aucune compétition passée.</p>`}
  </div>`;
}

export function PageMonProfil() {
  const souvenir = useMemo(lireSouvenir, []);
  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [numero, setNumero] = useState('');
  const [naissance, setNaissance] = useState('');
  const [retenir, setRetenir] = useState(false);
  const [profil, setProfil] = useState(null);
  const [erreur, setErreur] = useState('');
  const [occupe, setOccupe] = useState(!!souvenir);

  async function charger(identifiant, nais, memoriser) {
    setErreur(''); setOccupe(true);
    try {
      const r = await api.athleteProfil(identifiant, nais);
      if (r?.erreur) throw new Error(MSG_INCONNU);
      setProfil(r);
      if (memoriser) ecrireSouvenir({ identifiant, naissance: nais });
    } catch (err) { setErreur(msgErreur(err)); setProfil(null); if (souvenir) ecrireSouvenir(null); }
    setOccupe(false);
  }

  useEffect(() => { if (souvenir) charger(souvenir.identifiant, souvenir.naissance, true); }, []);

  function connecter(e) {
    e.preventDefault();
    const identifiant = numero.trim() ? numero.trim().toUpperCase() : `${prenom.trim()} ${nom.trim()}`;
    charger(identifiant, naissance, retenir);
  }
  function quitter() { ecrireSouvenir(null); setProfil(null); setPrenom(''); setNom(''); setNumero(''); setNaissance(''); setErreur(''); }
  async function attestation() {
    try { await telechargerAttestation(profil); } catch (err) { setErreur(msgErreur(err)); }
  }

  const bilan = useMemo(() => bilanHisto(profil?.resultats || []), [profil]);
  const enCours = !!profil?.licence?.en_cours;

  return html`<div class="page">
    <div class="page-tete"><div><h1>Mon profil</h1><p>Ma licence, mes résultats et mes inscriptions</p></div></div>
    <${OngletsPublics} actif="monprofil" />
    ${occupe && !profil && html`<${Chargement} texte="Vérification…" />`}
    ${!profil && !occupe && html`<form class="carte" id="form-profil" onSubmit=${connecter}>
      <p>Saisis ton prénom, ton nom et ta date de naissance. Tu peux aussi utiliser ton numéro de licence (par exemple FTTT-00123), utile en cas d'homonyme.</p>
      <${Champ} id="p-prenom" libelle="Prénom"><input id="p-prenom" autocomplete="given-name" value=${prenom} onInput=${(e) => setPrenom(e.target.value)} required=${!numero.trim()} /><//>
      <${Champ} id="p-nom" libelle="Nom"><input id="p-nom" autocomplete="family-name" value=${nom} onInput=${(e) => setNom(e.target.value)} required=${!numero.trim()} /><//>
      <${Champ} id="p-nais" libelle="Date de naissance"><input id="p-nais" type="date" value=${naissance} onInput=${(e) => setNaissance(e.target.value)} required /><//>
      <${Champ} id="p-num" libelle="Numéro de licence (facultatif)" aide="Si tu le remplis, il remplace le prénom et le nom.">
        <input id="p-num" autocomplete="off" autocapitalize="characters" placeholder="FTTT-00123" value=${numero} onInput=${(e) => setNumero(e.target.value)} /><//>
      <div class="case"><input id="p-retenir" type="checkbox" checked=${retenir} onChange=${(e) => setRetenir(e.target.checked)} /><label for="p-retenir">Se souvenir sur cet appareil (à éviter sur un appareil partagé)</label></div>
      ${erreur && html`<p class="erreur" role="alert">${erreur}</p>`}
      <button class="btn btn-primaire" type="submit" disabled=${occupe}>${occupe ? 'Vérification…' : 'Voir mon profil'}</button>
    </form>`}
    ${profil && html`<div>
      <section class="carte" id="fiche-licence" aria-label="Fiche de licence">
        <div class="match-tete"><h2>${profil.prenom} ${profil.nom}</h2>
          <${Pastille} genre=${enCours ? 'actif' : 'archive'}>${enCours ? 'Licence active ' + profil.licence.saison : 'Licence non active'}<//></div>
        <dl class="fiche-liste">
          <div><dt>N° de licence</dt><dd id="pf-numero">${profil.numero}</dd></div>
          <div><dt>Date de naissance</dt><dd>${fmtDate(profil.naissance)}</dd></div>
          <div><dt>Club</dt><dd>${profil.club || 'Sans club'}</dd></div>
          <div><dt>Catégorie</dt><dd>${profil.categorie}</dd></div>
          ${profil.licence && html`<div><dt>Licence</dt><dd>${LICENCES[profil.licence.type] || profil.licence.type} · ${profil.licence.saison}</dd></div>`}
          <div><dt>Classement</dt><dd>${profil.rang ? profil.rang + 'e · ' : ''}${fmtPts(profil.points)} points</dd></div>
        </dl>
        ${erreur && html`<p class="erreur" role="alert">${erreur}</p>`}
        <div class="etiquettes">
          ${enCours && html`<button class="btn btn-primaire" type="button" id="btn-attestation" onClick=${attestation}>Télécharger mon attestation (PDF)</button>`}
          <a class="btn btn-secondaire" href=${'#/sinscrire'}>M'inscrire à une compétition</a>
          <button class="btn btn-secondaire" type="button" onClick=${quitter}>${souvenir ? 'Me déconnecter' : 'Ce n\'est pas moi / Quitter'}</button>
        </div>
        ${!enCours && html`<p class="aide">L'attestation n'est disponible que pour une licence active sur la saison en cours.</p>`}
      </section>
      <h2>Mes derniers résultats</h2>
      ${profil.resultats.length > 0 && html`<p class="aide">${bilan.v} victoire(s) · ${bilan.d} défaite(s) sur les matchs affichés.</p>`}
      <${ListeMatchs} histo=${profil.resultats} />
      <h2>Mes inscriptions</h2>
      <${Inscriptions} liste=${profil.inscriptions} />
    </div>`}
  </div>`;
}
