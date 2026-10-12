// Fiche d'un licencié (consultation, modification, licence de la saison, historique)
// et création d'un nouveau licencié.
import { html, useState, useEffect, useMemo } from '../preact.js';
import { api } from '../data.js';
import {
  lien, naviguer, norm, fmtPts, fmtDate, nomComplet, estMineur, emailValide, aujourdhuiISO, msgErreur,
  parseDate, TYPES_LICENCE, TYPES_CERTIFICAT
} from '../lib.js';
import { Icone, Pastille, Champ, Dialogue, ChoixPersonne, toast } from '../ui.js';
import { HistoriqueMatchs } from './matchs.js';
import { etatCompte } from './comptes.js';

const CERT_PAR_DEFAUT = { competition: 'competition', loisir: 'loisir', evenementielle: 'evenementiel', dirigeant: '' };
const STATUT_LICENCE = { active: 'Active', expiree: 'Expirée', annulee: 'Annulée' };

function optionsRepresentants(ctx, exclureId) {
  return ctx.licencies
    .filter((x) => x.id !== exclureId && !estMineur(x.date_naissance))
    .map((x) => ({
      id: x.id,
      libelle: nomComplet(x),
      detail: `${x.clubNom} · né(e) le ${fmtDate(x.date_naissance)}`,
      cle: norm(`${x.prenom} ${x.nom}`)
    }));
}

const normaliser = (f) => ({
  nom: f.nom.trim().toUpperCase(),
  prenom: f.prenom.trim(),
  date_naissance: f.date_naissance,
  sexe: f.sexe,
  club_id: f.club_id || null,
  email: f.email.trim().toLowerCase() || null,
  telephone: f.telephone.trim() || null,
  handicap: !!f.handicap,
  representant_legal_id: f.representant_legal_id || null
});

const formDepuis = (l) => ({
  nom: l.nom, prenom: l.prenom, date_naissance: l.date_naissance, sexe: l.sexe, club_id: l.club_id || '',
  email: l.email || '', telephone: l.telephone || '', handicap: !!l.handicap,
  representant_legal_id: l.representant_legal_id || null
});

function validerIdentite(f, { exigerRepresentant }) {
  const e = {};
  if (!f.nom.trim()) e.nom = 'Obligatoire.';
  if (!f.prenom.trim()) e.prenom = 'Obligatoire.';
  if (!f.date_naissance || !parseDate(f.date_naissance)) e.date_naissance = 'Date invalide.';
  else if (f.date_naissance > aujourdhuiISO()) e.date_naissance = 'La date ne peut pas être dans le futur.';
  if (!f.sexe) e.sexe = 'Obligatoire.';
  if (!f.club_id) e.club_id = 'Choisis un club.';
  if (!emailValide(f.email)) e.email = 'Adresse e-mail invalide.';
  if (exigerRepresentant && f.date_naissance && estMineur(f.date_naissance) && !f.representant_legal_id) {
    e.representant = 'Un représentant légal est obligatoire pour un mineur.';
  }
  return e;
}

