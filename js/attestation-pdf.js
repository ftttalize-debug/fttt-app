// Attestation de licence (PDF généré dans le navigateur à partir de la fiche « Mon profil »).
import { fmtDate } from './lib.js';
import { chargerJsPdf, logo } from './facture-pdf.js';

const INDIGO = [72, 58, 130];
const BRUN = [74, 46, 34];
const TYPES = { competition: 'Compétition', loisir: 'Loisir', dirigeant: 'Dirigeant' };
const t = (s) => String(s ?? '').replace(/[’‘]/g, "'").replace(/[–—]/g, '-');

export async function telechargerAttestation(p) {
  const { jsPDF } = await chargerJsPdf();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const img = await logo();
  let y = 18;
  if (img) { doc.addImage(img.url, 'PNG', 18, y, 60, 60 * img.ratio); y += 60 * img.ratio + 10; } else y = 40;

  doc.setTextColor(...INDIGO); doc.setFont('helvetica', 'bold'); doc.setFontSize(22);
  doc.text('ATTESTATION DE LICENCE', 105, y, { align: 'center' });
  y += 8;
  doc.setDrawColor(...INDIGO); doc.setLineWidth(0.6); doc.line(40, y, 170, y);
  y += 14;

  doc.setTextColor(...BRUN); doc.setFontSize(11); doc.setFont('helvetica', 'normal');
  doc.text(t('La Fédération Tahitienne de Tennis de Table atteste que :'), 18, y);
  y += 12;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
  doc.text(t(`${p.prenom} ${p.nom}`), 105, y, { align: 'center' });
  y += 12;

  const lignes = [
    ['N° de licence', p.numero],
    ['Date de naissance', fmtDate(p.naissance)],
    ['Club', p.club || 'Sans club'],
    ['Saison', p.licence?.saison],
    ['Type de licence', TYPES[p.licence?.type] || p.licence?.type],
    ['Catégorie', p.categorie],
    ['Classement', p.rang ? `${p.rang}e - ${String(p.points).replace('.', ',')} points` : `${String(p.points).replace('.', ',')} points`]
  ];
  doc.setFontSize(11);
  lignes.forEach(([k, v], i) => {
    const yy = y + i * 9;
    if (i % 2 === 0) { doc.setFillColor(245, 242, 250); doc.rect(30, yy - 6, 150, 9, 'F'); }
    doc.setFont('helvetica', 'normal'); doc.text(t(k), 34, yy);
    doc.setFont('helvetica', 'bold'); doc.text(t(v ?? '-'), 176, yy, { align: 'right' });
  });
  y += lignes.length * 9 + 8;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(30, 120, 60);
  doc.text(t(`Licence active pour la saison ${p.licence?.saison}`), 105, y, { align: 'center' });
  y += 14;
  doc.setTextColor(...BRUN); doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text(t(`Document établi le ${fmtDate(new Date().toISOString().slice(0, 10))} à partir du site de la FTTT (app.fttt.pf).`), 105, y, { align: 'center' });
  y += 6;
  doc.text(t('Il atteste la situation de la licence à la date d\'émission.'), 105, y, { align: 'center' });

  doc.setFontSize(8); doc.setTextColor(120, 100, 90);
  doc.text('Fédération Tahitienne de Tennis de Table - BP 1839 Papeete', 105, 287, { align: 'center' });
  doc.save(`attestation-licence-${p.numero}.pdf`);
}
