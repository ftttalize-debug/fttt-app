// Compétitions : liste, création, modification, ouverture et clôture (cadre fédéral).
import { html, useState, useEffect } from '../preact.js';
import { api } from '../data.js';
import { lien, naviguer, fmtDate, aujourdhuiISO, msgErreur } from '../lib.js';
import { Icone, Pastille, Champ, Dialogue, toast } from '../ui.js';
import { CarteInscriptions } from './inscriptions.js';

export const TYPES_COMP = { simple: 'Simple', double: 'Double', equipe: 'Par équipe' };
const STATUTS = { brouillon: 'Brouillon', ouverte: 'Inscriptions ouvertes', cloturee: 'Inscriptions closes', terminee: 'Terminée' };
const GENRE = { brouillon: 'neutre', ouverte: 'actif', cloturee: 'alerte', terminee: 'archive' };
const COEFS = ['0.50', '0.75', '1.00', '1.25', '1.50'];
export const fmtXpf = (n) => `${Number(n || 0).toLocaleString('fr-FR').replace(/ /g, ' ')} F`;
const dates = (c) => (c.date_debut === c.date_fin ? fmtDate(c.date_debut) : `${fmtDate(c.date_debut)} – ${fmtDate(c.date_fin)}`);

export function PageCompetitions({ ctx, route }) {
  const { competitions, estCadre } = ctx;
  const statut = route.query.statut || 'toutes';
  const liste = competitions.filter((c) => statut === 'toutes' || c.statut === statut);
  const puces = [['toutes', 'Toutes'], ['ouverte', 'Ouvertes'], ['cloturee', 'Closes'], ['terminee', 'Terminées']];
  if (estCadre) puces.splice(1, 0, ['brouillon', 'Brouillons']);
  return html`<div class="page">
    <div class="page-tete">
      <div><h1>Compétitions</h1><p>${competitions.length} compétition${competitions.length > 1 ? 's' : ''}</p></div>
      ${estCadre && html`<div class="page-actions"><a class="btn btn-primaire" href=${lien(['competitions', 'nouveau'])}><${Icone} nom="plus" taille=${20} /> Nouvelle compétition</a></div>`}
    </div>
    <div class="puces" role="group" aria-label="Statut">
      ${puces.map(([v, label]) => html`<button key=${v} type="button" class="puce" aria-pressed=${statut === v}
        onClick=${() => naviguer(['competitions'], v === 'toutes' ? {} : { statut: v }, true)}>${label}</button>`)}
    </div>
    ${liste.length === 0 ? html`<p class="vide">Aucune compétition.</p>` : html`<ul class="liste">
      ${liste.map((c) => html`<li key=${c.id}>
        <a class="ligne" style="display:flex" href=${lien(['competitions', c.id])}>
          <span class="ligne-nom"><strong>${c.nom}</strong><small>${dates(c)}${c.lieu ? ' · ' + c.lieu : ''}</small></span>
          <span class="etiquettes">
            <${Pastille} genre=${GENRE[c.statut]}>${STATUTS[c.statut]}<//>
            <${Pastille}>${TYPES_COMP[c.type]}<//>
            <${Pastille}>Coef. ${Number(c.coefficient).toLocaleString('fr-FR')}<//>
          </span>
        </a>
      </li>`)}
    </ul>`}
  </div>`;
}

const vide = (ctx) => ({
  nom: '', saison_id: ctx.saison?.id || '', lieu: '', date_debut: '', date_fin: '', type: 'simple',
  coefficient: '1.00', montant_xpf: '0', date_limite_inscription: '', ouverte_a_tous: false
});
const depuis = (c) => ({
  nom: c.nom, saison_id: c.saison_id, lieu: c.lieu || '', date_debut: c.date_debut, date_fin: c.date_fin, type: c.type,
  coefficient: Number(c.coefficient).toFixed(2), montant_xpf: String(c.montant_xpf), date_limite_inscription: c.date_limite_inscription || '',
  ouverte_a_tous: !!c.ouverte_a_tous
});
const norme = (f) => ({
  nom: f.nom.trim(), saison_id: f.saison_id, lieu: f.lieu.trim() || null, date_debut: f.date_debut, date_fin: f.date_fin || f.date_debut,
  type: f.type, coefficient: Number(f.coefficient), montant_xpf: parseInt(f.montant_xpf, 10),
  date_limite_inscription: f.date_limite_inscription || null, ouverte_a_tous: !!f.ouverte_a_tous
});