// ---------- Champs partagés ----------
function ChampsIdentite({ f, maj, erreurs, ctx, idExclu }) {
  const representants = useMemo(() => optionsRepresentants(ctx, idExclu), [ctx.licencies, idExclu]);
  const mineur = f.date_naissance && estMineur(f.date_naissance);
  return html`<div class="grille grille-2">
    <${Champ} id="f-nom" libelle="Nom" erreur=${erreurs.nom}>
      <input id="f-nom" type="text" autocomplete="off" value=${f.nom} onInput=${(e) => maj({ nom: e.target.value })} />
    <//>
    <${Champ} id="f-prenom" libelle="Prénom" erreur=${erreurs.prenom}>
      <input id="f-prenom" type="text" autocomplete="off" value=${f.prenom} onInput=${(e) => maj({ prenom: e.target.value })} />
    <//>
    <${Champ} id="f-naissance" libelle="Date de naissance" erreur=${erreurs.date_naissance}>
      <input id="f-naissance" type="date" value=${f.date_naissance} onInput=${(e) => maj({ date_naissance: e.target.value })} />
    <//>
    <${Champ} id="f-sexe" libelle="Sexe" erreur=${erreurs.sexe}>
      <select id="f-sexe" value=${f.sexe} onChange=${(e) => maj({ sexe: e.target.value })}>
        <option value="">Choisir…</option>
        <option value="F">Femme</option>
        <option value="M">Homme</option>
      </select>
    <//>
    <${Champ} id="f-club" libelle="Club" erreur=${erreurs.club_id}>
      <select id="f-club" value=${f.club_id} onChange=${(e) => maj({ club_id: e.target.value })}>
        <option value="">Choisir…</option>
        ${ctx.clubs.map((c) => html`<option key=${c.id} value=${c.id}>${c.nom}</option>`)}
      </select>
    <//>
    <div class="champ">
      <span class="etiquette">Para-tennis de table</span>
      <div class="case">
        <input id="f-handicap" type="checkbox" checked=${f.handicap} onChange=${(e) => maj({ handicap: e.target.checked })} />
        <label for="f-handicap">Joueur en situation de handicap</label>
      </div>
    </div>
    <${Champ} id="f-email" libelle="Adresse e-mail" erreur=${erreurs.email}>
      <input id="f-email" type="email" autocomplete="off" value=${f.email} onInput=${(e) => maj({ email: e.target.value })} />
    <//>
    <${Champ} id="f-tel" libelle="Téléphone">
      <input id="f-tel" type="tel" autocomplete="off" value=${f.telephone} onInput=${(e) => maj({ telephone: e.target.value })} />
    <//>
    <div class="plein">
      <${Champ} id="f-rep" libelle=${'Représentant légal' + (mineur ? ' (obligatoire)' : '')}
          aide=${mineur ? 'Ce licencié est mineur : choisis un parent ou tuteur déjà licencié.' : 'Utile seulement pour un mineur.'}
          erreur=${erreurs.representant}>
        <${ChoixPersonne} id="f-rep" options=${representants} valeur=${f.representant_legal_id}
          onChange=${(v) => maj({ representant_legal_id: v })} />
      <//>
    </div>
  </div>`;
}

function ChampsLicence({ g, majG }) {
  return html`<div class="grille grille-2">
    <${Champ} id="g-type" libelle="Type de licence">
      <select id="g-type" value=${g.type}
        onChange=${(e) => majG({ type: e.target.value, certType: g.certType || CERT_PAR_DEFAUT[e.target.value] || '' })}>
        ${Object.entries(TYPES_LICENCE).map(([k, v]) => html`<option key=${k} value=${k}>${v}</option>`)}
      </select>
    <//>
    <${Champ} id="g-cert-type" libelle="Certificat médical : type">
      <select id="g-cert-type" value=${g.certType} onChange=${(e) => majG({ certType: e.target.value })}>
        <option value="">Aucun</option>
        ${Object.entries(TYPES_CERTIFICAT).map(([k, v]) => html`<option key=${k} value=${k}>${v}</option>`)}
      </select>
    <//>
    <${Champ} id="g-cert-date" libelle="Certificat médical : date">
      <input id="g-cert-date" type="date" value=${g.certDate} onInput=${(e) => majG({ certDate: e.target.value })} />
    <//>
    <div class="champ">
      <span class="etiquette">Pièces reçues</span>
      <div class="case"><input id="g-cert" type="checkbox" checked=${g.certFourni} onChange=${(e) => majG({ certFourni: e.target.checked })} /><label for="g-cert">Certificat médical</label></div>
      <div class="case"><input id="g-quest" type="checkbox" checked=${g.questionnaire} onChange=${(e) => majG({ questionnaire: e.target.checked })} /><label for="g-quest">Questionnaire de santé</label></div>
      <div class="case"><input id="g-photo" type="checkbox" checked=${g.photo} onChange=${(e) => majG({ photo: e.target.checked })} /><label for="g-photo">Photo</label></div>
    </div>
  </div>`;
}

