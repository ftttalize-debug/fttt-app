// Suivi des certificats médicaux : manquants, expirés, bientôt expirés (cadre fédéral et responsables de club).
import { html, useState, useMemo } from '../preact.js';
import { lien, nomComplet, norm, fmtDate, parseDate, aujourdhuiISO, telechargerCsv, TYPES_CERTIFICAT, TYPES_LICENCE } from '../lib.js';
import { Icone, Pastille } from '../ui.js';

const JOURS_ALERTE = 90;
const deuxCh = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${deuxCh(d.getMonth() + 1)}-${deuxCh(d.getDate())}`;

/** Date de fin de validité : 3 ans avant 50 ans (selon la règle fédérale), 1 an ensuite. */
export function finValidite(dateCertificat, age) {
  const d = parseDate(dateCertificat);
  if (!d) return null;
  d.setFullYear(d.getFullYear() + (age !== null && age < 50 ? 3 : 1));
  return iso(d);
}

/** État du certificat d'un licencié actif : manquant, sans_date, expire, bientot ou null (en règle). */
export function etatCertificat(l, aujourdhui = aujourdhuiISO()) {
  const lic = l.courante;
  if (l.statut !== 'actif' || !lic) return null;
  if (!lic.certificat_fourni) return { code: 'manquant', fin: null };
  if (!lic.certificat_date) return { code: 'sans_date', fin: null };
  const fin = finValidite(lic.certificat_date, l.age);
  if (fin <= aujourdhui) return { code: 'expire', fin };
  const limite = parseDate(aujourdhui); limite.setDate(limite.getDate() + JOURS_ALERTE);
  if (fin <= iso(limite)) return { code: 'bientot', fin };
  return null;
}

const ETATS = {
  manquant: ['alerte', 'Certificat manquant'],
  expire: ['alerte', 'Certificat expiré'],
  bientot: ['neutre', 'Expire bientôt'],
  sans_date: ['neutre', 'Date à renseigner']
};
const ORDRE = { manquant: 0, expire: 1, bientot: 2, sans_date: 3 };

export function PageCertificats({ ctx }) {
  const [filtre, setFiltre] = useState('tous');
  const [club, setClub] = useState('');
  const [texte, setTexte] = useState('');
  const aujourdhui = aujourdhuiISO();

  const toutes = useMemo(() => ctx.licenciesGeres
    .map((l) => ({ l, etat: etatCertificat(l, aujourdhui) }))
    .filter((x) => x.etat)
    .sort((a, b) => ORDRE[a.etat.code] - ORDRE[b.etat.code] || (a.etat.fin || '').localeCompare(b.etat.fin || '') || norm(a.l.nom).localeCompare(norm(b.l.nom))),
  [ctx.licenciesGeres]);

  const compte = (c) => toutes.filter((x) => x.etat.code === c).length;
  const liste = toutes.filter((x) => (filtre === 'tous' || x.etat.code === filtre)
    && (!club || x.l.club_id === club)
    && (!texte || norm(`${x.l.prenom} ${x.l.nom}`).includes(norm(texte))));

  function exporter() {
    telechargerCsv(`certificats-${aujourdhui}.csv`,
      ['Nom', 'Prénom', 'Club', 'Licence', 'État', 'Type de certificat', 'Date du certificat', 'Valable jusqu\'au', 'E-mail', 'Téléphone'],
      liste.map(({ l, etat }) => [l.nom, l.prenom, l.clubNom, TYPES_LICENCE[l.courante.type] || '', ETATS[etat.code][1],
        TYPES_CERTIFICAT[l.courante.certificat_type] || '', l.courante.certificat_date ? fmtDate(l.courante.certificat_date) : '', etat.fin ? fmtDate(etat.fin) : '', l.email || '', l.telephone || '']));
  }

  const onglets = [['tous', 'Tous', toutes.length], ['manquant', 'Manquants', compte('manquant')], ['expire', 'Expirés', compte('expire')], ['bientot', 'Bientôt', compte('bientot')], ['sans_date', 'Sans date', compte('sans_date')]];

  return html`<div class="page">
    <div class="page-tete">
      <div><h1>Certificats médicaux</h1><p>Saison ${ctx.saison?.libelle} · licenciés actifs</p></div>
      <div class="page-actions"><button class="btn btn-secondaire" type="button" id="exp-certificats" disabled=${!liste.length} onClick=${exporter}><${Icone} nom="telecharger" taille=${20} /> Exporter (CSV)</button></div>
    </div>
    <p class="aide">Validité : 3 ans pour les moins de 50 ans, 1 an ensuite. « Bientôt » : expire dans moins de ${JOURS_ALERTE} jours.</p>
    <section class="carte filtres" aria-label="Filtres">
      <div class="puces" role="group" aria-label="État">
        ${onglets.map(([v, t, n]) => html`<button key=${v} type="button" class="puce" aria-pressed=${filtre === v} onClick=${() => setFiltre(v)}>${t} · ${n}</button>`)}
      </div>
      <div class="filtres-ligne">
        <input type="search" aria-label="Rechercher un licencié" placeholder="Nom ou prénom" value=${texte} onInput=${(e) => setTexte(e.target.value)} />
        ${ctx.estCadre && ctx.clubs.length > 1 && html`<select aria-label="Club" value=${club} onChange=${(e) => setClub(e.target.value)}>
          <option value="">Tous les clubs</option>${ctx.clubs.map((c) => html`<option key=${c.id} value=${c.id}>${c.nom}</option>`)}</select>`}
      </div>
    </section>
    ${liste.length === 0 ? html`<p class="vide">Aucun certificat à signaler.</p>` : html`<ul class="historique cert-liste">
      ${liste.map(({ l, etat }) => html`<li key=${l.id}>
        <div style="flex:1;min-width:0">
          <a href=${lien(['licencies', l.id])}><strong>${nomComplet(l)}</strong></a> <${Pastille} genre=${ETATS[etat.code][0]}>${ETATS[etat.code][1]}<//>
          <div class="aide">${l.clubNom}${etat.fin ? ' · ' + (etat.code === 'expire' ? 'expiré le ' : 'expire le ') + fmtDate(etat.fin) : ''}</div>
        </div></li>`)}
    </ul>`}
  </div>`;
}
