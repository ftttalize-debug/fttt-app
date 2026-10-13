// Page d'accueil : chiffres clés de la saison.
import { html } from '../preact.js';
import { lien, TYPES_LICENCE, nomComplet, aujourdhuiISO } from '../lib.js';
import { Pastille } from '../ui.js';
import { etatCertificat } from './certificats.js';

export function PageAccueil({ ctx }) {
  const { saison, licencies, moi, estCadre, estResponsable, clubs } = ctx;

  if (!estCadre && !estResponsable) {
    return html`<div class="page">
      <div class="page-tete"><div><h1>Bonjour ${moi.prenom}</h1><p>Saison ${saison?.libelle}</p></div></div>
      <div class="carte">
        <p>Retrouve ta fiche, tes coordonnées et ton classement.</p>
        <div class="actions"><a class="btn btn-primaire" href=${lien(['profil'])}>Voir ma fiche</a></div>
      </div>
    </div>`;
  }

  const actifs = licencies.filter((l) => l.statut === 'actif');
  const archives = licencies.filter((l) => l.statut === 'archive');
  const auj = aujourdhuiISO();
  const nbCompetitions = (ctx.competitions || []).filter((c) => c.statut !== 'brouillon' && c.saison_id === saison?.id && c.date_fin >= auj).length;
  const nbAlertes = licencies.filter((l) => etatCertificat(l)).length;
  const parType = {};
  for (const l of actifs) {
    const t = l.courante?.type;
    if (t) parType[t] = (parType[t] || 0) + 1;
  }
  const clubsActifs = clubs.filter((c) => c.actif).length;

  return html`<div class="page">
    <div class="page-tete">
      <div><h1>Accueil</h1><p>Saison ${saison?.libelle} · ${estCadre ? 'cadre fédéral' : 'responsable de club'} · ${nomComplet(moi)}</p></div>
      ${estCadre && html`<div class="page-actions"><a class="btn btn-primaire" href=${lien(['licencies', 'nouveau'])}>Nouveau licencié</a></div>`}
    </div>

    <div class="stats">
      <a class="stat" href=${lien(['licencies'], { statut: 'actif' })}>
        <div class="stat-valeur">${actifs.length}</div><div class="stat-libelle">Licenciés actifs</div></a>
      <a class="stat" href=${lien(['licencies'], { statut: 'archive' })}>
        <div class="stat-valeur">${archives.length}</div><div class="stat-libelle">Fiches archivées</div></a>
      <a class="stat" id="stat-competitions" href=${lien(['competitions'])}>
        <div class="stat-valeur">${nbCompetitions}</div><div class="stat-libelle">Compétitions à venir</div></a>
      ${estCadre
        ? html`<a class="stat" href=${lien(['clubs'])}><div class="stat-valeur">${clubsActifs}</div><div class="stat-libelle">Clubs actifs</div></a>`
        : html`<a class="stat" href=${lien(['clubs'])}><div class="stat-valeur">${clubs.length}</div><div class="stat-libelle">Mon club</div></a>`}
    </div>

    <div class="carte">
      <h2>Licences ${saison?.libelle}</h2>
      ${Object.keys(parType).length === 0
        ? html`<p class="aide">Aucune licence enregistrée pour cette saison.</p>`
        : html`<div class="repartition">
            ${Object.entries(TYPES_LICENCE).filter(([k]) => parType[k]).map(([k, label]) =>
              html`<${Pastille} genre="actif" key=${k}>${label} : ${parType[k]}<//>`)}
          </div>`}
    </div>

    <div class="stats">
      <a class=${'stat' + (nbAlertes ? ' stat-alerte' : '')} id="stat-certificats" href=${lien(['certificats'])}>
        <div class="stat-valeur">${nbAlertes}</div><div class="stat-libelle">Certificats à suivre</div></a>
    </div>
  </div>`;
}
