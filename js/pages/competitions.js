// Compétitions : liste, création, modification, ouverture et clôture (cadre fédéral).
import { html, useState, useEffect } from '../preact.js';
import { api } from '../data.js';
import { lien, naviguer, fmtDate, aujourdhuiISO, msgErreur } from '../lib.js';
import { Pliable, Icone, Pastille, Champ, Dialogue, toast } from '../ui.js';
import { CarteInscriptions } from './inscriptions.js';
import { CarteFacturation } from './factures.js';
import { CarteMatchs, CarteJuges } from './matchs.js';
import { CarteRencontres, CarteTours } from './rencontres.js';

export const TYPES_COMP = { simple: 'Simple', double: 'Double', equipe: 'Par équipe' };
const STATUTS = { brouillon: 'Brouillon', ouverte: 'Inscriptions ouvertes', cloturee: 'Inscriptions closes', terminee: 'Terminée' };
const GENRE = { brouillon: 'neutre', ouverte: 'actif', cloturee: 'alerte', terminee: 'archive' };
export const GENRES = { ouvert: 'Mixte (tous)', dames: 'Dames', messieurs: 'Messieurs', mixte: 'Mixte (1 fille + 1 garçon)', uni: 'Uni (2 filles ou 2 garçons)' };
const CATEGORIES_MAX = { '': 'Aucune limite', VET: 'Vétérans (41 ans et plus)', U11: 'U11 et moins', U12: 'U12 et moins', U13: 'U13 et moins', U15: 'U15 et moins', U19: 'U19 et moins' };
const COEFS = ['0.50', '0.75', '1.00', '1.25', '1.50'];
export const fmtXpf = (n) => `${Number(n || 0).toLocaleString('fr-FR').replace(/ /g, ' ')} F`;
const dates = (c) => (c.date_debut === c.date_fin ? fmtDate(c.date_debut) : `${fmtDate(c.date_debut)} – ${fmtDate(c.date_fin)}`);

const decaler = (iso, jours) => { if (!iso) return iso; const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + jours); return d.toISOString().slice(0, 10); };

/** Reprend en brouillon les compétitions d'une saison précédente : règles identiques, dates décalées à vérifier. */
function DialogueReprise({ ctx, onFermer }) {
  const saisons = ctx.data.saisons.slice().sort((a, b) => String(b.date_debut).localeCompare(String(a.date_debut)));
  const cible0 = ctx.saison?.id || saisons[0]?.id || '';
  const precedente = saisons.find((s) => s.id !== cible0 && String(s.date_debut) < String(ctx.saison?.date_debut || '9999')) || saisons.find((s) => s.id !== cible0);
  const [source, setSource] = useState(precedente?.id || '');
  const [cible, setCible] = useState(cible0);
  const [decalage, setDecalage] = useState('364');
  const [sel, setSel] = useState(null); // null = tout coché
  const [occupe, setOccupe] = useState(false);
  const liste = ctx.competitions.filter((c) => c.saison_id === source);
  const choisies = sel === null ? liste.map((c) => c.id) : sel;
  const jours = /^-?\d+$/.test(decalage.trim()) ? parseInt(decalage, 10) : null;
  const bascule = (id) => setSel(choisies.includes(id) ? choisies.filter((x) => x !== id) : [...choisies, id]);
  async function creer() {
    setOccupe(true);
    try {
      const n = await api.reprendreCompetitions(choisies, cible, jours);
      await ctx.recharger();
      toast(`${n} compétition${n > 1 ? 's' : ''} créée${n > 1 ? 's' : ''} en brouillon : vérifie les dates.`);
      onFermer();
    } catch (er) { toast(msgErreur(er), 'erreur'); setOccupe(false); }
  }
  const select = (id, val, set) => html`<select id=${id} value=${val} onChange=${(e) => { set(e.target.value); if (id === 'rp-source') setSel(null); }}>
    ${saisons.map((s) => html`<option key=${s.id} value=${s.id}>${s.libelle}</option>`)}</select>`;
  return html`<${Dialogue} titre="Reprendre une saison" onFermer=${onFermer}>
    <p class="aide">Les compétitions choisies sont copiées en brouillon avec leurs règles (format, tarif, coefficient, genre, catégorie, tours). Les inscriptions, les juges-arbitres et les matchs ne sont pas repris. Les dates sont décalées : vérifie-les ensuite une par une.</p>
    <div class="grille grille-2">
      <${Champ} id="rp-source" libelle="Saison à reprendre">${select('rp-source', source, setSource)}<//>
      <${Champ} id="rp-cible" libelle="Nouvelle saison">${select('rp-cible', cible, setCible)}<//>
    </div>
    <${Champ} id="rp-dec" libelle="Décalage des dates (jours)" aide="364 jours = un an en gardant le même jour de la semaine (un samedi reste un samedi)."><input id="rp-dec" type="text" inputmode="numeric" value=${decalage} onInput=${(e) => setDecalage(e.target.value)} /><//>
    ${liste.length === 0 ? html`<p class="vide">Aucune compétition dans cette saison.</p>` : html`<ul class="choix-joueurs">${liste.map((c) => html`<li key=${c.id}><label class="choix-ligne">
      <input type="checkbox" checked=${choisies.includes(c.id)} onChange=${() => bascule(c.id)} />
      <span class="choix-nom"><strong>${c.nom}</strong><small>${dates(c)}${jours !== null ? ` → ${dates({ date_debut: decaler(c.date_debut, jours), date_fin: decaler(c.date_fin, jours) })}` : ''}</small></span></label></li>`)}</ul>`}
    <div class="actions">
      <button class="btn btn-primaire" type="button" disabled=${occupe || !choisies.length || jours === null || !cible || source === cible} onClick=${creer}>${occupe ? 'Création…' : `Créer ${choisies.length} brouillon${choisies.length > 1 ? 's' : ''}`}</button>
      <button class="btn btn-secondaire" type="button" onClick=${onFermer}>Annuler</button>
    </div><//>`;
}

