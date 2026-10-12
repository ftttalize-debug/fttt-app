// Données préparées pour l'affichage (club, catégorie, licence de la saison en cours…).
import { categorie, ageExact, saisonCourante, aujourdhuiISO } from './lib.js';

export function construireContexte(data, session) {
  const { saisons, clubs, licencies, licences, roles, competitions = [] } = data;
  const saison = saisonCourante(saisons);
  const clubParId = new Map(clubs.map((c) => [c.id, c]));
  const saisonParId = new Map(saisons.map((s) => [s.id, s]));

  const licencesParLicencie = new Map();
  for (const lc of licences) {
    if (!licencesParLicencie.has(lc.licencie_id)) licencesParLicencie.set(lc.licencie_id, []);
    licencesParLicencie.get(lc.licencie_id).push(lc);
  }

  const maintenant = new Date();
  const liste = licencies.map((l) => {
    const historique = (licencesParLicencie.get(l.id) || [])
      .slice()
      .sort((a, b) => (saisonParId.get(b.saison_id)?.date_debut || '').localeCompare(saisonParId.get(a.saison_id)?.date_debut || ''));
    const courante = saison ? historique.find((x) => x.saison_id === saison.id) || null : null;
    return {
      ...l,
      clubNom: clubParId.get(l.club_id)?.nom || '—',
      categorie: categorie(l.date_naissance, maintenant),
      age: ageExact(l.date_naissance, maintenant),
      historique,
      courante,
      alerteCertificat: l.statut === 'actif' && !!courante && !courante.certificat_fourni
    };
  });

  const moi = session ? licencies.find((l) => l.user_id === session.user.id) || null : null;
  const mesRoles = moi ? roles.filter((r) => r.licencie_id === moi.id) : [];
  const estCadre = mesRoles.some((r) => r.role === 'cadre_federal');
  const clubsResponsable = mesRoles.filter((r) => r.role === 'responsable_club').map((r) => r.club_id);

  return {
    data,
    saison,
    saisonParId,
    clubs,
    clubParId,
    licencies: liste,
    licencieParId: new Map(liste.map((l) => [l.id, l])),
    roles,
    competitions: competitions.slice().sort((a, b) => b.date_debut.localeCompare(a.date_debut)),
    competitionParId: new Map(competitions.map((c) => [c.id, c])),
    moi: moi ? liste.find((l) => l.id === moi.id) : null,
    mesRoles,
    estCadre,
    clubsResponsable,
    estResponsable: clubsResponsable.length > 0,
    aujourdhui: aujourdhuiISO()
  };
}