function valider(f) {
  const e = {};
  if (!f.nom.trim()) e.nom = 'Obligatoire.';
  if (!f.date_debut) e.date_debut = 'Obligatoire.';
  if (f.date_fin && f.date_debut && f.date_fin < f.date_debut) e.date_fin = 'La fin ne peut pas précéder le début.';
  if (f.date_limite_inscription && f.date_debut && f.date_limite_inscription > f.date_debut) e.limite = 'La date limite doit précéder le début.';
  if (!/^\d+$/.test(f.montant_xpf.trim())) e.montant = 'Nombre entier, 0 si gratuit.';
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
  const peut = ctx.estCadre;

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
  return html`<form class="carte" onSubmit=${enregistrer} noValidate>
    <h2>Informations</h2>
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
        <select id="p-type" disabled=${dis} value=${f.type} onChange=${(e) => maj({ type: e.target.value })}>
          ${Object.entries(TYPES_COMP).map(([k, v]) => html`<option key=${k} value=${k}>${v}</option>`)}
        </select><//>
      <${Champ} id="p-coef" libelle="Coefficient" aide="Multiplie les points gagnés ou perdus à chaque match.">
        <select id="p-coef" disabled=${dis} value=${f.coefficient} onChange=${(e) => maj({ coefficient: e.target.value })}>
          ${COEFS.map((k) => html`<option key=${k} value=${k}>${Number(k).toLocaleString('fr-FR')}</option>`)}
        </select><//>
      <${Champ} id="p-montant" libelle="Montant par participant (F CFP)" erreur=${erreurs.montant}>
        <input id="p-montant" type="text" inputmode="numeric" disabled=${dis} value=${f.montant_xpf} onInput=${(e) => maj({ montant_xpf: e.target.value })} /><//>
      <${Champ} id="p-limite" libelle="Date limite d'inscription" aide="Après cette date, les clubs ne peuvent plus inscrire ni modifier." erreur=${erreurs.limite}>
        <input id="p-limite" type="date" disabled=${dis} value=${f.date_limite_inscription} onInput=${(e) => maj({ date_limite_inscription: e.target.value })} /><//>
      <div class="plein"><div class="case">
        <input id="p-tous" type="checkbox" disabled=${dis} checked=${f.ouverte_a_tous} onChange=${(e) => maj({ ouverte_a_tous: e.target.checked })} />
        <label for="p-tous">Ouverte à tous (toutes les licences peuvent s'inscrire, y compris loisir et événementielle)</label>
      </div></div>
    </div>
    ${peut && html`<div class="actions">
      <button class="btn btn-primaire" type="submit" disabled=${!modifie || occupe}>${occupe ? 'Enregistrement…' : nouveau ? 'Créer la compétition' : 'Enregistrer'}</button>
      ${nouveau && html`<a class="btn btn-secondaire" href=${lien(['competitions'])}>Annuler</a>`}
    </div>`}
  </form>`;
}

