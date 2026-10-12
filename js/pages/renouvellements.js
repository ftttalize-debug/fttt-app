// Renouvellement des licences en masse (cadre fédéral), club par club.
import { html, useState, useMemo, useEffect } from '../preact.js';
import { api } from '../data.js';
import { aujourdhuiISO, fmtDate, nomComplet, norm, msgErreur, TYPES_LICENCE } from '../lib.js';
import { Pastille, Champ, toast } from '../ui.js';

const CERTS = { competition: 'Compétition', loisir: 'Loisir', evenementiel: 'Événementiel' };

const TYPES = ['competition', 'loisir', 'dirigeant'];

function plus3Ans(iso) {
  const d = new Date(iso + 'T12:00:00');
  d.setFullYear(d.getFullYear() + 3);
  return d.toISOString().slice(0, 10);
}

/** Le certificat de la licence précédente reste-t-il utilisable ? (moins de 50 ans, moins de 3 ans, type adapté) */
export function certificatReutilisable(prec, age, type, aujourdhui = aujourdhuiISO()) {
  if (!prec || !prec.certificat_fourni || !prec.certificat_date) return null;
  if (age === null || age >= 50) return null;
  if (type === 'competition' && prec.certificat_type !== 'competition') return null;
  const fin = plus3Ans(prec.certificat_date);
  return fin > aujourdhui ? fin : null;
}

