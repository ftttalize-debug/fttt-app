// Page d'accueil : chiffres clés de la saison.
import { html } from '../preact.js';
import { lien, TYPES_LICENCE, nomComplet } from '../lib.js';
import { Pastille } from '../ui.js';

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
  const mineurs = actifs.filter((l) => l.age !== null && l.age < 18);
  const certificats = licencies.filter((l) => l.alerteCertificat);
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
      <div class="stat">
        <div class="stat-valeur">${mineurs.length}</div><div class="stat-libelle">Mineurs actifs</div></div>
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
      <a class=${'stat' + (certificats.length ? ' stat-alerte' : '')} href=${lien(['licencies'], { alerte: 'certificat' })}>
        <div class="stat-valeur">${certificats.length}</div><div class="stat-libelle">Certificats médicaux à fournir</div></a>
    </div>
  </div>`;
}
