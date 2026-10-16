// « Mon profil » : fiche de licence, résultats et inscriptions de l'athlète, sans compte (prénom + nom + date de naissance).
import { html, useState, useEffect, useMemo } from '../preact.js';
import { api } from '../data.js';
import { fmtDate, fmtPts, fmtVariation, msgErreur, lien } from '../lib.js';
import { Champ, Pastille, Chargement, Pliable } from '../ui.js';
import { OngletsPublics } from './public.js';
import { ListeMatchs, ResultatsParCompetition, bilanHisto } from './joueur.js';
import { telechargerAttestation } from '../attestation-pdf.js';
import { lireIdentite, ecrireIdentite, effacerIdentite } from '../identite.js';

const TYPES = { simple: 'Simple', double: 'Double', equipe: 'Par équipes' };
const GENRES = { dames: 'Dames', messieurs: 'Messieurs', mixte: 'Mixte', uni: 'Uni' };
const LICENCES = { competition: 'Compétition', loisir: 'Loisir', dirigeant: 'Dirigeant' };
const MSG_INCONNU = 'Aucune fiche ne correspond. Vérifie l\'orthographe de ton prénom et de ton nom, ta date de naissance, ou utilise ton numéro de licence.';

const PAS = 5;

/** Affiche les 5 premiers éléments, puis « Voir plus » (+10 à chaque appui). */
function Pagine({ items, rendu, vide }) {
  const [n, setN] = useState(PAS);
  if (!items.length) return html`<p class="vide">${vide}</p>`;
  return html`<div>${rendu(items.slice(0, n))}
    ${items.length > n && html`<p><button class="btn btn-secondaire" type="button" onClick=${() => setN(n + 10)}>Voir plus (${items.length - n})</button></p>`}</div>`;
}

function LigneInscription({ c, resultats, ouvrable }) {
  const [ouvert, setOuvert] = useState(false);
  const matchs = useMemo(() => resultats.filter((r) => r.competition_id === c.id), [resultats, c.id]);
  return html`<li class="carte-comp" key=${c.id}>
    <div class="match-tete"><strong>${c.nom}</strong>${c.statut_competition === 'ouverte' && html`<${Pastille} genre="actif">Inscriptions ouvertes<//>`}</div>
    <p class="comp-date">${c.date_fin && c.date_fin !== c.date_debut ? `Du ${fmtDate(c.date_debut)} au ${fmtDate(c.date_fin)}` : fmtDate(c.date_debut)}${c.lieu ? ' · ' + c.lieu : ''}</p>
    <p class="comp-infos">${[TYPES[c.type] || c.type, GENRES[c.genre], c.categorie_max ? c.categorie_max + ' et moins' : null].filter(Boolean).join(' · ')}${c.nom_equipe ? ' · équipe ' + c.nom_equipe : ''}${c.partenaire ? ' · avec ' + c.partenaire : ''}</p>
    ${ouvrable && html`<button class="btn btn-secondaire" type="button" aria-expanded=${ouvert} onClick=${() => setOuvert(!ouvert)}>${ouvert ? 'Masquer mes matchs' : 'Voir mes matchs'}</button>`}
    ${ouvrable && ouvert && html`<div class="matchs-comp">${matchs.length
      ? html`<${ListeMatchs} histo=${matchs} />`
      : html`<p class="vide">Aucun match validé pour cette compétition.</p>`}</div>`}
  </li>`;
}

const periode = (c) => (c.date_fin && c.date_fin !== c.date_debut ? `Du ${fmtDate(c.date_debut)} au ${fmtDate(c.date_fin)}` : fmtDate(c.date_debut));
const detailsTableau = (c) => [TYPES[c.type] || c.type, GENRES[c.genre], c.categorie_max ? c.categorie_max + ' et moins' : null].filter(Boolean).join(' · ')
  + (c.nom_equipe ? ' · équipe ' + c.nom_equipe : '') + (c.partenaire ? ' · avec ' + c.partenaire : '');

/** Regroupe les tableaux d'un même événement : titre = partie commune avant « – », libellé du tableau = le reste. */
function groupesEvenements(liste) {
  const m = new Map();
  liste.forEach((c) => {
    const cle = c.evenement_id || c.id;
    if (!m.has(cle)) m.set(cle, { cle, tableaux: [] });
    m.get(cle).tableaux.push(c);
  });
  return [...m.values()].map((g) => {
    const multi = g.tableaux.length > 1;
    const base = (n) => String(n).split(/\s[–-]\s/)[0];
    return { ...g, multi, titre: multi ? base(g.tableaux[0].nom) : g.tableaux[0].nom,
      debut: g.tableaux.map((c) => c.date_debut).sort()[0], fin: g.tableaux.map((c) => c.date_fin || c.date_debut).sort().slice(-1)[0],
      lieu: g.tableaux[0].lieu, ouverte: g.tableaux.some((c) => c.statut_competition === 'ouverte'),
      tableaux: g.tableaux.map((c) => ({ ...c, libelle: multi ? (String(c.nom).split(/\s[–-]\s/).slice(1).join(' – ') || c.nom) : null })) };
  });
}

/** Une compétition à venir : menu déroulant avec mes tableaux et, pour les compétitions par équipes, les journées restantes. */
function CompetitionAVenir({ g }) {
  const nbJournees = g.tableaux.reduce((t, c) => t + (c.journees || []).length, 0);
  const sous = [periode({ date_debut: g.debut, date_fin: g.fin }), g.lieu,
    g.multi ? `${g.tableaux.length} tableaux` : null, nbJournees ? `${nbJournees} journée${nbJournees > 1 ? 's' : ''} à venir` : null].filter(Boolean).join(' · ');
  return html`<${Pliable} petit=${true} titre=${g.titre} sous=${sous}
    resume=${g.ouverte ? html`<${Pastille} genre="actif">Ouverte<//>` : null}>
    <ul class="tableaux-inscrit">${g.tableaux.map((c) => html`<li key=${c.id}>
      ${c.libelle && html`<strong>${c.libelle}</strong>`}
      <p class="comp-infos">${detailsTableau(c)}</p>
      ${(c.journees || []).length > 0 && html`<div class="journees-restantes"><span class="aide">Journées à venir</span>
        <ul>${c.journees.map((j) => html`<li key=${j.nom}><strong>${j.nom}</strong> · ${fmtDate(j.date)}</li>`)}</ul></div>`}
    </li>`)}</ul>
  <//>`;
}