const licenceVide = () => ({ type: 'competition', certType: 'competition', certDate: '', certFourni: false, questionnaire: false, photo: false });

// ---------- Fenêtre « Prendre / modifier la licence » ----------
function DialogueLicence({ ctx, l, onFermer }) {
  const lc = l.courante;
  const precedente = l.historique[0];
  const [g, setG] = useState(() => lc
    ? { type: lc.type, certType: lc.certificat_type || '', certDate: lc.certificat_date || '', certFourni: lc.certificat_fourni, questionnaire: lc.questionnaire_fourni, photo: lc.photo_fournie }
    : { ...licenceVide(), type: precedente?.type || 'competition', certType: CERT_PAR_DEFAUT[precedente?.type || 'competition'] });
  const [club, setClub] = useState(l.club_id || '');
  const [occupe, setOccupe] = useState(false);
  const majG = (p) => setG((x) => ({ ...x, ...p }));
  const mineurSansRep = estMineur(l.date_naissance) && !l.representant_legal_id;
  const remonte = l.statut === 'archive' && Number(l.points) < 500;

  async function valider(e) {
    e.preventDefault();
    if (!club) return toast('Choisis un club.', 'erreur');
    setOccupe(true);
    try {
      await api.prendreLicence({ licencie: l.id, saison: ctx.saison.id, club, type: g.type, certType: g.certType, certDate: g.certDate, certFourni: g.certFourni, questionnaire: g.questionnaire, photo: g.photo });
      await ctx.recharger();
      toast(`Licence ${ctx.saison.libelle} enregistrée.`);
      onFermer();
    } catch (err) {
      toast(msgErreur(err), 'erreur');
    } finally {
      setOccupe(false);
    }
  }

  return html`<${Dialogue} titre=${`Licence ${ctx.saison.libelle}`} onFermer=${onFermer}>
    <form class="grille" onSubmit=${valider} noValidate>
      ${mineurSansRep && html`<p class="avis avis-alerte">Ce licencié est mineur : enregistre d'abord son représentant légal sur la fiche.</p>`}
      ${remonte && html`<p class="avis">Ses points (${fmtPts(l.points)}) seront remontés à 500, comme pour toute réactivation.</p>`}
      <${Champ} id="d-club" libelle="Club">
        <select id="d-club" value=${club} onChange=${(e) => setClub(e.target.value)}>
          <option value="">Choisir…</option>
          ${ctx.clubs.map((c) => html`<option key=${c.id} value=${c.id}>${c.nom}</option>`)}
        </select>
      <//>
      <${ChampsLicence} g=${g} majG=${majG} />
      <div class="actions">
        <button class="btn btn-primaire" type="submit" disabled=${occupe || mineurSansRep}>${occupe ? 'Enregistrement…' : 'Enregistrer la licence'}</button>
        <button class="btn btn-secondaire" type="button" onClick=${onFermer}>Annuler</button>
      </div>
    </form>
  <//>`;
}