export function PageRenouvellements({ ctx }) {
  const saisons = ctx.data.saisons;
  const [saisonId, setSaisonId] = useState(ctx.saison?.id || saisons[saisons.length - 1]?.id || '');
  const [clubId, setClubId] = useState('');
  const [q, setQ] = useState('');
  const [choix, setChoix] = useState({});       // id -> { coche, type, questionnaire }
  const [occupe, setOccupe] = useState(false);
  const [resultat, setResultat] = useState(null);
  const saison = saisons.find((s) => s.id === saisonId);
  const derniere = saisons[saisons.length - 1];

  const lignes = useMemo(() => {
    if (!clubId || !saison) return [];
    const mots = norm(q).split(/\s+/).filter(Boolean);
    return ctx.licencies
      .filter((l) => l.club_id === clubId)
      .filter((l) => !l.historique.some((h) => h.saison_id === saisonId && h.statut === 'active'))
      .filter((l) => { const cle = norm(`${l.prenom} ${l.nom}`); return mots.every((m) => cle.includes(m)); })
      .map((l) => {
        const prec = l.historique.find((h) => h.saison_id !== saisonId) || null;
        const c = choix[l.id] || {};
        const type = c.type || prec?.type || 'competition';
        const certType = c.certType || (type === 'competition' ? 'competition' : 'loisir');
        return { l, prec, type, certType, certDate: c.certDate || '', valable: certificatReutilisable(prec, l.age, type), coche: !!c.coche, questionnaire: !!c.questionnaire };
      })
      .sort((a, b) => a.l.nom.localeCompare(b.l.nom, 'fr'));
  }, [ctx.licencies, clubId, saisonId, q, choix]);

  useEffect(() => { setResultat(null); }, [clubId, saisonId]);

  const maj = (id, p) => setChoix((x) => ({ ...x, [id]: { ...(x[id] || {}), ...p } }));
  const cochees = lignes.filter((x) => x.coche);

  async function creerSaison() {
    const an = Number(derniere.date_fin.slice(0, 4));
    setOccupe(true);
    try {
      await api.creerSaison(`${an}-${an + 1}`, `${an}-07-01`, `${an + 1}-06-30`);
      await ctx.recharger();
      toast(`Saison ${an}-${an + 1} créée.`);
    } catch (e) { toast(msgErreur(e), 'erreur'); } finally { setOccupe(false); }
  }

  async function valider() {
    setOccupe(true);
    try {
      const futur = cochees.find((x) => x.certDate && x.certDate > aujourdhuiISO());
      if (futur) { toast(`La date du certificat de ${nomComplet(futur.l)} est dans le futur.`, 'erreur'); setOccupe(false); return; }
      const items = cochees.map((x) => {
        const saisi = !!x.certDate;                 // un nouveau certificat saisi remplace l'ancien
        const reuse = !!x.valable && !saisi;
        return {
          licencie_id: x.l.id, club_id: clubId, type: x.type,
          cert_type: reuse ? x.prec.certificat_type : saisi ? x.certType : null,
          cert_date: reuse ? x.prec.certificat_date : saisi ? x.certDate : null,
          cert_fourni: reuse || saisi,
          questionnaire: x.questionnaire,
          photo: !!x.prec?.photo_fournie
        };
      });
      const r = await api.renouvelerLicences(saisonId, items);
      await ctx.recharger();
      setResultat(r);
      setChoix({});
      toast(`${r.renouveles} licence${r.renouveles > 1 ? 's' : ''} renouvelée${r.renouveles > 1 ? 's' : ''}.`);
    } catch (e) { toast(msgErreur(e), 'erreur'); } finally { setOccupe(false); }
  }

  const nomDe = (id) => { const l = ctx.licencieParId.get(id); return l ? nomComplet(l) : id; };

  return html`<div class="page">
    <div class="page-tete"><div><h1>Renouvellements</h1><p>Reprise des licences, club par club</p></div></div>

    <section class="carte" aria-label="Choix">
      <div class="grille">
        <${Champ} id="rn-saison" libelle="Saison">
          <select id="rn-saison" value=${saisonId} onChange=${(e) => { setSaisonId(e.target.value); setChoix({}); }}>
            ${saisons.slice().reverse().map((s) => html`<option key=${s.id} value=${s.id}>${s.libelle}</option>`)}
          </select>
        <//>
        <${Champ} id="rn-club" libelle="Club">
          <select id="rn-club" value=${clubId} onChange=${(e) => { setClubId(e.target.value); setChoix({}); }}>
            <option value="">Choisir…</option>
            ${ctx.clubs.map((c) => html`<option key=${c.id} value=${c.id}>${c.nom}</option>`)}
          </select>
        <//>
      </div>
      ${saisonId === derniere?.id && html`<p class="aide" style="margin-top:12px">Pour renouveler sur la saison suivante, crée-la d'abord.
        <button class="btn btn-secondaire" type="button" disabled=${occupe} onClick=${creerSaison}>Créer la saison suivante</button></p>`}
    </section>

    ${clubId && html`<section class="carte" aria-label="Licenciés du club">
      <h2>Personnes à renouveler</h2>
      <p class="aide">Seules les personnes du club sans licence active pour ${saison?.libelle} sont listées. Le certificat est repris s'il date de moins de 3 ans (moins de 50 ans, type adapté) ; Si la personne a remis un nouveau certificat, saisis son type et sa date : il remplace l'ancien. Sans date, le certificat repris est conservé, ou reste « à fournir » s'il n'y en a pas. Coche « Questionnaire » quand le formulaire de santé est reçu.</p>
      <input type="search" placeholder="Rechercher un nom" value=${q} onInput=${(e) => setQ(e.target.value)} aria-label="Rechercher" />
      <div class="actions">
        <button class="btn btn-secondaire" type="button" onClick=${() => setChoix((x) => { const n = { ...x }; lignes.forEach((r) => { n[r.l.id] = { ...(n[r.l.id] || {}), coche: true }; }); return n; })}>Tout cocher</button>
        <button class="btn btn-secondaire" type="button" onClick=${() => setChoix({})}>Tout décocher</button>
      </div>
      ${lignes.length === 0 ? html`<p class="vide">Personne à renouveler pour ce club.</p>` : html`<ul class="historique">
        ${lignes.map((x) => html`<li key=${x.l.id} style="flex-wrap:wrap;gap:8px">
          <label style="display:flex;align-items:center;gap:10px;flex:1;min-width:220px">
            <input type="checkbox" checked=${x.coche} onChange=${(e) => maj(x.l.id, { coche: e.target.checked })} />
            <span><strong style="min-width:0">${nomComplet(x.l)}</strong><br /><small>${x.l.categorie} · ${x.l.age} ans${x.prec ? ' · dernière licence ' + (ctx.saisonParId.get(x.prec.saison_id)?.libelle || '') : ''}</small></span>
          </label>
          <select aria-label=${'Type de licence de ' + nomComplet(x.l)} value=${x.type} onChange=${(e) => maj(x.l.id, { type: e.target.value })}>
            ${TYPES.map((t) => html`<option key=${t} value=${t}>${TYPES_LICENCE[t]}</option>`)}
          </select>
          ${x.valable ? html`<${Pastille} genre="actif">Certificat valable jusqu'au ${fmtDate(x.valable)}<//>` : html`<${Pastille} genre="alerte">Nouveau certificat à fournir<//>`}
          <div style="display:flex;gap:8px;flex-wrap:wrap;width:100%;align-items:center">
            <small>${x.valable ? 'Nouveau certificat reçu ?' : 'Date du nouveau certificat :'}</small>
            <select aria-label=${'Type du nouveau certificat de ' + nomComplet(x.l)} value=${x.certType} onChange=${(e) => maj(x.l.id, { certType: e.target.value })}>
              ${Object.entries(CERTS).map(([k, t]) => html`<option key=${k} value=${k}>${t}</option>`)}
            </select>
            <input type="date" aria-label=${'Date du nouveau certificat de ' + nomComplet(x.l)} max=${aujourdhuiISO()} value=${x.certDate} onInput=${(e) => maj(x.l.id, { certDate: e.target.value })} />
          </div>
          <label style="display:flex;align-items:center;gap:6px"><input type="checkbox" checked=${x.questionnaire} onChange=${(e) => maj(x.l.id, { questionnaire: e.target.checked })} /> Questionnaire</label>
        </li>`)}
      </ul>`}
      <div class="actions">
        <button class="btn btn-primaire" type="button" disabled=${occupe || cochees.length === 0} onClick=${valider}>
          Renouveler ${cochees.length} licence${cochees.length > 1 ? 's' : ''}
        </button>
      </div>
      ${resultat && resultat.erreurs.length > 0 && html`<div class="avis avis-alerte" role="alert" style="margin-top:12px">
        <strong>${resultat.erreurs.length} non renouvelée${resultat.erreurs.length > 1 ? 's' : ''} :</strong>
        <ul>${resultat.erreurs.map((e) => html`<li key=${e.licencie_id}>${nomDe(e.licencie_id)} : ${e.message}</li>`)}</ul>
      </div>`}
    </section>`}
  </div>`;
}
