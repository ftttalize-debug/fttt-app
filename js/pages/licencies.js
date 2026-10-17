// Liste des licenciés : recherche, filtres, export CSV.
import { html, useState, useMemo } from '../preact.js';
import { lien, naviguer, estMineur, norm, fmtPts, fmtDate, aujourdhuiISO, telechargerCsv, nomComplet, ageExact, categorie, CATEGORIES, TYPES_LICENCE } from '../lib.js';
import { Icone, Pastille, Pliable } from '../ui.js';

const PAGE = 40;
const repManquant = (l) => l.statut === 'actif' && estMineur(l.date_naissance) && !l.representant_legal_id && !l.representant_nom;

/** Liste réglementaire des licenciés au 31 mai d'une année, avec toutes leurs informations (CSV lisible par Excel). */
function CarteListe31Mai({ ctx }) {
  const annees = [...new Set(ctx.saisons.map((s) => Number(String(s.date_debut).slice(0, 4)) + 1))].sort((a, b) => b - a);
  const dejaPasse = annees.find((a) => `${a}-05-31` <= aujourdhuiISO());
  const [annee, setAnnee] = useState(dejaPasse || annees[0]);
  if (!annees.length) return null;
  const ref = `${annee}-05-31`;
  const saison = ctx.saisons.find((s) => s.date_debut <= ref && ref <= s.date_fin);
  const lignes = saison ? ctx.licencies.filter((l) => !l.annuaire).map((l) => ({ l, lc: (l.historique || []).find((x) => x.saison_id === saison.id && x.statut === 'active') })).filter((x) => x.lc) : [];
  function exporter() {
    const d = new Date(ref + 'T12:00:00');
    const entetes = ['N° de licence', 'N° de licence saison', 'Nom', 'Prénom', 'Sexe', 'Date de naissance', `Âge au 31/05/${annee}`, 'Catégorie', 'Club', 'Type de licence', 'Saison', 'Licence délivrée le',
      'Certificat médical', 'Type de certificat', 'Date du certificat', 'Questionnaire de santé', 'Handicap', 'Points', 'Adresse', 'Commune', 'Île', 'E-mail', 'Téléphone', 'Représentant légal', 'Tél. représentant', 'E-mail représentant'];
    const rows = lignes.map(({ l, lc }) => {
      const rep = l.representant_nom || (l.representant_legal_id ? nomComplet(ctx.licencieParId.get(l.representant_legal_id) || {}) : '');
      return [l.numero_licence || '', lc.numero || '', l.nom, l.prenom, l.sexe, fmtDate(l.date_naissance), ageExact(l.date_naissance, d), categorie(l.date_naissance, d),
        ctx.clubParId.get(lc.club_id)?.nom || l.clubNom, TYPES_LICENCE[lc.type] || lc.type, saison.libelle, fmtDate(String(lc.created_at).slice(0, 10)),
        lc.certificat_fourni ? 'Reçu' : 'Manquant', lc.certificat_type || '', lc.certificat_date ? fmtDate(lc.certificat_date) : '', lc.questionnaire_fourni ? 'Oui' : '',
        l.handicap ? 'Oui' : 'Non', fmtPts(l.points), l.adresse || '', l.commune || '', l.ile || '', l.email || '', l.telephone || '', rep, l.representant_telephone || '', l.representant_email || ''];
    }).sort((a, b) => norm(a[2]).localeCompare(norm(b[2])) || norm(a[3]).localeCompare(norm(b[3])));
    telechargerCsv(`licencies-au-31-mai-${annee}.csv`, entetes, rows);
  }
  return html`<${Pliable} titre="Liste des licenciés au 31 mai" sous="Obligation réglementaire : tous les licenciés avec leurs informations" ouvert=${false}>
    <div class="filtres-ligne"><select aria-label="Année" value=${annee} onChange=${(e) => setAnnee(Number(e.target.value))}>
      ${annees.map((a) => html`<option key=${a} value=${a}>Au 31 mai ${a}</option>`)}</select></div>
    ${saison ? html`<p class="aide">Saison ${saison.libelle} · ${lignes.length} licencié${lignes.length > 1 ? 's' : ''} avec une licence active. Le fichier contient l'identité, l'adresse (quartier ou rue, commune, île), le club, le type de licence, le certificat médical, les contacts et le représentant légal des mineurs. Données personnelles : à conserver et transmettre avec précaution.</p>
      <button class="btn btn-primaire" type="button" disabled=${!lignes.length} onClick=${exporter}><${Icone} nom="telecharger" taille=${18} /> Télécharger la liste au 31 mai ${annee} (CSV)</button>`
      : html`<p class="vide">Aucune saison ne couvre le 31 mai ${annee}.</p>`}
  <//>`;
}