function Inscriptions({ liste, resultats }) {
  const avenir = groupesEvenements(liste.filter((c) => c.a_venir)).sort((a, b) => String(a.debut).localeCompare(String(b.debut)));
  const passees = liste.filter((c) => !c.a_venir).sort((a, b) => String(b.date_debut).localeCompare(String(a.date_debut)));
  return html`<div>
    <h3>À venir</h3>
    ${avenir.length === 0 ? html`<p class="vide">Aucune inscription à venir.</p>` : html`<div class="resultats-comp">${avenir.map((g) => html`<${CompetitionAVenir} key=${g.cle} g=${g} />`)}</div>`}
    <h3>Passées</h3>
    <${Pagine} items=${passees} vide="Aucune compétition passée." rendu=${(l) => html`<ul class="liste-comp">${l.map((c) => html`<${LigneInscription} key=${c.id} c=${c} resultats=${resultats} ouvrable=${false} />`)}</ul>`} />
  </div>`;
}

/** Fiche, résultats et inscriptions d'un athlète (profil public sans compte, ou « Mon profil » d'un compte connecté). */
function VueProfil({ profil, onQuitter, avant = null }) {
  const [erreur, setErreur] = useState('');
  const bilan = useMemo(() => bilanHisto(profil?.resultats || []), [profil]);
  const enCours = !!profil?.licence?.en_cours;
  async function attestation() {
    try { await telechargerAttestation(profil); } catch (err) { setErreur(msgErreur(err)); }
  }
    return html`<div>
      ${avant}
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
          ${onQuitter && html`<button class="btn btn-secondaire" type="button" onClick=${onQuitter}>Ce n'est pas moi / Me déconnecter</button>`}
        </div>
        ${!enCours && html`<p class="aide">L'attestation n'est disponible que pour une licence active sur la saison en cours.</p>`}
      </section>
      <h2>Mes résultats</h2>
      ${profil.resultats.length > 0 && html`<p class="aide">${bilan.v} victoire(s) · ${bilan.d} défaite(s) · ${fmtVariation(bilan.points)} pts au total.</p>`}
      <${ResultatsParCompetition} histo=${profil.resultats} />
      <h2>Mes inscriptions</h2>
      <${Inscriptions} liste=${profil.inscriptions} resultats=${profil.resultats} />
    </div>`;
}

export function PageMonProfil() {
  const souvenir = useMemo(lireIdentite, []);
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
      ecrireIdentite({ identifiant, naissance: nais }, memoriser);
    } catch (err) { setErreur(msgErreur(err)); setProfil(null); if (souvenir) effacerIdentite(); }
    setOccupe(false);
  }

  useEffect(() => { if (souvenir) charger(souvenir.identifiant, souvenir.naissance, souvenir.durable); }, []);

  function connecter(e) {
    e.preventDefault();
    const identifiant = numero.trim() ? numero.trim().toUpperCase() : `${prenom.trim()} ${nom.trim()}`;
    charger(identifiant, naissance, retenir);
  }
  function quitter() { effacerIdentite(); setProfil(null); setPrenom(''); setNom(''); setNumero(''); setNaissance(''); setErreur(''); }

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
    ${profil && html`<${VueProfil} profil=${profil} onQuitter=${quitter} />`}
  </div>`;
}