export function PageCompetitions({ ctx, route }) {
  const [reprise, setReprise] = useState(false);
  const { competitions, estCadre } = ctx;
  const voitBrouillons = estCadre || ctx.estJuge;
  const statut = route.query.statut || 'toutes';
  // À venir (ou en cours) d'abord, de la plus proche à la plus lointaine ; puis les passées, de la plus récente à la plus ancienne
  const auj = aujourdhuiISO();
  const filtrees = competitions.filter((c) => statut === 'toutes' || c.statut === statut);
  const liste = [
    ...filtrees.filter((c) => c.date_fin >= auj).sort((x, y) => String(x.date_debut).localeCompare(String(y.date_debut))),
    ...filtrees.filter((c) => c.date_fin < auj).sort((x, y) => String(y.date_debut).localeCompare(String(x.date_debut)))
  ];
  const puces = [['toutes', 'Toutes'], ['ouverte', 'Ouvertes'], ['cloturee', 'Closes'], ['terminee', 'Terminées']];
  if (voitBrouillons) puces.splice(1, 0, ['brouillon', 'Brouillons']);
  return html`<div class="page">
    <div class="page-tete">
      <div><h1>Compétitions</h1><p>${competitions.length} compétition${competitions.length > 1 ? 's' : ''}</p></div>
      ${ctx.peutCreerComp && html`<div class="page-actions"><a class="btn btn-primaire" href=${lien(['competitions', 'nouveau'])}><${Icone} nom="plus" taille=${20} /> Nouvelle compétition</a>
        ${estCadre && html`<button class="btn btn-secondaire" type="button" onClick=${() => setReprise(true)}>Reprendre une saison</button>`}</div>`}
    </div>
    <div class="puces" role="group" aria-label="Statut">
      ${puces.map(([v, label]) => html`<button key=${v} type="button" class="puce" aria-pressed=${statut === v}
        onClick=${() => naviguer(['competitions'], v === 'toutes' ? {} : { statut: v }, true)}>${label}</button>`)}
    </div>
    ${reprise && html`<${DialogueReprise} ctx=${ctx} onFermer=${() => setReprise(false)} />`}
    ${liste.length === 0 ? html`<p class="vide">Aucune compétition.</p>` : html`<ul class="liste">
      ${liste.map((c) => html`<li key=${c.id}>
        <a class="ligne" style="display:flex" href=${lien(['competitions', c.id])}>
          <span class="ligne-nom"><strong>${c.nom}</strong><small>${dates(c)}${c.lieu ? ' · ' + c.lieu : ''}</small></span>
          <span class="etiquettes">
            <${Pastille} genre=${GENRE[c.statut]}>${STATUTS[c.statut]}<//>
            <${Pastille}>${TYPES_COMP[c.type]}<//>
            ${c.categorie_max && html`<${Pastille}>${c.categorie_max}<//>`}
            ${c.categorie_min && html`<${Pastille}>Vétérans<//>`}
            ${c.points_max != null && html`<${Pastille}>≤ ${c.points_max} pts<//>`}
            ${c.inscription_federation && html`<${Pastille}>Inscription fédération<//>`}
            ${!c.inscription_federation && c.inscription_athletes === false && html`<${Pastille}>Inscription par les clubs<//>`}
            ${c.genre && c.genre !== 'ouvert' && html`<${Pastille}>${GENRES[c.genre].split(' (')[0]}<//>`}
            <${Pastille}>Coef. ${Number(c.coefficient).toLocaleString('fr-FR')}<//>
          </span>
        </a>
      </li>`)}
    </ul>`}
  </div>`;
}

// Qui peut inscrire : quatre choix, du plus ouvert au plus fermé (le cadre fédéral peut toujours inscrire)
const MODES_INSCRIPTION = [
  ['tous', 'Ouverte à tous', 'Toutes les licences (compétition, loisir, événementielle) : les athlètes eux-mêmes, les responsables de club et la fédération.'],
  ['athletes', 'Athlètes en compétition', 'Les athlètes licenciés compétition eux-mêmes, les responsables de club et la fédération.'],
  ['clubs', 'Responsables de club et fédération', 'Les athlètes ne peuvent pas s\'inscrire eux-mêmes.'],
  ['federation', 'Fédération uniquement', 'Ni les clubs ni les athlètes ne peuvent inscrire.']
];
const MODES_VALEURS = {
  tous: { ouverte_a_tous: true, inscription_athletes: true, inscription_federation: false },
  athletes: { ouverte_a_tous: false, inscription_athletes: true, inscription_federation: false },
  clubs: { ouverte_a_tous: false, inscription_athletes: false, inscription_federation: false },
  federation: { ouverte_a_tous: false, inscription_athletes: false, inscription_federation: true }
};
const modeInscription = (f) => (f.inscription_federation ? 'federation' : !f.inscription_athletes ? 'clubs' : f.ouverte_a_tous ? 'tous' : 'athletes');

const vide = (ctx) => ({
  nom: '', saison_id: ctx.saison?.id || '', lieu: '', date_debut: '', date_fin: '', type: 'simple',
  coefficient: '1.00', montant_xpf: '0', date_limite_inscription: '', ouverte_a_tous: false, genre: 'ouvert', categorie_max: '', categorie_min: '', points_max: '', inscription_federation: false, inscription_athletes: true, nb_simples: '', nb_doubles: ''
});
const depuis = (c) => ({
  nom: c.nom, saison_id: c.saison_id, lieu: c.lieu || '', date_debut: c.date_debut, date_fin: c.date_fin, type: c.type,
  coefficient: Number(c.coefficient).toFixed(2), montant_xpf: String(c.montant_xpf), date_limite_inscription: c.date_limite_inscription || '',
  ouverte_a_tous: !!c.ouverte_a_tous, genre: c.genre || 'ouvert', categorie_max: c.categorie_max || '', categorie_min: c.categorie_min || '', points_max: c.points_max == null ? '' : String(c.points_max), inscription_federation: !!c.inscription_federation, inscription_athletes: c.inscription_athletes !== false,
  nb_simples: c.nb_simples == null ? '' : String(c.nb_simples), nb_doubles: c.nb_doubles == null ? '' : String(c.nb_doubles)
});
const norme = (f) => ({
  nom: f.nom.trim(), saison_id: f.saison_id, lieu: f.lieu.trim() || null, date_debut: f.date_debut, date_fin: f.date_fin || f.date_debut,
  type: f.type, coefficient: Number(f.coefficient), montant_xpf: parseInt(f.montant_xpf, 10),
  date_limite_inscription: f.date_limite_inscription || null, ouverte_a_tous: !!f.ouverte_a_tous,
  // Envoyés seulement s'ils sont renseignés : le site reste utilisable avant le script 026.
  ...(f.genre !== 'ouvert' ? { genre: f.genre } : {}), ...(f.categorie_max ? { categorie_max: f.categorie_max } : {}), ...(f.categorie_min ? { categorie_min: f.categorie_min } : {}),
  ...(/^\d+$/.test(String(f.points_max).trim()) ? { points_max: parseInt(f.points_max, 10) } : {}), inscription_federation: !!f.inscription_federation, inscription_athletes: f.inscription_athletes !== false,
  ...(f.type === 'equipe' && /^\d+$/.test(f.nb_simples) ? { nb_simples: parseInt(f.nb_simples, 10) } : {}),
  ...(f.type === 'equipe' && /^\d+$/.test(f.nb_doubles) ? { nb_doubles: parseInt(f.nb_doubles, 10) } : {})
});

function valider(f) {
  const e = {};
  if (!f.nom.trim()) e.nom = 'Obligatoire.';
  if (!f.date_debut) e.date_debut = 'Obligatoire.';
  if (f.date_fin && f.date_debut && f.date_fin < f.date_debut) e.date_fin = 'La fin ne peut pas précéder le début.';
  if (f.date_limite_inscription && f.date_debut && f.date_limite_inscription > f.date_debut) e.limite = 'La date limite doit précéder le début.';
  if (!/^\d+$/.test(f.montant_xpf.trim())) e.montant = 'Nombre entier, 0 si gratuit.';
  if (String(f.points_max).trim() && !/^\d+$/.test(String(f.points_max).trim())) e.points_max = 'Nombre entier, vide si aucune limite.';
  return e;
}

function Formulaire({ ctx, c }) {
  const nouveau = !c;
  const [f, setF] = useState(c ? depuis(c) : vide(ctx));
  const [erreurs, setErreurs] = useState({});
  const [occupe, setOccupe] = useState(false);
  useEffect(() => { if (c) setF(depuis(c)); }, [c]);
  const maj = (p) => setF((x) => ({ ...x, ...p }));
  const modifie = nouveau || JSON.stringify(norme(f)) !== JSON.stringify(norme(depuis(c)));
  const peut = nouveau ? ctx.peutCreerComp : ctx.estCadre || (ctx.peutGererComp(c.id) && c.statut !== 'terminee');

  async function enregistrer(e) {
    e.preventDefault();
    const err = valider(f);
    setErreurs(err);
    if (Object.keys(err).length) return;
    setOccupe(true);
    try {
      if (nouveau) {
        const cree = await api.creerCompetition({ ...norme(f), statut: 'brouillon' });
        await ctx.recharger();
        toast('Compétition créée en brouillon.');
        naviguer(['competitions', cree.id]);
      } else {
        await api.majCompetition(c.id, norme(f));
        await ctx.recharger();
        toast('Compétition enregistrée.');
      }
    } catch (er) {
      toast(msgErreur(er), 'erreur');
    } finally {
      setOccupe(false);
    }
  }
  const dis = !peut;
  return html`<${Pliable} titre="Informations et réglages" ouvert=${false}><form onSubmit=${enregistrer} noValidate>
    <div class="grille grille-2">
      <div class="plein"><${Champ} id="p-nom" libelle="Nom de la compétition" erreur=${erreurs.nom}>
        <input id="p-nom" type="text" disabled=${dis} value=${f.nom} onInput=${(e) => maj({ nom: e.target.value })} /><//></div>
      <${Champ} id="p-lieu" libelle="Lieu"><input id="p-lieu" type="text" disabled=${dis} value=${f.lieu} onInput=${(e) => maj({ lieu: e.target.value })} /><//>
      <${Champ} id="p-saison" libelle="Saison">
        <select id="p-saison" disabled=${dis} value=${f.saison_id} onChange=${(e) => maj({ saison_id: e.target.value })}>
          ${ctx.data.saisons.map((s) => html`<option key=${s.id} value=${s.id}>${s.libelle}</option>`)}
        </select><//>
      <${Champ} id="p-debut" libelle="Date de début" erreur=${erreurs.date_debut}>
        <input id="p-debut" type="date" disabled=${dis} value=${f.date_debut} onInput=${(e) => maj({ date_debut: e.target.value })} /><//>
      <${Champ} id="p-fin" libelle="Date de fin" aide="Laisse vide pour un seul jour." erreur=${erreurs.date_fin}>
        <input id="p-fin" type="date" disabled=${dis} value=${f.date_fin} onInput=${(e) => maj({ date_fin: e.target.value })} /><//>
      <${Champ} id="p-type" libelle="Format">
        <select id="p-type" disabled=${dis} value=${f.type} onChange=${(e) => maj({ type: e.target.value, ...(e.target.value !== 'double' && (f.genre === 'mixte' || f.genre === 'uni') ? { genre: 'ouvert' } : {}) })}>
          ${Object.entries(TYPES_COMP).map(([k, v]) => html`<option key=${k} value=${k}>${v}</option>`)}
        </select><//>
      ${f.type === 'equipe' && html`<${Champ} id="p-nbs" libelle="Simples par rencontre" aide="Format fixé en début de saison (ex. 16 en D1, 9 en D2)."><input id="p-nbs" type="text" inputmode="numeric" disabled=${dis} value=${f.nb_simples} onInput=${(e) => maj({ nb_simples: e.target.value })} /><//>
      <${Champ} id="p-nbd" libelle="Doubles par rencontre" aide="Ex. 2 en D1, 1 en D2."><input id="p-nbd" type="text" inputmode="numeric" disabled=${dis} value=${f.nb_doubles} onInput=${(e) => maj({ nb_doubles: e.target.value })} /><//>`}
      <${Champ} id="p-genre" libelle="Genre" aide=${f.type === 'double' ? 'Mixte = 1 fille + 1 garçon ; Uni = 2 filles ou 2 garçons.' : 'Dames ou Messieurs : tableau réservé.'}>
        <select id="p-genre" disabled=${dis} value=${f.genre} onChange=${(e) => maj({ genre: e.target.value })}>
          ${Object.entries(GENRES).filter(([k]) => f.type === 'double' || (k !== 'mixte' && k !== 'uni')).map(([k, v]) => html`<option key=${k} value=${k}>${v}</option>`)}
        </select><//>
      <${Champ} id="p-cat" libelle="Catégorie" aide="U15 et moins : les plus jeunes peuvent jouer au-dessus de leur catégorie (surclassement). Vétérans : réservé aux 41 ans et plus.">
        <select id="p-cat" disabled=${dis} value=${f.categorie_min ? 'VET' : f.categorie_max} onChange=${(e) => maj(e.target.value === 'VET' ? { categorie_min: 'veteran', categorie_max: '' } : { categorie_min: '', categorie_max: e.target.value })}>
          ${Object.entries(CATEGORIES_MAX).map(([k, v]) => html`<option key=${k} value=${k}>${v}</option>`)}
        </select><//>
      <${Champ} id="p-coef" libelle="Coefficient" aide="Multiplie les points gagnés ou perdus à chaque match.">
        <select id="p-coef" disabled=${dis} value=${f.coefficient} onChange=${(e) => maj({ coefficient: e.target.value })}>
          ${COEFS.map((k) => html`<option key=${k} value=${k}>${Number(k).toLocaleString('fr-FR')}</option>`)}
        </select><//>
      <${Champ} id="p-pmax" libelle="Points maximum (classement)" aide="Vide = aucune limite. Ex. 599 : seuls les joueurs de 599 points et moins peuvent s'inscrire." erreur=${erreurs.points_max}>
        <input id="p-pmax" type="text" inputmode="numeric" disabled=${dis} value=${f.points_max} onInput=${(e) => maj({ points_max: e.target.value })} /><//>
      <${Champ} id="p-montant" libelle=${f.type === 'equipe' ? 'Montant par équipe (F CFP)' : 'Montant par participant (F CFP)'} erreur=${erreurs.montant}>
        <input id="p-montant" type="text" inputmode="numeric" disabled=${dis} value=${f.montant_xpf} onInput=${(e) => maj({ montant_xpf: e.target.value })} /><//>
      <${Champ} id="p-limite" libelle="Date limite d'inscription" aide="Après cette date, les clubs ne peuvent plus inscrire ni modifier." erreur=${erreurs.limite}>
        <input id="p-limite" type="date" disabled=${dis} value=${f.date_limite_inscription} onInput=${(e) => maj({ date_limite_inscription: e.target.value })} /><//>
      <div class="plein"><fieldset class="champ">
        <legend>Qui peut inscrire ?</legend>
        ${MODES_INSCRIPTION.map(([k, titre, detail]) => html`<div class="case" key=${k}>
          <input id=${'p-mode-' + k} type="radio" name="mode-inscription" disabled=${dis} checked=${modeInscription(f) === k} onChange=${() => maj(MODES_VALEURS[k])} />
          <label for=${'p-mode-' + k}><strong>${titre}</strong><br /><small>${detail}</small></label>
        </div>`)}
      </fieldset></div>
    </div>
    ${peut && html`<div class="actions">
      <button class="btn btn-primaire" type="submit" disabled=${!modifie || occupe}>${occupe ? 'Enregistrement…' : nouveau ? 'Créer la compétition' : 'Enregistrer'}</button>
      ${nouveau && html`<a class="btn btn-secondaire" href=${lien(['competitions'])}>Annuler</a>`}
    </div>`}
  </form><//>`;
}

function Etat({ ctx, c }) {
  const [occupe, setOccupe] = useState(false);
  const [suppr, setSuppr] = useState(false);
  const freres = ctx.estCadre && c.evenement_id ? ctx.competitions.filter((x) => x.evenement_id === c.evenement_id && x.statut === c.statut) : [];
  const [tous, setTous] = useState(true);
  async function changer(statut, message) {
    setOccupe(true);
    try {
      if (freres.length > 1 && tous) await api.changerStatutEvenement(c.id, statut);
      else await api.majCompetition(c.id, { statut });
      await ctx.recharger();
      toast(message);
    } catch (er) {
      toast(msgErreur(er), 'erreur');
    } finally {
      setOccupe(false);
    }
  }
  async function supprimer() {
    setOccupe(true);
    try {
      if (freres.length > 1 && tous) await api.supprimerEvenement(c.id);
      else await api.supprimerCompetition(c.id);
      await ctx.recharger();
      toast(freres.length > 1 && tous ? `${freres.length} tableaux supprimés.` : 'Compétition supprimée.');
      naviguer(['competitions']);
    } catch (er) {
      toast(msgErreur(er), 'erreur');
      setOccupe(false);
      setSuppr(false);
    }
  }
  const aujourdhui = aujourdhuiISO();
  const limitePassee = c.date_limite_inscription && c.date_limite_inscription < aujourdhui;
  return html`<${Pliable} titre="État" ouvert=${true}>
    <p><${Pastille} genre=${GENRE[c.statut]}>${STATUTS[c.statut]}<//></p>
    ${c.statut === 'brouillon' && html`<p class="aide">Invisible des clubs. Ouvre les inscriptions quand les informations sont prêtes.</p>
      ${!c.date_limite_inscription && html`<p class="avis">Pas de date limite : les clubs pourront s'inscrire jusqu'à la clôture.</p>`}
      ${limitePassee && html`<p class="avis avis-alerte">La date limite est déjà passée : aucun club ne pourra s'inscrire.</p>`}`}
    ${c.statut === 'ouverte' && html`<p class="aide">Les responsables de club peuvent inscrire leurs joueurs${c.date_limite_inscription ? ` jusqu'au ${fmtDate(c.date_limite_inscription)}` : ''}.</p>`}
    ${c.statut === 'cloturee' && html`<p class="aide">Les inscriptions sont figées. Les juges-arbitres peuvent saisir les scores.</p>`}
    ${freres.length > 1 && html`<div class="case">
      <input id="p-tous-tableaux" type="checkbox" checked=${tous} onChange=${(e) => setTous(e.target.checked)} />
      <label for="p-tous-tableaux">Appliquer à tous les tableaux de l'événement (ouverture, clôture, suppression) (${freres.length})</label>
    </div>`}
    <div class="actions">
      ${c.statut === 'brouillon' && html`<button class="btn btn-primaire" type="button" disabled=${occupe} onClick=${() => changer('ouverte', 'Inscriptions ouvertes.')}>Ouvrir les inscriptions</button>
        ${(ctx.estCadre || (ctx.moi && c.created_by === ctx.moi.id)) && html`<button class="btn btn-danger" type="button" disabled=${occupe} onClick=${() => setSuppr(true)}>Supprimer</button>`}`}
      ${c.statut === 'ouverte' && html`<button class="btn btn-primaire" type="button" disabled=${occupe} onClick=${() => changer('cloturee', 'Inscriptions closes.')}>Clôturer les inscriptions</button>`}
      ${c.statut === 'cloturee' && html`${ctx.estCadre && html`<button class="btn btn-primaire" type="button" disabled=${occupe} onClick=${() => changer('terminee', 'Compétition terminée.')}>Marquer comme terminée</button>`}
        <button class="btn btn-secondaire" type="button" disabled=${occupe} onClick=${() => changer('ouverte', 'Inscriptions rouvertes.')}>Rouvrir les inscriptions</button>`}
      ${c.statut === 'terminee' && ctx.estCadre && html`<button class="btn btn-secondaire" type="button" disabled=${occupe} onClick=${() => changer('cloturee', 'Compétition réouverte aux scores.')}>Revenir à « inscriptions closes »</button>`}
    </div>
    ${suppr && html`<${Dialogue} titre=${freres.length > 1 && tous ? 'Supprimer tout l\'événement ?' : 'Supprimer ce brouillon ?'} onFermer=${() => setSuppr(false)}>
      <p>${freres.length > 1 && tous ? `« ${c.nom} » et les ${freres.length - 1} autres tableaux en brouillon de l'événement seront supprimés définitivement.` : `« ${c.nom} » sera supprimée définitivement.`}</p>
      <div class="actions">
        <button class="btn btn-danger" type="button" disabled=${occupe} onClick=${supprimer}>Supprimer</button>
        <button class="btn btn-secondaire" type="button" onClick=${() => setSuppr(false)}>Annuler</button>
      </div><//>`}
  <//>`;
}

const CATS_TABLEAUX = [['', 'Open'], ['VET', 'Vétérans'], ['U19', 'U19'], ['U15', 'U15'], ['U13', 'U13'], ['U12', 'U12'], ['U11', 'U11']];
const GENRES_SIMPLE = [['messieurs', 'Messieurs'], ['dames', 'Dames'], ['ouvert', 'Mixte']];
const DOUBLES = [['messieurs', 'Double messieurs'], ['dames', 'Double dames'], ['mixte', 'Double mixte'], ['uni', 'Double uni'], ['vet', 'Double vétérans']];

function CarteTableaux({ ctx, c }) {
  const [ouvert, setOuvert] = useState(false);
  const [evt, setEvt] = useState(c.nom);
  const [montant, setMontant] = useState(String(c.montant_xpf));
  const [sel, setSel] = useState({});
  const [occupe, setOccupe] = useState(false);
  const freres = c.evenement_id ? ctx.competitions.filter((x) => x.evenement_id === c.evenement_id && x.id !== c.id) : [];
  const bascule = (k) => setSel((s) => ({ ...s, [k]: !s[k] }));
  const lignes = [];
  for (const [cat, catLib] of CATS_TABLEAUX) for (const [g, gLib] of GENRES_SIMPLE) lignes.push({ k: `s|${cat}|${g}`, nom: `${evt.trim()} – Simple ${catLib} ${gLib}`, type: 'simple', genre: g, categorie_max: cat === 'VET' ? '' : cat, categorie_min: cat === 'VET' ? 'veteran' : '' });
  for (const [g, lib] of DOUBLES) lignes.push({ k: `d||${g}`, nom: `${evt.trim()} – ${lib}`, type: 'double', genre: g === 'vet' ? 'ouvert' : g, categorie_max: '', categorie_min: g === 'vet' ? 'veteran' : '' });
  const choisis = lignes.filter((l) => sel[l.k]);
  async function creer() {
    if (!/^\d+$/.test(montant.trim()) || !evt.trim()) { toast('Vérifie le nom et le montant.', 'erreur'); return; }
    setOccupe(true);
    try {
      const n = await api.creerTableaux(c.id, choisis.map((l) => ({ nom: l.nom, type: l.type, genre: l.genre, categorie_max: l.categorie_max, categorie_min: l.categorie_min, montant_xpf: parseInt(montant, 10) })));
      await ctx.recharger();
      toast(`${n} tableau${n > 1 ? 'x créés' : ' créé'} en brouillon.`);
      setOuvert(false);
      setSel({});
    } catch (er) {
      toast(msgErreur(er), 'erreur');
    } finally {
      setOccupe(false);
    }
  }
  return html`<${Pliable} titre="Tableaux" ouvert=${false}>
    <p class="aide">Pour un championnat avec plusieurs tableaux (U19, U15, doubles…), chaque tableau est une compétition à part avec ses inscriptions, sa facture et ses scores. Les dates, le lieu, le coefficient et les juges sont copiés depuis celle-ci.</p>
    ${freres.length > 0 && html`<ul class="liste">${freres.map((x) => html`<li key=${x.id}><a class="ligne" style="display:flex" href=${lien(['competitions', x.id])}>
      <span class="ligne-nom"><strong>${x.nom}</strong></span>
      <span class="etiquettes"><${Pastille} genre=${GENRE[x.statut]}>${STATUTS[x.statut]}<//></span></a></li>`)}</ul>`}
    ${ctx.estCadre && html`<div class="actions"><button class="btn btn-secondaire" type="button" onClick=${() => setOuvert(true)}>Ajouter des tableaux</button></div>`}
    ${ouvert && html`<${Dialogue} titre="Ajouter des tableaux" onFermer=${() => setOuvert(false)}>
      <${Champ} id="t-evt" libelle="Nom de l'événement"><input id="t-evt" type="text" value=${evt} onInput=${(e) => setEvt(e.target.value)} /><//>
      <${Champ} id="t-montant" libelle="Montant par participant (F CFP)"><input id="t-montant" type="text" inputmode="numeric" value=${montant} onInput=${(e) => setMontant(e.target.value)} /><//>
      <p><strong>Simples</strong></p>
      ${CATS_TABLEAUX.map(([cat, catLib]) => html`<div key=${cat} class="puces" role="group" aria-label=${catLib}>
        ${GENRES_SIMPLE.map(([g, gLib]) => { const k = `s|${cat}|${g}`; return html`<button key=${k} type="button" class="puce" aria-pressed=${!!sel[k]} onClick=${() => bascule(k)}>${catLib} ${gLib}</button>`; })}
      </div>`)}
      <p><strong>Doubles</strong></p>
      <div class="puces" role="group" aria-label="Doubles">
        ${DOUBLES.map(([g, lib]) => { const k = `d||${g}`; return html`<button key=${k} type="button" class="puce" aria-pressed=${!!sel[k]} onClick=${() => bascule(k)}>${lib}</button>`; })}
      </div>
      <p class="aide">Les tableaux par équipes se créent en choisissant le format « Par équipe » dans la fiche de la compétition. ${choisis.length} tableau${choisis.length > 1 ? 'x' : ''} choisi${choisis.length > 1 ? 's' : ''}.</p>
      <div class="actions">
        <button class="btn btn-primaire" type="button" disabled=${occupe || choisis.length === 0} onClick=${creer}>${occupe ? 'Création…' : 'Créer en brouillon'}</button>
        <button class="btn btn-secondaire" type="button" onClick=${() => setOuvert(false)}>Annuler</button>
      </div><//>`}
  <//>`;
}

export function PageCompetition({ ctx, id }) {
  const c = id === 'nouveau' ? null : ctx.competitionParId.get(id);
  if (id !== 'nouveau' && !c) {
    return html`<div class="page"><a class="retour" href=${lien(['competitions'])}><${Icone} nom="retour" taille=${20} /> Compétitions</a><p class="vide">Compétition introuvable.</p></div>`;
  }
  if (id === 'nouveau' && !ctx.peutCreerComp) {
    return html`<div class="page"><p class="vide">Seuls le cadre fédéral et les juges-arbitres peuvent créer une compétition.</p></div>`;
  }
  return html`<div class="page">
    <a class="retour" href=${lien(['competitions'])}><${Icone} nom="retour" taille=${20} /> Compétitions</a>
    <div class="page-tete"><div><h1>${c ? c.nom : 'Nouvelle compétition'}</h1>
      ${c && html`<p>${dates(c)}${c.lieu ? ' · ' + c.lieu : ''} · ${TYPES_COMP[c.type]} · Coef. ${Number(c.coefficient).toLocaleString('fr-FR')} · ${fmtXpf(c.montant_xpf)} par ${c.type === 'equipe' ? 'équipe' : 'participant'}</p>`}</div></div>
    ${c && ctx.peutGererComp(c.id) && html`<${Etat} ctx=${ctx} c=${c} />`}
    ${c && c.type !== 'equipe' && html`<${CarteMatchs} ctx=${ctx} c=${c} />`}
    ${c && c.type === 'equipe' && html`<${CarteRencontres} ctx=${ctx} c=${c} />`}
    ${c && c.type === 'equipe' && html`<${CarteTours} ctx=${ctx} c=${c} />`}
    ${c && (ctx.estCadre || c.evenement_id) && html`<${CarteTableaux} ctx=${ctx} c=${c} />`}
    ${c && html`<${CarteInscriptions} ctx=${ctx} c=${c} />`}
    ${c && html`<${CarteJuges} ctx=${ctx} c=${c} />`}
    ${c && html`<${CarteFacturation} ctx=${ctx} c=${c} />`}
    <${Formulaire} ctx=${ctx} c=${c} />
  </div>`;
}
