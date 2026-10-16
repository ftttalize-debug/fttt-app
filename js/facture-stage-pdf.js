// Facture acquittée d'une inscription à un stage (PDF généré dans le navigateur).
import { fmtDate } from './lib.js';
import { chargerJsPdf, logo, t, xpf, INDIGO, BRUN } from './facture-pdf.js';

const MODES = { sur_place: 'sur place', virement: 'par virement' };

/** `donnees` : { stage, inscription, federation } */
export async function construireFactureStage({ stage, inscription: i, federation: FED }) {
  const { jsPDF } = await chargerJsPdf();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const L = 18, R = 192;
  const img = await logo();
  let y = 18;
  if (img) doc.addImage(img.url, 'PNG', L, y, 52, 52 * img.ratio);
  doc.setTextColor(...INDIGO); doc.setFont('helvetica', 'bold'); doc.setFontSize(22);
  doc.text('FACTURE ACQUITTEE', R, y + 6, { align: 'right' });
  doc.setTextColor(...BRUN); doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.text(t(`N° ${i.numero_facture}`), R, y + 13, { align: 'right' });
  doc.text(t(`Date : ${fmtDate(i.date_paiement)}`), R, y + 19, { align: 'right' });

  y = img ? 18 + 52 * img.ratio + 8 : 40;
  doc.setFont('helvetica', 'bold'); doc.text(t(FED.nom), L, y);
  doc.setFont('helvetica', 'normal');
  const fed = [...(FED.adresse || []), FED.email, FED.telephone, FED.numeroTahiti && `N° Tahiti : ${FED.numeroTahiti}`].filter(Boolean);
  fed.forEach((l, k) => doc.text(t(l), L, y + 5 + k * 5));

  const responsable = i.mineur && i.representant_nom ? i.representant_nom : `${i.prenom} ${i.nom}`;
  const client = [responsable, i.mineur ? i.representant_email : i.email, i.mineur ? i.representant_telephone : i.telephone].filter(Boolean);
  doc.setFont('helvetica', 'bold'); doc.text('Facturé à', 118, y);
  doc.setFont('helvetica', 'normal');
  client.forEach((l, k) => doc.text(t(l), 118, y + 5 + k * 5, { maxWidth: 74 }));

  y = Math.max(y + 5 + fed.length * 5, y + 5 + client.length * 5) + 10;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text(t(stage.nom), L, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  const quand = stage.date_debut === stage.date_fin ? fmtDate(stage.date_debut) : `${fmtDate(stage.date_debut)} au ${fmtDate(stage.date_fin)}`;
  doc.text(t(`${quand}${stage.lieu ? ' - ' + stage.lieu : ''}`), L, y + 5);
  doc.text(t(`Participant : ${i.prenom} ${i.nom}, né(e) le ${fmtDate(i.date_naissance)}`), L, y + 10);

  y += 20;
  doc.setFillColor(...INDIGO); doc.rect(L, y, R - L, 8, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold');
  doc.text('Désignation', L + 3, y + 5.5); doc.text('Montant', R - 3, y + 5.5, { align: 'right' });
  doc.setTextColor(...BRUN); doc.setFont('helvetica', 'normal'); y += 8;
  doc.setFillColor(248, 244, 238); doc.rect(L, y, R - L, 12, 'F');
  doc.text(t(`Inscription au stage - ${i.tarif === 'licencie' ? 'tarif licencié' : 'tarif non licencié'}`), L + 3, y + 5);
  doc.setFontSize(9); doc.text('Licence événementielle incluse', L + 3, y + 9.5); doc.setFontSize(10);
  doc.text(xpf(i.montant_xpf), R - 3, y + 5, { align: 'right' });
  y += 20;

  doc.setDrawColor(...INDIGO); doc.setLineWidth(0.6); doc.line(118, y, R, y);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  doc.text('Total', 118, y + 7);
  doc.setTextColor(...INDIGO); doc.text(xpf(i.montant_xpf), R, y + 7, { align: 'right' });
  doc.setTextColor(...BRUN); doc.setFontSize(10);

  y += 20;
  doc.setDrawColor(46, 125, 80); doc.setTextColor(46, 125, 80); doc.setLineWidth(0.8);
  doc.roundedRect(L, y, 100, 14, 2, 2);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
  doc.text(t(`ACQUITTEE le ${fmtDate(i.date_paiement)}`), L + 50, y + 6, { align: 'center' });
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text(t(`Règlement ${MODES[i.mode_paiement] || ''} reçu`), L + 50, y + 11, { align: 'center' });
  doc.setTextColor(...BRUN); doc.setFontSize(8.5);
  if (FED.mentions) doc.text(t(FED.mentions), L, y + 24, { maxWidth: R - L });
  doc.setFontSize(8); doc.setTextColor(120, 100, 90);
  doc.text(t(`${FED.nom} - facture ${i.numero_facture}`), 105, 287, { align: 'center' });
  return doc;
}

export async function telechargerFactureStage(donnees) {
  const doc = await construireFactureStage(donnees);
  doc.save(`${donnees.inscription.numero_facture}.pdf`);
}