export function PageLicencies({ ctx, route }) {
  const { licenciesGeres: licencies, clubs, saison, estCadre } = ctx;
  const q = route.query;
  const statut = q.statut || 'tous';
  const [texte, setTexte] = useState('');
  const [nb, setNb] = useState(PAGE);

  const change = (cle, valeur) => {
    setNb(PAGE);
    naviguer(['licencies'], { ...q, [cle]: valeur }, true);
  };

  const liste = useMemo(() => {
    const mots = norm(texte).split(/\s+/).filter(Boolean);
    return licencies
      .filter((l) => (statut === 'tous' ? true : l.statut === statut))
      .filter((l) => (q.club ? l.club_id === q.club : true))
      .filter((l) => (q.cat ? l.categorie === q.cat : true))
      .filter((l) => {
        if (!q.type) return true;
        if (q.type === 'aucune') return !l.courante;
        return l.courante?.type === q.type;
      })
      .filter((l) => (q.alerte === 'certificat' ? l.alerteCertificat : true))
      .filter((l) => (q.alerte === 'representant' ? repManquant(l) : true))
      .filter((l) => {
        if (!mots.length) return true;
        const cle = norm(`${l.prenom} ${l.nom} ${l.clubNom} ${l.numero_licence || ''}`);
        return mots.every((m) => cle.includes(m));
      })
      .sort((a, b) => norm(a.nom).localeCompare(norm(b.nom)) || norm(a.prenom).localeCompare(norm(b.prenom)));
  }, [licencies, texte, statut, q.club, q.cat, q.type, q.alerte]);

  function exporter() {
    const entetes = ['N° de licence', 'Nom', 'Prénom', 'Date de naissance', 'Sexe', 'Club', 'Catégorie', 'Points', 'Statut', `Licence ${saison?.libelle || ''}`, 'E-mail', 'Téléphone'];
    const lignes = liste.map((l) => [
      l.numero_licence || '', l.nom, l.prenom, fmtDate(l.date_naissance), l.sexe, l.clubNom, l.categorie, fmtPts(l.points),
      l.statut === 'actif' ? 'Actif' : 'Archivé', l.courante ? TYPES_LICENCE[l.courante.type] : '', l.email || '', l.telephone || ''
    ]);
    telechargerCsv(`licencies-${aujourdhuiISO()}.csv`, entetes, lignes);
  }

  const visibles = liste.slice(0, nb);

  return html`<div class="page">
    <div class="page-tete">
      <div><h1>Licenciés</h1><p>Saison ${saison?.libelle}</p></div>
      <div class="page-actions">
        <button class="btn btn-secondaire" type="button" onClick=${exporter} disabled=${!liste.length}>
          <${Icone} nom="telecharger" taille=${20} /> Exporter (CSV)
        </button>
        ${estCadre && html`<a class="btn btn-primaire" href=${lien(['licencies', 'nouveau'])}><${Icone} nom="plus" taille=${20} /> Nouveau licencié</a>`}
      </div>
    </div>

    ${estCadre && html`<${CarteListe31Mai} ctx=${ctx} />`}

    <section class="carte filtres" aria-label="Filtres">
      <div class="recherche">
        <${Icone} nom="recherche" taille=${20} />
        <input type="search" aria-label="Rechercher un licencié" placeholder="Nom, prénom ou club" value=${texte}
          onInput=${(e) => { setTexte(e.target.value); setNb(PAGE); }} />
      </div>
      <div class="puces" role="group" aria-label="Statut">
        ${[['tous', 'Tous'], ['actif', 'Actifs'], ['archive', 'Archivés']].map(([v, label]) => html`
          <button key=${v} type="button" class="puce" aria-pressed=${statut === v}
            onClick=${() => change('statut', v === 'tous' ? '' : v)}>${label}</button>`)}
      </div>
      <div class="filtres-ligne">
        ${clubs.length > 1 && html`<select aria-label="Club" value=${q.club || ''} onChange=${(e) => change('club', e.target.value)}>
          <option value="">Tous les clubs</option>
          ${clubs.map((c) => html`<option key=${c.id} value=${c.id}>${c.nom}</option>`)}
        </select>`}
        <select aria-label="Catégorie" value=${q.cat || ''} onChange=${(e) => change('cat', e.target.value)}>
          <option value="">Toutes les catégories</option>
          ${CATEGORIES.map((c) => html`<option key=${c} value=${c}>${c}</option>`)}
        </select>
        <select aria-label="Type de licence" value=${q.type || ''} onChange=${(e) => change('type', e.target.value)}>
          <option value="">Tous les types de licence</option>
          ${Object.entries(TYPES_LICENCE).map(([k, v]) => html`<option key=${k} value=${k}>${v}</option>`)}
          <option value="aucune">Sans licence ${saison?.libelle}</option>
        </select>
        <select aria-label="Pièces du dossier" value=${q.alerte || ''} onChange=${(e) => change('alerte', e.target.value)}>
          <option value="">Dossiers : tous</option>
          <option value="certificat">Certificat manquant</option>
          <option value="representant">Représentant légal à renseigner</option>
        </select>
      </div>
    </section>

    <p class="compte-resultats" role="status">${liste.length} licencié${liste.length > 1 ? 's' : ''}</p>

    ${liste.length === 0
      ? html`<p class="vide">Aucun licencié ne correspond à ces critères.</p>`
      : html`<div>
          <div class="entete-liste" aria-hidden="true"><span>Joueur</span><span>Catégorie</span><span>Licence</span><span>Points</span></div>
          <ul class="liste">
            ${visibles.map((l) => html`<li key=${l.id}>
              <a class=${'ligne' + (l.statut === 'archive' ? ' ligne-archive' : '')} href=${lien(['licencies', l.id])}>
                <span class="ligne-nom"><strong>${l.prenom} ${l.nom}</strong><small>${l.clubNom}${l.numero_licence ? " · " + l.numero_licence : ""}</small></span>
                <span><${Pastille} genre="categorie">${l.categorie}<//></span>
                <span class="etiquettes">
                  <${Pastille} genre=${l.statut === 'actif' ? 'actif' : 'archive'}>${l.statut === 'actif' ? 'Actif' : 'Archivé'}<//>
                  ${l.courante && html`<${Pastille}>${TYPES_LICENCE[l.courante.type]}<//>`}
                  ${l.alerteCertificat && html`<${Pastille} genre="alerte">Certificat manquant<//>`}
                  ${repManquant(l) && html`<${Pastille} genre="alerte">Représentant à renseigner<//>`}
                </span>
                <span class="ligne-pts">${fmtPts(l.points)} <small>pts</small></span>
              </a>
            </li>`)}
          </ul>
        </div>`}

    ${liste.length > nb && html`<button class="btn btn-secondaire suite" type="button" onClick=${() => setNb(nb + PAGE)}>
      Afficher la suite · ${nb} sur ${liste.length}
    </button>`}
  </div>`;
}