function Etat({ ctx, c }) {
  const [occupe, setOccupe] = useState(false);
  const [suppr, setSuppr] = useState(false);
  async function changer(statut, message) {
    setOccupe(true);
    try {
      await api.majCompetition(c.id, { statut });
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
      await api.supprimerCompetition(c.id);
      await ctx.recharger();
      toast('Compétition supprimée.');
      naviguer(['competitions']);
    } catch (er) {
      toast(msgErreur(er), 'erreur');
      setOccupe(false);
      setSuppr(false);
    }
  }
  const aujourdhui = aujourdhuiISO();
  const limitePassee = c.date_limite_inscription && c.date_limite_inscription < aujourdhui;
  return html`<section class="carte" aria-label="État de la compétition">
    <h2>État</h2>
    <p><${Pastille} genre=${GENRE[c.statut]}>${STATUTS[c.statut]}<//></p>
    ${c.statut === 'brouillon' && html`<p class="aide">Invisible des clubs. Ouvre les inscriptions quand les informations sont prêtes.</p>
      ${!c.date_limite_inscription && html`<p class="avis">Pas de date limite : les clubs pourront s'inscrire jusqu'à la clôture.</p>`}
      ${limitePassee && html`<p class="avis avis-alerte">La date limite est déjà passée : aucun club ne pourra s'inscrire.</p>`}`}
    ${c.statut === 'ouverte' && html`<p class="aide">Les responsables de club peuvent inscrire leurs joueurs${c.date_limite_inscription ? ` jusqu'au ${fmtDate(c.date_limite_inscription)}` : ''}.</p>`}
    ${c.statut === 'cloturee' && html`<p class="aide">Les inscriptions sont figées. Les juges-arbitres peuvent saisir les scores.</p>`}
    <div class="actions">
      ${c.statut === 'brouillon' && html`<button class="btn btn-primaire" type="button" disabled=${occupe} onClick=${() => changer('ouverte', 'Inscriptions ouvertes.')}>Ouvrir les inscriptions</button>
        <button class="btn btn-danger" type="button" disabled=${occupe} onClick=${() => setSuppr(true)}>Supprimer</button>`}
      ${c.statut === 'ouverte' && html`<button class="btn btn-primaire" type="button" disabled=${occupe} onClick=${() => changer('cloturee', 'Inscriptions closes.')}>Clôturer les inscriptions</button>`}
      ${c.statut === 'cloturee' && html`<button class="btn btn-primaire" type="button" disabled=${occupe} onClick=${() => changer('terminee', 'Compétition terminée.')}>Marquer comme terminée</button>
        <button class="btn btn-secondaire" type="button" disabled=${occupe} onClick=${() => changer('ouverte', 'Inscriptions rouvertes.')}>Rouvrir les inscriptions</button>`}
      ${c.statut === 'terminee' && html`<button class="btn btn-secondaire" type="button" disabled=${occupe} onClick=${() => changer('cloturee', 'Compétition réouverte aux scores.')}>Revenir à « inscriptions closes »</button>`}
    </div>
    ${suppr && html`<${Dialogue} titre="Supprimer ce brouillon ?" onFermer=${() => setSuppr(false)}>
      <p>« ${c.nom} » sera supprimée définitivement.</p>
      <div class="actions">
        <button class="btn btn-danger" type="button" disabled=${occupe} onClick=${supprimer}>Supprimer</button>
        <button class="btn btn-secondaire" type="button" onClick=${() => setSuppr(false)}>Annuler</button>
      </div><//>`}
  </section>`;
}

export function PageCompetition({ ctx, id }) {
  const c = id === 'nouveau' ? null : ctx.competitionParId.get(id);
  if (id !== 'nouveau' && !c) {
    return html`<div class="page"><a class="retour" href=${lien(['competitions'])}><${Icone} nom="retour" taille=${20} /> Compétitions</a><p class="vide">Compétition introuvable.</p></div>`;
  }
  if (id === 'nouveau' && !ctx.estCadre) {
    return html`<div class="page"><p class="vide">Seul le cadre fédéral peut créer une compétition.</p></div>`;
  }
  return html`<div class="page">
    <a class="retour" href=${lien(['competitions'])}><${Icone} nom="retour" taille=${20} /> Compétitions</a>
    <div class="page-tete"><div><h1>${c ? c.nom : 'Nouvelle compétition'}</h1>
      ${c && html`<p>${dates(c)}${c.lieu ? ' · ' + c.lieu : ''} · ${TYPES_COMP[c.type]} · Coef. ${Number(c.coefficient).toLocaleString('fr-FR')} · ${fmtXpf(c.montant_xpf)} par participant</p>`}</div></div>
    ${c && ctx.estCadre && html`<${Etat} ctx=${ctx} c=${c} />`}
    ${c && html`<${CarteInscriptions} ctx=${ctx} c=${c} />`}
    <${Formulaire} ctx=${ctx} c=${c} />
  </div>`;
}