const LIBELLE_ROLE = { cadre_federal: 'Cadre fédéral', responsable_club: 'Responsable de club', juge_arbitre: 'Juge-arbitre' };

/** « Mon profil » d'un compte connecté : rôle(s), fiche sportive, résultats et inscriptions. */
export function PageMonEspace({ ctx }) {
  const moi = ctx.moi;
  const [profil, setProfil] = useState(null);
  const [erreur, setErreur] = useState('');
  useEffect(() => {
    setProfil(null); setErreur('');
    api.athleteProfil(moi.numero_licence, moi.date_naissance)
      .then((r) => { if (r?.erreur) throw new Error(r.erreur); setProfil(r); })
      .catch((e) => setErreur(msgErreur(e)));
  }, [moi.id]);
  const clubsResp = ctx.clubsResponsable.map((id) => ctx.clubParId.get(id)).filter(Boolean);
  const mesComps = ctx.juges.filter((j) => j.licencie_id === moi.id).map((j) => ctx.competitionParId.get(j.competition_id)).filter(Boolean)
    .sort((a, b) => String(b.date_debut).localeCompare(String(a.date_debut)));
  const roles = html`<section class="carte" aria-label="Mes rôles">
    <h2>Mes rôles</h2>
    <div class="etiquettes">
      ${ctx.estCadre && html`<${Pastille} genre="actif">${LIBELLE_ROLE.cadre_federal}<//>`}
      ${clubsResp.map((c) => html`<${Pastille} key=${c.id} genre="actif">Responsable de club · ${c.nom}<//>`)}
      ${ctx.estJuge && html`<${Pastille} genre="actif">${LIBELLE_ROLE.juge_arbitre}<//>`}
      ${!ctx.estCadre && !ctx.estResponsable && !ctx.estJuge && html`<${Pastille}>Licencié<//>`}
    </div>
    ${ctx.estCadre && html`<p class="aide">Tu gères les licenciés, les clubs, les compétitions et le classement de la fédération.</p>`}
    ${clubsResp.length > 0 && html`<p class="aide">Tu inscris les athlètes de ${clubsResp.map((c) => c.nom).join(', ')} aux compétitions ouvertes et suis leurs factures. ${clubsResp.map((c) => html`<a key=${c.id} href=${lien(['clubs', c.id])}>Voir ${c.nom}</a> `)}</p>`}
    ${mesComps.length > 0 && html`<div><p class="aide">Compétitions dont tu es juge-arbitre :</p>
      <ul class="liste-simple">${mesComps.slice(0, 8).map((c) => html`<li key=${c.id}><a href=${lien(['competitions', c.id])}>${c.nom}</a> · ${fmtDate(c.date_debut)}</li>`)}</ul></div>`}
  </section>`;
  if (erreur) return html`<div class="page"><p class="erreur" role="alert">${erreur}</p></div>`;
  return html`<div class="page">
    <div class="page-tete"><div><h1>Mon profil</h1><p>Mon rôle, mon classement et mes résultats</p></div></div>
    ${profil ? html`<${VueProfil} profil=${profil} avant=${roles} />` : html`<div>${roles}<${Chargement} /></div>`}
  </div>`;
}
