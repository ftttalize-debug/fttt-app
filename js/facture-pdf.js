// Génération du PDF d'une facture, dans le navigateur (jsPDF chargé à la demande).
import { fmtDate, nomComplet } from './lib.js';

const JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
const INDIGO = [72, 58, 130];
const BRUN = [74, 46, 34];

function chargerJsPdf() {
  if (window.jspdf) return Promise.resolve(window.jspdf);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = JSPDF;
    s.onload = () => resolve(window.jspdf);
    s.onerror = () => reject(new Error('Impossible de charger le module PDF. Vérifie ta connexion.'));
    document.head.appendChild(s);
  });
}

async function logo() {
  try {
    const blob = await (await fetch('assets/logo-complet.png')).blob();
    const url = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
    const dim = await new Promise((res) => { const i = new Image(); i.onload = () => res({ w: i.width, h: i.height }); i.onerror = () => res(null); i.src = url; });
    return dim ? { url, ratio: dim.h / dim.w } : null;
  } catch { return null; }
}

const t = (s) => String(s ?? '').replace(/[’‘]/g, "'").replace(/[–—]/g, '-').replace(/ | /g, ' ');
const xpf = (n) => t(`${Number(n || 0).toLocaleString('fr-FR')} F CFP`);

/** Construit le document PDF. `donnees` : { facture, club, competition, joueurs: [{nom, points}] } */
export async function construireFacture(donnees) {
  const { jsPDF } = await chargerJsPdf();
  const { facture, club, competition, joueurs, federation: FEDERATION } = donnees;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const L = 18, R = 192;
  const img = await logo();
  let y = 18;
  if (img) { doc.addImage(img.url, 'PNG', L, y, 52, 52 * img.ratio); }

  doc.setTextColor(...INDIGO); doc.setFont('helvetica', 'bold'); doc.setFontSize(22);
  doc.text('FACTURE', R, y + 6, { align: 'right' });
  doc.setTextColor(...BRUN); doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.text(t(`N° ${facture.numero}`), R, y + 13, { align: 'right' });
  doc.text(t(`Date : ${fmtDate(String(facture.created_at).slice(0, 10))}`), R, y + 19, { align: 'right' });

  y = img ? 18 + 52 * img.ratio + 8 : 40;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text(t(FEDERATION.nom), L, y);
  doc.setFont('helvetica', 'normal');
  const fed = [...FEDERATION.adresse, FEDERATION.email, FEDERATION.telephone, FEDERATION.numeroTahiti && `N° Tahiti : ${FEDERATION.numeroTahiti}`].filter(Boolean);
  fed.forEach((ligne, i) => doc.text(t(ligne), L, y + 5 + i * 5));

  doc.setFont('helvetica', 'bold'); doc.text('Facturé à', 118, y);
  doc.setFont('helvetica', 'normal');
  const cl = [club.nom, club.adresse, club.email_facturation].filter(Boolean);
  cl.forEach((ligne, i) => doc.text(t(ligne), 118, y + 5 + i * 5, { maxWidth: 74 }));

  y = Math.max(y + 5 + fed.length * 5, y + 5 + cl.length * 5) + 10;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text(t(competition.nom), L, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  const quand = competition.date_debut === competition.date_fin ? fmtDate(competition.date_debut) : `${fmtDate(competition.date_debut)} au ${fmtDate(competition.date_fin)}`;
  doc.text(t(`${quand}${competition.lieu ? ' - ' + competition.lieu : ''}`), L, y + 5);

  y += 14;
  const entete = () => {
    doc.setFillColor(...INDIGO); doc.rect(L, y, R - L, 8, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold');
    doc.text('Désignation', L + 3, y + 5.5); doc.text('Qté', 130, y + 5.5, { align: 'right' });
    doc.text('Prix unitaire', 158, y + 5.5, { align: 'right' }); doc.text('Montant', R - 3, y + 5.5, { align: 'right' });
    doc.setTextColor(...BRUN); doc.setFont('helvetica', 'normal'); y += 8;
  };
  entete();
  joueurs.forEach((j, i) => {
    if (y > 262) { doc.addPage(); y = 20; entete(); }
    if (i % 2 === 0) { doc.setFillColor(248, 244, 238); doc.rect(L, y, R - L, 7, 'F'); }
    doc.text(t(`Inscription - ${j.nom}`), L + 3, y + 5);
    doc.text('1', 130, y + 5, { align: 'right' });
    doc.text(xpf(competition.montant_xpf), 158, y + 5, { align: 'right' });
    doc.text(xpf(competition.montant_xpf), R - 3, y + 5, { align: 'right' });
    y += 7;
  });

  y += 6;
  if (y > 255) { doc.addPage(); y = 20; }
  doc.setDrawColor(...INDIGO); doc.setLineWidth(0.6); doc.line(118, y, R, y);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  doc.text('Total à payer', 118, y + 7);
  doc.setTextColor(...INDIGO); doc.text(xpf(facture.montant_xpf), R, y + 7, { align: 'right' });
  doc.setTextColor(...BRUN); doc.setFontSize(10);

  y += 18;
  if (FEDERATION.paiement.length) {
    doc.setFont('helvetica', 'bold'); doc.text('Règlement', L, y);
    doc.setFont('helvetica', 'normal');
    FEDERATION.paiement.forEach((ligne, i) => doc.text(t(ligne), L, y + 5 + i * 5));
    y += 5 + FEDERATION.paiement.length * 5 + 4;
  }
  if (FEDERATION.mentions) { doc.setFontSize(8.5); doc.text(t(FEDERATION.mentions), L, y, { maxWidth: R - L }); }
  doc.setFontSize(8); doc.setTextColor(120, 100, 90);
  doc.text(t(`${FEDERATION.nom} - facture ${facture.numero}`), 105, 287, { align: 'center' });
  return doc;
}

export async function telechargerFacture(ctx, facture) {
  const insc = ctx.inscriptions.find((i) => i.id === facture.inscription_id);
  const competition = ctx.competitionParId.get(insc?.competition_id);
  const club = ctx.clubParId.get(facture.club_id);
  if (!insc || !competition || !club) throw new Error('Données de la facture introuvables.');
  const joueurs = insc.joueurs.map((j) => {
    const l = ctx.licencieParId.get(j.licencie_id);
    return { nom: l ? nomComplet(l) : 'Joueur' };
  });
  const doc = await construireFacture({ facture, club, competition, joueurs, federation: ctx.federation });
  doc.save(`${facture.numero}.pdf`);
}
