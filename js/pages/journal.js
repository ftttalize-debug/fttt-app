// Journal des modifications (cadre fédéral) : qui a modifié quoi, et quand.
import { html, useState, useEffect, useMemo } from '../preact.js';
import { lireJournal } from '../data.js';
import { lien, lireRoute, nomComplet, msgErreur } from '../lib.js';
import { Pastille, Chargement } from '../ui.js';

const PAS = 50;

// Groupes de tables proposés en filtre
const GROUPES = {
  licencies: { libelle: 'Licenciés', tables: ['licencies'] },
  licences: { libelle: 'Licences', tables: ['licences'] },
  clubs: { libelle: 'Clubs et saisons', tables: ['clubs', 'saisons'] },
  roles: { libelle: 'Rôles et accès', tables: ['attributions_roles', 'competition_juges'] },
  competitions: { libelle: 'Compétitions', tables: ['competitions'] },
  inscriptions: { libelle: 'Inscriptions', tables: ['inscriptions', 'inscription_participants'] },
  factures: { libelle: 'Factures', tables: ['factures'] },
  matchs: { libelle: 'Matchs et scores', tables: ['matchs', 'participants_match', 'manches'] },
  points: { libelle: 'Points et classements', tables: ['mouvements_points', 'classements_mensuels', 'bareme'] }
};
// Par défaut, on masque ce qui est calculé automatiquement
const PAR_DEFAUT = ['licencies', 'licences', 'clubs', 'roles', 'competitions', 'inscriptions', 'factures', 'matchs'];

const NOM_TABLE = {
  licencies: 'la fiche', licences: 'la licence', clubs: 'le club', saisons: 'la saison',
  attributions_roles: 'un rôle', competition_juges: 'un juge-arbitre de compétition',
  competitions: 'la compétition', inscriptions: "l'inscription", inscription_participants: 'un participant inscrit',
  factures: 'la facture', matchs: 'le match', participants_match: 'un participant de match', manches: 'une manche',
  bareme: 'le barème', mouvements_points: 'un mouvement de points', classements_mensuels: 'un classement mensuel'
};
const VERBE = { INSERT: 'a créé', UPDATE: 'a modifié', DELETE: 'a supprimé' };

const CHAMPS = {
  nom: 'Nom', prenom: 'Prénom', date_naissance: 'Naissance', sexe: 'Sexe', email: 'E-mail', telephone: 'Téléphone',
  club_id: 'Club', statut: 'Statut', points: 'Points', handicap: 'Handicap', user_id: 'Compte', role: 'Rôle',
  type: 'Type', certificat_type: 'Type de certificat', certificat_date: 'Date du certificat', certificat_fourni: 'Certificat fourni',
  questionnaire_fourni: 'Questionnaire', photo_fournie: 'Photo', montant_xpf: 'Montant (XPF)', coefficient: 'Coefficient',
  date_debut: 'Début', date_fin: 'Fin', libelle: 'Libellé', actif: 'Actif', representant_legal_id: 'Représentant légal',
  nom_competition: 'Nom', tour: 'Tour', sets_gagnes: 'Sets gagnés', score_a: 'Score A', score_b: 'Score B',
  points_finaux: 'Points', applique: 'Appliqué', numero: 'Numéro', adresse: 'Adresse', niveau: 'Niveau'
};
const IGNORES = new Set(['id', 'created_at', 'updated_at']);

function valeurTexte(cle, v, ctx) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'oui' : 'non';
  if (cle === 'club_id') return ctx.clubParId.get(v)?.nom || '(club supprimé)';
  if (cle === 'user_id') return 'compte relié';
  if (cle.endsWith('_id')) {
    const l = ctx.licencies.find((x) => x.id === v);
    return l ? nomComplet(l) : '(autre enregistrement)';
  }
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function differences(ligne, ctx) {
  const av = ligne.avant || {}, ap = ligne.apres || {};
  const cles = [...new Set([...Object.keys(av), ...Object.keys(ap)])].filter((c) => !IGNORES.has(c));
  if (ligne.action === 'UPDATE') return cles.filter((c) => JSON.stringify(av[c]) !== JSON.stringify(ap[c]))
    .map((c) => ({ c, libelle: CHAMPS[c] || c, avant: valeurTexte(c, av[c], ctx), apres: valeurTexte(c, ap[c], ctx) }));
  const src = ligne.action === 'INSERT' ? ap : av;
  return cles.filter((c) => src[c] !== null && src[c] !== undefined && src[c] !== '')
    .map((c) => ({ c, libelle: CHAMPS[c] || c, valeur: valeurTexte(c, src[c], ctx) }));
}

/** Nom lisible de l'enregistrement concerné. */
function etiquette(ligne, ctx) {
  const d = ligne.apres || ligne.avant || {};
  const t = ligne.table_name;
  const perso = (id) => { const l = ctx.licencies.find((x) => x.id === id); return l ? nomComplet(l) : ''; };
  if (t === 'licencies') return d.prenom ? `${d.prenom} ${d.nom}` : '';
  if (t === 'clubs' || t === 'competitions') return d.nom || '';
  if (t === 'saisons') return d.libelle || '';
  if (t === 'factures') return d.numero || '';
  if (d.licencie_id) return perso(d.licencie_id);
  return '';
}

function auteur(ligne, ctx) {
  if (!ligne.user_id) return 'Système (base de données)';
  const l = ctx.licencies.find((x) => x.user_id === ligne.user_id);
  return l ? nomComplet(l) : 'Compte inconnu';
}

