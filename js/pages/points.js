// Points et saisons (cadre fédéral) : clôture mensuelle du classement et passage à la nouvelle saison.
import { html, useState, useEffect, useMemo } from '../preact.js';
import { api } from '../data.js';
import { fmtDate, msgErreur } from '../lib.js';
import { Pastille, Dialogue, toast } from '../ui.js';

const libelleMois = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
const premierDuMois = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;

export function PagePoints({ ctx }) {
  const [publies, setPublies] = useState(null);
  const [occupe, setOccupe] = useState(false);
  const [confirmer, setConfirmer] = useState(false);
  const charger = () => api.moisPublies().then((m) => setPublies(m.map((x) => x.mois))).catch(() => setPublies([]));
  useEffect(() => { charger(); }, []);

  const mois = useMemo(() => {
    const m = new Map();
    const courant = premierDuMois(new Date());
    m.set(courant, { mois: courant, total: 0, aAppliquer: 0 });
    for (const x of ctx.mouvements) {
      if (!m.has(x.mois)) m.set(x.mois, { mois: x.mois, total: 0, aAppliquer: 0 });
      const e = m.get(x.mois);
      e.total += 1;
      if (!x.applique) e.aAppliquer += 1;
    }
    return [...m.values()].sort((a, b) => b.mois.localeCompare(a.mois));
  }, [ctx.mouvements]);

  async function cloturer(iso) {
    setOccupe(true);
    try {
      const n = await api.cloturerMois(iso);
      await ctx.recharger();
      await charger();
      toast(`Classement de ${libelleMois(iso)} publié (${n} joueurs).`);
    } catch (e) { toast(msgErreur(e), 'erreur'); } finally { setOccupe(false); }
  }
  async function passer() {
    setOccupe(true);
    try {
      const r = await api.passerSaison();
      await ctx.recharger();
      toast(`Nouvelle saison : ${r.archives} fiche${r.archives > 1 ? 's' : ''} archivée${r.archives > 1 ? 's' : ''}, ${r.remontes} joueur${r.remontes > 1 ? 's' : ''} remonté${r.remontes > 1 ? 's' : ''} à 500.`);
      setConfirmer(false);
    } catch (e) { toast(msgErreur(e), 'erreur'); } finally { setOccupe(false); }
  }

  return html`<div class="page">
    <div class="page-tete"><div><h1>Points et saisons</h1><p>Saison ${ctx.saison?.libelle}</p></div></div>
    <section class="carte" aria-label="Clôture mensuelle">
      <h2>Points par mois</h2>
      <p class="aide">Les points s'ajoutent à ceux des joueurs dès que tu valides les matchs, et le classement se met à jour tout de suite. Il n'y a plus de clôture mensuelle à faire.</p>
      <ul class="historique">
        ${mois.map((m) => {
          const fait = publies?.includes(m.mois);
          return html`<li key=${m.mois}>
            <strong style="flex:1;text-transform:capitalize">${libelleMois(m.mois)}</strong>
            ${fait && m.aAppliquer === 0 ? html`<${Pastille} genre="actif">Points appliqués<//>` : m.aAppliquer > 0 ? html`<${Pastille} genre="alerte">${m.aAppliquer} mouvement${m.aAppliquer > 1 ? 's' : ''} à appliquer<//>` : html`<${Pastille}>Aucun match<//>`}
            ${m.aAppliquer > 0 && html`<button class="btn btn-secondaire" type="button" disabled=${occupe || publies === null} onClick=${() => cloturer(m.mois)}>Appliquer</button>`}
          </li>`;
        })}
      </ul>
    </section>
    <section class="carte" aria-label="Nouvelle saison">
      <h2>Nouvelle saison</h2>
      <p class="avis">Chaque 1er juillet à 00 h 05 (heure de Tahiti), le passage se fait automatiquement : la saison suivante est créée si besoin, les licenciés sans licence sont archivés et les joueurs sous 500 points remontent à 500. Il reste à clôturer le mois de juin ici. Le bouton ci-dessous ne sert qu'en secours.</p>
      <p class="aide">À lancer à partir du 1er juillet, une fois la saison ${ctx.saison?.libelle} créée : les licenciés sans licence pour cette saison sont archivés, et les joueurs sous 500 points remontent à 500. Les classements restent conservés.</p>
      <p class="avis">Saison en cours : <strong>${ctx.saison?.libelle}</strong> (${fmtDate(ctx.saison?.date_debut)} au ${fmtDate(ctx.saison?.date_fin)})</p>
      <div class="actions"><button class="btn btn-danger" type="button" disabled=${occupe} onClick=${() => setConfirmer(true)}>Passer à la nouvelle saison</button></div>
    </section>
    ${confirmer && html`<${Dialogue} titre="Passer à la nouvelle saison ?" onFermer=${() => setConfirmer(false)}>
      <p>Tous les licenciés actifs qui n'ont pas de licence ${ctx.saison?.libelle} vont être archivés, et les points inférieurs à 500 remonteront à 500. Pense à clôturer le dernier mois avant.</p>
      <div class="actions">
        <button class="btn btn-danger" type="button" disabled=${occupe} onClick=${passer}>Confirmer</button>
        <button class="btn btn-secondaire" type="button" onClick=${() => setConfirmer(false)}>Annuler</button>
      </div><//>`}
  </div>`;
}
