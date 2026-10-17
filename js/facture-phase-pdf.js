// Facture de phase d'un club : toutes les compétitions de la phase, avec le détail des joueurs (PDF généré dans le navigateur).
// Phase 1 : du 1er juillet au 31 décembre ; phase 2 : du 1er janvier au 30 juin.
import { fmtDate, nomComplet, aujourdhuiISO } from './lib.js';
import { chargerJsPdf, logo, t, xpf, INDIGO, BRUN } from './facture-pdf.js';

/** Bornes d'une phase pour une saison (date_debut = 1er juillet). */
export function bornesPhase(saison, phase) {
  const an = Number(String(saison.date_debut).slice(0, 4));
  return phase === 1 ? { debut: `${an}-07-01`, fin: `${an}-12-31`, libelle: `Phase 1 : du 1er juillet au 31 décembre ${an}` }
    : { debut: `${an + 1}-01-01`, fin: `${an + 1}-06-30`, libelle: `Phase 2 : du 1er janvier au 30 juin ${an + 1}` };
}

/** Compétitions de la phase facturées au club (factures non annulées), avec leurs lignes. */
export function detailPhase(ctx, clubId, saison, phase) {
  const b = bornesPhase(saison, phase);
  const parComp = new Map();
  ctx.factures.filter((f) => f.club_id === clubId && f.statut !== 'annulee').forEach((f) => {
    const insc = ctx.inscriptions.find((i) => i.id === f.inscription_id);
    const comp = insc && ctx.competitionParId.get(insc.competition_id);
    if (!comp || comp.date_debut < b.debut || comp.date_debut > b.fin) return;
    if (!parComp.has(comp.id)) parComp.set(comp.id, { comp, lignes: [], total: 0, regle: 0 });
    const g = parComp.get(comp.id);
    const noms = insc.joueurs.filter((j) => !j.club_id || j.club_id === clubId).map((j) => {
      const l = ctx.licencieParId.get(j.licencie_id);
      return l ? nomComplet(l) : (j.nom_affiche || 'Joueur');
    });
    if (insc.type === 'equipe') g.lignes.push({ libelle: `Équipe ${insc.nom_equipe || ctx.clubParId.get(clubId)?.nom || ''}`, montant: f.montant_xpf, joueurs: noms });
    else if (insc.type === 'paire') g.lignes.push({ libelle: `Double : ${noms.join(' / ')}`, montant: f.montant_xpf, joueurs: [] });
    else noms.forEach((n) => g.lignes.push({ libelle: n, montant: noms.length ? Math.round(f.montant_xpf / noms.length) : f.montant_xpf, joueurs: [] }));
    g.total += f.montant_xpf;
    if (f.statut === 'reglee') g.regle += f.montant_xpf;
  });
  const comps = [...parComp.values()].sort((a, c) => a.comp.date_debut.localeCompare(c.comp.date_debut));
  return { bornes: b, comps, total: comps.reduce((n, c) => n + c.total, 0), regle: comps.reduce((n, c) => n + c.regle, 0) };
}