// ---------- Carte « Licence de la saison » ----------
function CarteLicence({ ctx, l }) {
  const lc = l.courante;
  const [ouvert, setOuvert] = useState(null); // 'licence' | 'archive'
  const [occupe, setOccupe] = useState(false);

  async function archiver() {
    setOccupe(true);
    try {
      await api.majLicencie(l.id, { statut: 'archive', date_archivage: aujourdhuiISO() });
      if (lc && lc.statut === 'active') await api.majLicence(lc.id, { statut: 'annulee' });
      await ctx.recharger();
      toast('Fiche archivée. Elle reste consultable et peut être réactivée.');
      setOuvert(null);
    } catch (err) {
      toast(msgErreur(err), 'erreur');
    } finally {
      setOccupe(false);
    }
  }

  const oui = (b) => (b ? 'Oui' : 'Non');
  return html`<section class="carte" aria-label=${`Licence ${ctx.saison.libelle}`}>
    <div class="carte-titre">
      <h2>Licence ${ctx.saison.libelle}</h2>
      <${Pastille} genre=${l.statut === 'actif' ? 'actif' : 'archive'}>${l.statut === 'actif' ? 'Fiche active' : 'Fiche archivée'}<//>
    </div>
    ${lc
      ? html`<dl class="def">
          <div><dt>Type</dt><dd>${TYPES_LICENCE[lc.type]}</dd></div>
          <div><dt>Club</dt><dd>${ctx.clubParId.get(lc.club_id)?.nom || '—'}</dd></div>
          <div><dt>Certificat médical</dt><dd>${lc.certificat_fourni ? 'Reçu' : 'Manquant'}${lc.certificat_type ? ` · ${TYPES_CERTIFICAT[lc.certificat_type]}` : ''}${lc.certificat_date ? ` · ${fmtDate(lc.certificat_date)}` : ''}</dd></div>
          <div><dt>Questionnaire · Photo</dt><dd>${oui(lc.questionnaire_fourni)} · ${oui(lc.photo_fournie)}</dd></div>
        </dl>`
      : html`<p class="avis">${l.statut === 'archive' ? 'Fiche archivée : la personne doit reprendre une licence pour être de nouveau licenciée.' : 'Aucune licence pour cette saison.'}</p>`}
    ${ctx.estCadre && html`<div class="actions">
      <button class="btn btn-primaire" type="button" onClick=${() => setOuvert('licence')}>
        ${lc ? 'Modifier la licence' : l.statut === 'archive' ? `Réactiver · prendre la licence ${ctx.saison.libelle}` : `Prendre la licence ${ctx.saison.libelle}`}
      </button>
      ${l.statut === 'actif' && html`<button class="btn btn-danger" type="button" onClick=${() => setOuvert('archive')}>Archiver la fiche</button>`}
    </div>`}
    ${ouvert === 'licence' && html`<${DialogueLicence} ctx=${ctx} l=${l} onFermer=${() => setOuvert(null)} />`}
    ${ouvert === 'archive' && html`<${Dialogue} titre="Archiver cette fiche ?" onFermer=${() => setOuvert(null)}>
      <p>${nomComplet(l)} n'apparaîtra plus parmi les licenciés actifs. Son historique et ses points sont conservés, et la fiche pourra être réactivée en reprenant une licence.</p>
      <div class="actions">
        <button class="btn btn-danger" type="button" onClick=${archiver} disabled=${occupe}>${occupe ? 'Archivage…' : 'Archiver'}</button>
        <button class="btn btn-secondaire" type="button" onClick=${() => setOuvert(null)}>Annuler</button>
      </div>
    <//>`}
  </section>`;
}

function Historique({ ctx, l }) {
  if (!l.historique.length) return null;
  return html`<section class="carte" aria-label="Historique des licences">
    <h2>Historique des licences</h2>
    <ul class="historique">
      ${l.historique.map((h) => html`<li key=${h.id}>
        <strong>${ctx.saisonParId.get(h.saison_id)?.libelle || '—'}</strong>
        <${Pastille} genre="categorie">${TYPES_LICENCE[h.type]}<//>
        <span>${ctx.clubParId.get(h.club_id)?.nom || '—'}</span>
        <small>${STATUT_LICENCE[h.statut]}</small>
        <small>· Certificat ${h.certificat_fourni ? 'reçu' : 'manquant'}</small>
      </li>`)}
    </ul>
  </section>`;
}

// ---------- Formulaire de modification (cadre fédéral) ----------
function FormulaireFiche({ ctx, l }) {
  const [f, setF] = useState(() => formDepuis(l));
  const [erreurs, setErreurs] = useState({});
  const [occupe, setOccupe] = useState(false);
  useEffect(() => { setF(formDepuis(l)); setErreurs({}); }, [l]);

  const maj = (p) => setF((x) => ({ ...x, ...p }));
  const initial = normaliser(formDepuis(l));
  const actuel = normaliser(f);
  const modifie = JSON.stringify(initial) !== JSON.stringify(actuel);

  async function enregistrer(e) {
    e.preventDefault();
    const err = validerIdentite(f, { exigerRepresentant: l.statut === 'actif' });
    setErreurs(err);
    if (Object.keys(err).length) return toast('Corrige les champs signalés.', 'erreur');
    const patch = {};
    for (const k of Object.keys(actuel)) if (actuel[k] !== initial[k]) patch[k] = actuel[k];
    setOccupe(true);
    try {
      await api.majLicencie(l.id, patch);
      if (patch.club_id && l.courante) await api.majLicence(l.courante.id, { club_id: patch.club_id });
      await ctx.recharger();
      toast('Fiche enregistrée.');
    } catch (er) {
      toast(msgErreur(er), 'erreur');
    } finally {
      setOccupe(false);
    }
  }

  return html`<form class="carte" onSubmit=${enregistrer} noValidate>
    <h2>Informations</h2>
    <${ChampsIdentite} f=${f} maj=${maj} erreurs=${erreurs} ctx=${ctx} idExclu=${l.id} />
    <p class="aide" style="margin-top:12px">Né(e) le ${fmtDate(l.date_naissance)} · ${l.age} ans · les points ne se modifient pas à la main : ils sont recalculés chaque mois à partir des matchs.</p>
    <div class="actions">
      <button class="btn btn-primaire" type="submit" disabled=${!modifie || occupe}>${occupe ? 'Enregistrement…' : 'Enregistrer les modifications'}</button>
      <button class="btn btn-secondaire" type="button" disabled=${!modifie || occupe} onClick=${() => { setF(formDepuis(l)); setErreurs({}); }}>Annuler les changements</button>
    </div>
  </form>`;
}

// ---------- Lecture seule (responsable de club, licencié) ----------
function LectureFiche({ ctx, l, estSoi }) {
  const rep = l.representant_legal_id ? ctx.licencieParId.get(l.representant_legal_id) : null;
  return html`<section class="carte" aria-label="Informations">
    <h2>Informations</h2>
    <dl class="def">
      <div><dt>Date de naissance</dt><dd>${fmtDate(l.date_naissance)} · ${l.age} ans</dd></div>
      <div><dt>Sexe</dt><dd>${l.sexe === 'F' ? 'Femme' : 'Homme'}</dd></div>
      <div><dt>Club</dt><dd>${l.clubNom}</dd></div>
      <div><dt>Catégorie</dt><dd>${l.categorie}</dd></div>
      <div><dt>E-mail</dt><dd>${l.email || '—'}</dd></div>
      <div><dt>Téléphone</dt><dd>${l.telephone || '—'}</dd></div>
      ${(estSoi || ctx.estCadre) && html`<div><dt>Para-tennis de table</dt><dd>${l.handicap ? 'Oui' : 'Non'}</dd></div>`}
      ${rep && html`<div><dt>Représentant légal</dt><dd>${nomComplet(rep)}</dd></div>`}
    </dl>
  </section>`;
}

function ContactSeul({ ctx, l }) {
  const [email, setEmail] = useState(l.email || '');
  const [tel, setTel] = useState(l.telephone || '');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  useEffect(() => { setEmail(l.email || ''); setTel(l.telephone || ''); }, [l]);
  const modifie = (email.trim().toLowerCase() || null) !== (l.email || null) || (tel.trim() || null) !== (l.telephone || null);

  async function enregistrer(e) {
    e.preventDefault();
    if (!emailValide(email)) return setErreur('Adresse e-mail invalide.');
    setErreur('');
    setOccupe(true);
    try {
      await api.majLicencie(l.id, { email: email.trim().toLowerCase() || null, telephone: tel.trim() || null });
      await ctx.recharger();
      toast('Coordonnées enregistrées.');
    } catch (err) {
      toast(msgErreur(err), 'erreur');
    } finally {
      setOccupe(false);
    }
  }

  return html`<form class="carte" onSubmit=${enregistrer} noValidate>
    <h2>Mes coordonnées</h2>
    <div class="grille grille-2">
      <${Champ} id="m-email" libelle="Adresse e-mail" erreur=${erreur}>
        <input id="m-email" type="email" value=${email} onInput=${(e) => setEmail(e.target.value)} />
      <//>
      <${Champ} id="m-tel" libelle="Téléphone">
        <input id="m-tel" type="tel" value=${tel} onInput=${(e) => setTel(e.target.value)} />
      <//>
    </div>
    <div class="actions"><button class="btn btn-primaire" type="submit" disabled=${!modifie || occupe}>Enregistrer</button></div>
  </form>`;
}

// ---------- Page fiche ----------
export function PageLicencie({ ctx, id }) {
  const l = ctx.licencieParId.get(id);
  const peutVoirListe = ctx.estCadre || ctx.estResponsable;
  if (!l) {
    return html`<div class="page">
      <a class="retour" href=${peutVoirListe ? lien(['licencies']) : lien([])}><${Icone} nom="retour" taille=${20} /> Retour</a>
      <p class="vide">Fiche introuvable, ou tu n'as pas le droit de la consulter.</p>
    </div>`;
  }
  const estSoi = ctx.moi?.id === l.id;
  return html`<div class="page">
    <a class="retour" href=${peutVoirListe ? lien(['licencies']) : lien([])}>
      <${Icone} nom="retour" taille=${20} /> ${peutVoirListe ? 'Licenciés' : 'Accueil'}
    </a>
    <div class="fiche-tete">
      <div>
        <h1>${l.prenom} ${l.nom}</h1>
        <div class="etiquettes" style="margin-top:8px">
          <${Pastille} genre=${l.statut === 'actif' ? 'actif' : 'archive'}>${l.statut === 'actif' ? 'Actif' : 'Archivé'}<//>
          <${Pastille} genre="categorie">${l.categorie}<//>
          <${Pastille}>${l.clubNom}<//>
          ${l.alerteCertificat && html`<${Pastille} genre="alerte">Certificat manquant<//>`}
        </div>
      </div>
      <div class="fiche-pts"><strong>${fmtPts(l.points)}</strong><small>points</small></div>
    </div>
    ${ctx.estCadre
      ? html`<${FormulaireFiche} ctx=${ctx} l=${l} />`
      : html`<${LectureFiche} ctx=${ctx} l=${l} estSoi=${estSoi} />`}
    ${!ctx.estCadre && estSoi && html`<${ContactSeul} ctx=${ctx} l=${l} />`}
    <${CarteLicence} ctx=${ctx} l=${l} />
    <${Historique} ctx=${ctx} l=${l} />
    <${HistoriqueMatchs} ctx=${ctx} l=${l} />
    ${ctx.estCadre && html`<section class="carte" aria-label="Compte et accès">
      <h2>Compte et accès</h2>
      <p><${Pastille} genre=${etatCompte(l).genre}>${etatCompte(l).texte}<//>
        ${ctx.roles.filter((r) => r.licencie_id === l.id).map((r) => html` <${Pastille}>${r.role === 'cadre_federal' ? 'Cadre fédéral' : r.role === 'responsable_club' ? 'Responsable · ' + (ctx.clubParId.get(r.club_id)?.nom || '') : 'Juge-arbitre'}<//>`)}</p>
      <p><a href=${lien(['comptes'])}>Gérer les comptes et les accès</a></p>
      <label class="case"><input type="checkbox" id="masque-public" checked=${!!l.masque_public} onChange=${async (e) => {
        try { await api.majLicencie(l.id, { masque_public: e.target.checked }); await ctx.recharger(); toast(e.target.checked ? 'Fiche masquée du site public.' : 'Fiche visible sur le site public.'); }
        catch (err) { toast(msgErreur(err), 'erreur'); }
      }} /> Masquer du site public (classement, résultats, fiche)</label>
      <p><a href=${lien(['joueur', l.id])}>Voir la fiche publique</a></p>
      <p><a href=${lien(['journal'], { fiche: l.id })}>Historique des modifications de cette fiche</a></p>
    </section>`}
  </div>`;
}

// ---------- Création d'un licencié ----------
export function PageNouveauLicencie({ ctx }) {
  const [f, setF] = useState({ nom: '', prenom: '', date_naissance: '', sexe: '', club_id: '', email: '', telephone: '', handicap: false, representant_legal_id: null });
  const [g, setG] = useState(licenceVide());
  const [erreurs, setErreurs] = useState({});
  const [occupe, setOccupe] = useState(false);
  const maj = (p) => setF((x) => ({ ...x, ...p }));
  const majG = (p) => setG((x) => ({ ...x, ...p }));

  const doublon = useMemo(() => {
    if (!f.nom.trim() || !f.prenom.trim() || !f.date_naissance) return null;
    return ctx.licencies.find((x) => norm(x.nom) === norm(f.nom) && norm(x.prenom) === norm(f.prenom) && x.date_naissance === f.date_naissance) || null;
  }, [f.nom, f.prenom, f.date_naissance, ctx.licencies]);

  async function creer(e) {
    e.preventDefault();
    const err = validerIdentite(f, { exigerRepresentant: true });
    setErreurs(err);
    if (Object.keys(err).length) return toast('Corrige les champs signalés.', 'erreur');
    if (doublon) return;
    const n = normaliser(f);
    setOccupe(true);
    try {
      const nouvelId = await api.creerLicencie({
        nom: n.nom, prenom: n.prenom, naissance: n.date_naissance, sexe: n.sexe, club: n.club_id,
        email: n.email, telephone: n.telephone, handicap: n.handicap, representant: n.representant_legal_id,
        saison: ctx.saison.id, type: g.type, certType: g.certType, certDate: g.certDate,
        certFourni: g.certFourni, questionnaire: g.questionnaire, photo: g.photo
      });
      await ctx.recharger();
      toast(`${n.prenom} ${n.nom} est licencié(e) pour la saison ${ctx.saison.libelle}.`);
      naviguer(['licencies', nouvelId]);
    } catch (er) {
      toast(msgErreur(er), 'erreur');
    } finally {
      setOccupe(false);
    }
  }

  return html`<div class="page">
    <a class="retour" href=${lien(['licencies'])}><${Icone} nom="retour" taille=${20} /> Licenciés</a>
    <div class="page-tete"><div><h1>Nouveau licencié</h1><p>Saison ${ctx.saison.libelle} · départ à 500 points</p></div></div>
    <form class="page" style="gap:20px" onSubmit=${creer} noValidate>
      <section class="carte">
        <h2>Informations</h2>
        <${ChampsIdentite} f=${f} maj=${maj} erreurs=${erreurs} ctx=${ctx} idExclu=${null} />
        ${doublon && html`<p class="avis avis-alerte" style="margin-top:14px" role="alert">
          Une fiche existe déjà pour cette personne (${doublon.statut === 'archive' ? 'archivée' : 'active'}).
          <a href=${lien(['licencies', doublon.id])}>Ouvrir la fiche existante</a> pour la réactiver au lieu d'en créer une nouvelle.</p>`}
      </section>
      <section class="carte">
        <h2>Licence ${ctx.saison.libelle}</h2>
        <${ChampsLicence} g=${g} majG=${majG} />
      </section>
      <div class="actions" style="margin-top:0">
        <button class="btn btn-primaire" type="submit" disabled=${occupe || !!doublon}>${occupe ? 'Création…' : 'Créer le licencié'}</button>
        <a class="btn btn-secondaire" href=${lien(['licencies'])}>Annuler</a>
      </div>
    </form>
  </div>`;
}
