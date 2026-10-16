// Fiche d'inscription à un ou plusieurs stages, entièrement pré-remplie (PDF) : le parent n'a qu'à signer.
// Aucune information de santé n'est enregistrée dans l'application.
import { fmtDate } from './lib.js';
import { chargerJsPdf, logo, t, INDIGO, BRUN } from './facture-pdf.js';

export const EMAIL_SECRETARIAT = 'fttt.secretariat@gmail.com';
const PIED = 'Fédération Tahitienne de Tennis de Table - Rue Paul Bernière, 98716 Pirae - Annexe Pater - B.P. 1839 - 98713 Papeete Tahiti - Tél : 40 43 65 28';

const quand = (s) => (s.date_debut === s.date_fin ? fmtDate(s.date_debut) : `du ${fmtDate(s.date_debut)} au ${fmtDate(s.date_fin)}`);

/**
 * `d` : { stages: [{nom,date_debut,date_fin,lieu}], certificat: boolean,
 *         inscription: {prenom,nom,date_naissance,mineur,telephone,email,representant_nom,representant_telephone,representant_email,autorisation_photo} }
 */
function dessinerFiche(doc, d, img) {
  const { stages, inscription: i, certificat } = d;
  const L = 16, R = 194;
  let y = 14;
  if (img) doc.addImage(img.url, 'PNG', L, y, 44, 44 * img.ratio);
  doc.setTextColor(...INDIGO); doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
  doc.text("FICHE D'INSCRIPTION", R, y + 8, { align: 'right' });
  doc.setFontSize(11); doc.text(stages.length > 1 ? 'STAGES FEDERAUX' : 'STAGE FEDERAL', R, y + 15, { align: 'right' });
  doc.setTextColor(...BRUN); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text('A remettre signée le 1er jour du stage', R, y + 21, { align: 'right' });

  y = img ? 14 + 44 * img.ratio + 6 : 38;
  const titre = (s, yy) => {
    doc.setFillColor(...INDIGO); doc.rect(L, yy, R - L, 6.5, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
    doc.text(t(s), L + 3, yy + 4.6); doc.setTextColor(...BRUN);
  };
  const champ = (libelle, valeur, x, yy, larg) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(120, 100, 90);
    doc.text(t(libelle.toUpperCase()), x, yy);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(...BRUN);
    doc.text(t(valeur || '-'), x, yy + 5, { maxWidth: larg });
    doc.setDrawColor(200, 190, 180); doc.setLineWidth(0.2); doc.line(x, yy + 7, x + larg, yy + 7);
  };

  titre(stages.length > 1 ? 'STAGES' : 'STAGE', y); y += 11;
  doc.setFontSize(10);
  stages.forEach((s) => {
    doc.setFont('helvetica', 'bold'); doc.text(t(s.nom), L, y);
    doc.setFont('helvetica', 'normal'); doc.text(t(`${quand(s)}${s.lieu ? ' - ' + s.lieu : ''}`), L + 62, y);
    y += 5.5;
  });
  doc.setFontSize(9); doc.text(t('Tenue sportive exigée. Apporter serviette, raquette et bouteille d\'eau.'), L, y + 1);
  y += 9;

  titre('PARTICIPANT', y); y += 11;
  champ('Nom', i.nom, L, y, 84); champ('Prénom', i.prenom, L + 94, y, 84); y += 14;
  champ('Date de naissance', fmtDate(i.date_naissance), L, y, 84);
  if (!i.mineur) champ('Téléphone / e-mail', [i.telephone, i.email].filter(Boolean).join(' - '), L + 94, y, 84);
  y += 14;
  if (i.mineur) {
    titre('RESPONSABLE LEGAL', y); y += 11;
    champ('Nom et prénom', i.representant_nom, L, y, 178); y += 14;
    champ('Téléphone', i.representant_telephone, L, y, 84); champ('E-mail', i.representant_email, L + 94, y, 84); y += 14;
  }

  titre('A REMETTRE LE 1ER JOUR', y); y += 9;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text(t('- Cette fiche, signée'), L + 2, y); y += 5.5;
  doc.text(t(certificat
    ? '- Un certificat médical attestant l\'aptitude à la pratique d\'activités physiques et sportives'
    : '- Aucun certificat médical : le participant est licencié FTTT'), L + 2, y);
  y += 11;

  titre(i.mineur ? 'AUTORISATION PARENTALE' : 'ENGAGEMENT DU PARTICIPANT', y); y += 13;
  doc.setFontSize(9.5);
  const objet = stages.length > 1 ? 'aux stages indiqués ci-dessus' : 'au stage indiqué ci-dessus';
  const texte = i.mineur
    ? `Je soussigné(e) ${i.representant_nom}, responsable légal de ${i.prenom} ${i.nom}, l'autorise à participer ${objet}. Je donne tout pouvoir aux responsables du stage pour agir en mon nom pour toute intervention indispensable.`
    : `Je soussigné(e) ${i.prenom} ${i.nom}, participe ${objet}. Je donne tout pouvoir aux responsables du stage pour agir en mon nom pour toute intervention indispensable.`;
  const lignes = doc.splitTextToSize(t(texte), R - L);
  doc.text(lignes, L, y); y += lignes.length * 4.6 + 2;
  doc.text(t(`Photos et vidéos du stage (site et réseaux sociaux de la FTTT) : ${i.autorisation_photo ? 'autorisées' : 'non autorisées'}.`), L, y);
  y += 12;
  doc.text(t('Fait à Pirae, le ....... / ....... / .............'), L, y);
  doc.setFont('helvetica', 'bold');
  doc.text(t('Signature précédée de la mention « lu et approuvé »'), R, y, { align: 'right' });
  doc.setDrawColor(150, 140, 130); doc.setLineWidth(0.3); doc.rect(R - 70, y + 3, 70, 26);

  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(120, 100, 90);
  doc.text(t(PIED), 105, 287, { align: 'center', maxWidth: 178 });
  doc.setTextColor(...BRUN);
}

/** `fiches` : liste de { stages, inscription, certificat } ; une page par fiche. */
export async function construireFiches(fiches) {
  const { jsPDF } = await chargerJsPdf();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const img = await logo();
  fiches.forEach((d, k) => { if (k > 0) doc.addPage(); dessinerFiche(doc, d, img); });
  return doc;
}

const nomFichier = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '');

export async function telechargerFiche(fiche) {
  const doc = await construireFiches([fiche]);
  doc.save(`Fiche-stage-${nomFichier(fiche.inscription.nom)}-${nomFichier(fiche.inscription.prenom)}.pdf`);
}

export async function telechargerFiches(fiches, nom = 'stages') {
  const doc = await construireFiches(fiches);
  doc.save(`Fiches-${nomFichier(nom)}.pdf`);
}