export async function telechargerFacturePhase(ctx, clubId, saison, phase) {
  const club = ctx.clubParId.get(clubId);
  const d = detailPhase(ctx, clubId, saison, phase);
  if (!club || !d.comps.length) throw new Error('Aucune compétition facturée pour ce club sur cette phase.');
  const F = ctx.federation;
  const { jsPDF } = await chargerJsPdf();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const L = 18, R = 192;
  const img = await logo();
  let y = 18;
  if (img) doc.addImage(img.url, 'PNG', L, y, 52, 52 * img.ratio);
  const aujourdhui = aujourdhuiISO();
  const slug = String(club.nom).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toUpperCase();
  const reference = `PH${phase}-${String(saison.libelle).replace(/\s/g, '')}-${slug}`;

  doc.setTextColor(...INDIGO); doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
  doc.text('FACTURE DE PHASE', R, y + 6, { align: 'right' });
  doc.setTextColor(...BRUN); doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.text(t(`Réf. ${reference}`), R, y + 13, { align: 'right' });
  doc.text(t(`Date : ${fmtDate(aujourdhui)}`), R, y + 19, { align: 'right' });

  y = img ? 18 + 52 * img.ratio + 8 : 40;
  doc.setFont('helvetica', 'bold'); doc.text(t(F.nom), L, y);
  doc.setFont('helvetica', 'normal');
  const fed = [...F.adresse, F.email, F.telephone, F.numeroTahiti && `N° Tahiti : ${F.numeroTahiti}`].filter(Boolean);
  fed.forEach((ligne, i) => doc.text(t(ligne), L, y + 5 + i * 5));
  doc.setFont('helvetica', 'bold'); doc.text('Facturé à', 118, y);
  doc.setFont('helvetica', 'normal');
  const cl = [club.nom, club.adresse, club.email_facturation].filter(Boolean);
  cl.forEach((ligne, i) => doc.text(t(ligne), 118, y + 5 + i * 5, { maxWidth: 74 }));
  y = Math.max(y + 5 + fed.length * 5, y + 5 + cl.length * 5) + 10;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  doc.text(t(`Saison ${saison.libelle} - ${d.bornes.libelle}`), L, y);
  doc.setFontSize(10); y += 9;

  const page = (besoin) => { if (y + besoin > 272) { doc.addPage(); y = 20; } };
  d.comps.forEach(({ comp, lignes, total }) => {
    page(30);
    doc.setFillColor(...INDIGO); doc.rect(L, y, R - L, 8, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold');
    const quand = comp.date_debut === comp.date_fin ? fmtDate(comp.date_debut) : `${fmtDate(comp.date_debut)} au ${fmtDate(comp.date_fin)}`;
    doc.text(t(comp.nom), L + 3, y + 5.5, { maxWidth: 110 });
    doc.text(t(`${quand}${comp.lieu ? ' - ' + comp.lieu : ''}`), R - 3, y + 5.5, { align: 'right', maxWidth: 70 });
    doc.setTextColor(...BRUN); doc.setFont('helvetica', 'normal'); y += 8;
    lignes.forEach((l, i) => {
      const detail = l.joueurs.length ? `Joueurs : ${l.joueurs.join(', ')}` : '';
      const hDetail = detail ? doc.splitTextToSize(t(detail), R - L - 10).length * 4.5 : 0;
      page(7 + hDetail);
      if (i % 2 === 0) { doc.setFillColor(248, 244, 238); doc.rect(L, y, R - L, 7 + hDetail, 'F'); }
      doc.setFontSize(10); doc.text(t(l.libelle), L + 3, y + 5, { maxWidth: 130 });
      doc.text(xpf(l.montant), R - 3, y + 5, { align: 'right' });
      if (detail) { doc.setFontSize(8.5); doc.setTextColor(111, 84, 72); doc.text(doc.splitTextToSize(t(detail), R - L - 10), L + 6, y + 9.5); doc.setTextColor(...BRUN); doc.setFontSize(10); }
      y += 7 + hDetail;
    });
    doc.setFont('helvetica', 'bold'); doc.text(t(`Sous-total ${comp.nom}`), 118, y + 6, { maxWidth: 50 }); doc.text(xpf(total), R - 3, y + 6, { align: 'right' });
    doc.setFont('helvetica', 'normal'); y += 14;
  });

  page(40);
  doc.setDrawColor(...INDIGO); doc.setLineWidth(0.6); doc.line(118, y, R, y);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  doc.text('Total de la phase', 118, y + 7); doc.setTextColor(...INDIGO); doc.text(xpf(d.total), R, y + 7, { align: 'right' });
  doc.setTextColor(...BRUN); doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  if (d.regle > 0) {
    doc.text('Déjà réglé', 118, y + 14); doc.text(`- ${xpf(d.regle)}`, R, y + 14, { align: 'right' });
    doc.setFont('helvetica', 'bold'); doc.text('Reste à payer', 118, y + 21); doc.text(xpf(d.total - d.regle), R, y + 21, { align: 'right' });
    doc.setFont('helvetica', 'normal'); y += 14;
  }
  y += 22;
  if (F.paiement.length) {
    page(10 + F.paiement.length * 5);
    doc.setFont('helvetica', 'bold'); doc.text('Règlement', L, y); doc.setFont('helvetica', 'normal');
    F.paiement.forEach((ligne, i) => doc.text(t(ligne), L, y + 5 + i * 5));
    y += 5 + F.paiement.length * 5 + 4;
  }
  if (F.mentions) { doc.setFontSize(8.5); doc.text(t(F.mentions), L, y, { maxWidth: R - L }); }
  const n = doc.getNumberOfPages();
  for (let p = 1; p <= n; p++) { doc.setPage(p); doc.setFontSize(8); doc.setTextColor(120, 100, 90); doc.text(t(`${F.nom} - ${reference} - page ${p}/${n}`), 105, 287, { align: 'center' }); }
  doc.save(`facture-${reference}.pdf`);
}