function quand(iso) {
  const d = new Date(iso);
  return d.toLocaleString('fr-FR', { timeZone: 'Pacific/Tahiti', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function Ligne({ ligne, ctx }) {
  const [ouvert, setOuvert] = useState(false);
  const diffs = useMemo(() => (ouvert ? differences(ligne, ctx) : []), [ouvert, ligne]);
  const nom = etiquette(ligne, ctx);
  const genre = ligne.action === 'DELETE' ? 'alerte' : ligne.action === 'INSERT' ? 'actif' : 'neutre';
  return html`<li class="journal-ligne">
    <div class="journal-tete">
      <${Pastille} genre=${genre}>${ligne.action === 'INSERT' ? 'Création' : ligne.action === 'UPDATE' ? 'Modification' : 'Suppression'}<//>
      <span class="journal-date">${quand(ligne.date_action)}</span>
    </div>
    <p class="journal-phrase"><strong>${auteur(ligne, ctx)}</strong> ${VERBE[ligne.action]} ${NOM_TABLE[ligne.table_name] || ligne.table_name}${nom ? html` <strong>${nom}</strong>` : ''}.</p>
    <button class="btn btn-lien" type="button" aria-expanded=${ouvert} onClick=${() => setOuvert(!ouvert)}>${ouvert ? 'Masquer le détail' : 'Voir le détail'}</button>
    ${ouvert && html`<dl class="journal-detail">
      ${diffs.length === 0 && html`<dt>Aucun champ modifié</dt><dd></dd>`}
      ${diffs.map((d) => ligne.action === 'UPDATE'
        ? html`<dt>${d.libelle}</dt><dd><span class="avant">${d.avant}</span> → <span class="apres">${d.apres}</span></dd>`
        : html`<dt>${d.libelle}</dt><dd>${d.valeur}</dd>`)}
    </dl>`}
  </li>`;
}

export function PageJournal({ ctx, route }) {
  const fiche = route?.query?.fiche || '';
  const [groupes, setGroupes] = useState(PAR_DEFAUT);
  const [action, setAction] = useState('');
  const [du, setDu] = useState('');
  const [au, setAu] = useState('');
  const [lignes, setLignes] = useState([]);
  const [fin, setFin] = useState(false);
  const [charge, setCharge] = useState(true);
  const [erreur, setErreur] = useState('');

  // Pour une fiche précise, on montre tout (points compris)
  useEffect(() => { setGroupes(fiche ? Object.keys(GROUPES) : PAR_DEFAUT); setAction(''); setDu(''); setAu(''); }, [fiche]);

  const tables = useMemo(() => groupes.flatMap((g) => GROUPES[g].tables), [groupes]);
  const cle = JSON.stringify([tables, action, du, au, fiche]);

  const charger = async (depuis) => {
    setCharge(true); setErreur('');
    try {
      const page = await lireJournal({ tables, action, du, au, fiche, depuis, pas: PAS });
      setLignes((cur) => (depuis === 0 ? page : cur.concat(page)));
      setFin(page.length < PAS);
    } catch (e) { setErreur(msgErreur(e)); } finally { setCharge(false); }
  };
  useEffect(() => { charger(0); }, [cle]);

  const bascule = (g) => setGroupes(groupes.includes(g) ? groupes.filter((x) => x !== g) : [...groupes, g]);
  const personne = fiche ? ctx.licencies.find((l) => l.id === fiche) : null;

  return html`<div class="page">
    <h1>Journal des modifications</h1>
    <p class="aide">Historique de toutes les créations, modifications et suppressions. Il ne peut être ni modifié ni effacé. Heures de Tahiti.</p>
    ${fiche && html`<p><${Pastille}>Fiche : ${personne ? nomComplet(personne) : fiche}<//> <a href=${lien(['journal'])}>Voir tout le journal</a></p>`}
    <section class="carte" aria-label="Filtres">
      <div class="puces" role="group" aria-label="Type d'élément">
        ${Object.entries(GROUPES).map(([g, v]) => html`<button type="button" class="puce" aria-pressed=${groupes.includes(g)} onClick=${() => bascule(g)}>${v.libelle}</button>`)}
      </div>
      <div class="grille">
        <label>Action
          <select id="j-action" value=${action} onChange=${(e) => setAction(e.target.value)}>
            <option value="">Toutes</option><option value="INSERT">Créations</option><option value="UPDATE">Modifications</option><option value="DELETE">Suppressions</option>
          </select>
        </label>
        <label>Du <input id="j-du" type="date" value=${du} onInput=${(e) => setDu(e.target.value)} /></label>
        <label>Au <input id="j-au" type="date" value=${au} onInput=${(e) => setAu(e.target.value)} /></label>
      </div>
    </section>
    ${erreur && html`<p class="erreur" role="alert">${erreur}</p>`}
    <ul class="journal">
      ${lignes.map((l) => html`<${Ligne} key=${l.id} ligne=${l} ctx=${ctx} />`)}
    </ul>
    ${charge && html`<${Chargement} />`}
    ${!charge && lignes.length === 0 && !erreur && html`<p class="vide">Aucune entrée pour ces filtres.</p>`}
    ${!charge && !fin && html`<p><button class="btn btn-secondaire" type="button" onClick=${() => charger(lignes.length)}>Charger plus</button></p>`}
  </div>`;
}
