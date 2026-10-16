// Données préparées pour l'affichage (club, catégorie, licence de la saison en cours…).
import { FEDERATION } from './config.js';
import { categorie, ageExact, saisonCourante, aujourdhuiISO } from './lib.js';

export function construireContexte(data, session) {
  const { saisons, clubs, licencies, licences, roles, competitions = [], inscriptions = [], participants = [], factures = [], matchs = [], pmatchs = [], manches = [], juges = [], mouvements = [], rencontres = [], compositions = [], tours = [], parametres = {} } = data;
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
    /** Fiches que l'utilisateur gère vraiment (hors annuaire restreint du juge-arbitre). */
    licenciesGeres: liste.filter((l) => !l.annuaire),
    licencieParId: new Map(liste.map((l) => [l.id, l])),
    roles,
    competitions: competitions.slice().sort((a, b) => b.date_debut.localeCompare(a.date_debut)),
    inscriptions: inscriptions.map((i) => ({
      ...i,
      joueurs: participants.filter((p) => p.inscription_id === i.id).sort((a, b) => (a.rang || 0) - (b.rang || 0))
    })),
    factures: factures.map((f) => {
      const insc = inscriptions.find((i) => i.id === f.inscription_id) || null;
      return { ...f, competition_id: insc?.competition_id || null, clubNom: clubParId.get(f.club_id)?.nom || '—' };
    }),
    juges,
    mouvements,
    rencontres,
    compositions,
    tours,
    matchs: matchs.map((m) => {
      const pm = pmatchs.filter((p) => p.match_id === m.id);
      const A = pm.filter((p) => p.cote === 'A');
      const B = pm.filter((p) => p.cote === 'B');
      return {
        ...m, A, B,
        setsA: A[0]?.sets_gagnes ?? 0, setsB: B[0]?.sets_gagnes ?? 0,
        manches: manches.filter((x) => x.match_id === m.id).sort((a, b) => a.numero - b.numero)
      };
    }),
    federation: { ...FEDERATION, ...(parametres.federation || {}) },
    competitionParId: new Map(competitions.map((c) => [c.id, c])),
    moi: moi ? liste.find((l) => l.id === moi.id) : null,
    mesRoles,
    estCadre,
    clubsResponsable,
    estResponsable: clubsResponsable.length > 0,
    estJuge: !!moi && juges.some((j) => j.licencie_id === moi.id),
    /** Le juge-arbitre gère les compétitions dont il est juge ; le cadre fédéral toutes. */
    estJugeDe: (compId) => !!moi && juges.some((j) => j.competition_id === compId && j.licencie_id === moi.id),
    peutGererComp: (compId) => estCadre || (!!moi && juges.some((j) => j.competition_id === compId && j.licencie_id === moi.id)),
    peutCreerComp: estCadre || (!!moi && juges.some((j) => j.licencie_id === moi.id)),
    // Juge-arbitre sans rôle de cadre ni de responsable : accès limité aux compétitions, au calendrier et au classement
    estJugeSeul: !!moi && juges.some((j) => j.licencie_id === moi.id) && !estCadre && clubsResponsable.length === 0,
    aujourdhui: aujourdhuiISO()
  };
}
