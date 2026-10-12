// Comptes et accès (cadre fédéral) : qui peut se connecter, avec quels rôles.
import { html, useState, useMemo } from '../preact.js';
import { api } from '../data.js';
import { lien, nomComplet, norm, estMineur, msgErreur } from '../lib.js';
import { Pastille, Dialogue, ChoixPersonne, Champ, toast } from '../ui.js';

const ROLES = { cadre_federal: 'Cadre fédéral', responsable_club: 'Responsable de club', juge_arbitre: 'Juge-arbitre' };

export function etatCompte(l) {
  if (l.user_id) return { genre: 'actif', texte: 'Compte actif' };
  if (!l.email) return { genre: 'alerte', texte: 'E-mail manquant' };
  if (estMineur(l.date_naissance)) return { genre: 'neutre', texte: 'Mineur : pas de compte' };
  return { genre: 'neutre', texte: 'Compte à créer' };
}

export function PageComptes({ ctx }) {
  const [personne, setPersonne] = useState(null);
  const [role, setRole] = useState('responsable_club');
  const [club, setClub] = useState('');
  const [filtre, setFiltre] = useState('tous');
  const [q, setQ] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [aRetirer, setARetirer] = useState(null);
  const [aDelier, setADelier] = useState(null);

  const adultes = useMemo(() => ctx.licencies
    .filter((l) => !estMineur(l.date_naissance))
    .map((l) => ({ id: l.id, libelle: nomComplet(l), detail: l.email || 'sans e-mail', cle: norm(`${l.prenom} ${l.nom}`) })), [ctx.licencies]);

  const lignes = useMemo(() => {
    const juges = new Map();
    for (const j of ctx.juges) juges.set(j.licencie_id, (juges.get(j.licencie_id) || 0) + 1);
    return ctx.licencies
      .map((l) => ({ l, roles: ctx.roles.filter((r) => r.licencie_id === l.id), nbJuge: juges.get(l.id) || 0 }))
      .filter((x) => x.roles.length || x.nbJuge || x.l.user_id);
  }, [ctx.licencies, ctx.roles, ctx.juges]);

  const affichees = lignes.filter((x) => {
    if (filtre === 'attente' && x.l.user_id) return false;
    if (filtre === 'actifs' && !x.l.user_id) return false;
    const mots = norm(q).split(/\s+/).filter(Boolean);
    const cle = norm(`${x.l.prenom} ${x.l.nom}`);
    return mots.every((m) => cle.includes(m));
  });

  const choisi = personne ? ctx.licencieParId.get(personne) : null;

  async function ajouter() {
    if (!personne || (role === 'responsable_club' && !club)) return;
    setOccupe(true);
    try {
      await api.ajouterRole(personne, role, role === 'responsable_club' ? club : null);
      await ctx.recharger();
      toast('Accès accordé.');
      setPersonne(null);
    } catch (e) { toast(msgErreur(e), 'erreur'); } finally { setOccupe(false); }
  }
  async function retirer() {
    setOccupe(true);
    try {
      await api.retirerRole(aRetirer.id);
      await ctx.recharger();
      toast('Rôle retiré.');
      setARetirer(null);
    } catch (e) { toast(msgErreur(e), 'erreur'); } finally { setOccupe(false); }
  }
  async function delier() {
    setOccupe(true);
    try {
      await api.delierCompte(aDelier.id);
      await ctx.recharger();
      toast('Compte détaché de la fiche.');
      setADelier(null);
    } catch (e) { toast(msgErreur(e), 'erreur'); } finally { setOccupe(false); }
  }

  return html`<div class="page">
    <div class="page-tete"><div><h1>Comptes et accès</h1>
      <p>${ctx.licencies.filter((l) => l.user_id).length} compte${ctx.licencies.filter((l) => l.user_id).length > 1 ? 's' : ''} actif${ctx.licencies.filter((l) => l.user_id).length > 1 ? 's' : ''}</p></div></div>

    <section class="carte" aria-label="Donner un accès">
      <h2>Donner un accès</h2>
      <p class="aide">Renseigne d'abord l'e-mail sur la fiche. La personne crée ensuite son compte depuis l'écran de connexion (« Créer mon compte ») avec cet e-mail : sa fiche est reliée automatiquement. Les juges-arbitres sont désignés sur chaque compétition.</p>
      <div class="grille">
        <${Champ} id="cp-pers" libelle="Personne (majeure)">
          <${ChoixPersonne} id="cp-pers" options=${adultes} valeur=${personne} onChange=${setPersonne} />
        <//>
        <${Champ} id="cp-role" libelle="Rôle">
          <select id="cp-role" value=${role} onChange=${(e) => setRole(e.target.value)}>
            <option value="responsable_club">Responsable de club</option>
            <option value="cadre_federal">Cadre fédéral</option>
          </select>
        <//>
        ${role === 'responsable_club' && html`<${Champ} id="cp-club" libelle="Club">
          <select id="cp-club" value=${club} onChange=${(e) => setClub(e.target.value)}>
            <option value="">Choisir…</option>
            ${ctx.clubs.map((c) => html`<option key=${c.id} value=${c.id}>${c.nom}</option>`)}
          </select>
        <//>`}
        ${choisi && !choisi.email && html`<p class="avis avis-alerte">Cette fiche n'a pas d'e-mail : ajoute-le avant que la personne crée son compte.</p>`}
        <button class="btn btn-primaire" type="button" onClick=${ajouter}
          disabled=${occupe || !personne || (role === 'responsable_club' && !club)}>Accorder l'accès</button>
      </div>
    </section>

    <section class="carte" aria-label="Liste des accès">
      <h2>Personnes avec un accès</h2>
      <div class="puces" role="group" aria-label="Filtre">
        ${[['tous', 'Tous'], ['actifs', 'Compte actif'], ['attente', 'Compte à créer']].map(([k, t]) =>
          html`<button key=${k} type="button" class=${'puce' + (filtre === k ? ' actif' : '')} aria-pressed=${filtre === k} onClick=${() => setFiltre(k)}>${t}</button>`)}
      </div>
      <input type="search" placeholder="Rechercher un nom" value=${q} onInput=${(e) => setQ(e.target.value)} aria-label="Rechercher" />
      ${affichees.length === 0 ? html`<p class="vide">Aucune personne.</p>` : html`<ul class="historique">
        ${affichees.map(({ l, roles, nbJuge }) => {
          const e = etatCompte(l);
          const moi = l.user_id && l.id === ctx.moi.id;
          return html`<li key=${l.id} style="flex-wrap:wrap;gap:8px">
            <div style="flex:1;min-width:200px">
              <a href=${lien(['licencies', l.id])}><strong>${nomComplet(l)}</strong></a>
              <div class="aide">${l.email || 'sans e-mail'}</div>
              <div class="puces">
                ${roles.map((r) => html`<span key=${r.id}><${Pastille}>${ROLES[r.role]}${r.club_id ? ' · ' + (ctx.clubParId.get(r.club_id)?.nom || '') : ''}<//>
                  <button class="btn btn-lien" type="button" aria-label=${'Retirer ' + ROLES[r.role]} onClick=${() => setARetirer(r)}>Retirer</button></span>`)}
                ${nbJuge > 0 && html`<${Pastille}>Juge sur ${nbJuge} compétition${nbJuge > 1 ? 's' : ''}<//>`}
              </div>
            </div>
            <${Pastille} genre=${e.genre}>${e.texte}<//>
            ${l.user_id && !moi && html`<button class="btn btn-secondaire" type="button" onClick=${() => setADelier(l)}>Détacher le compte</button>`}
          </li>`;
        })}
      </ul>`}
    </section>

    ${aRetirer && html`<${Dialogue} titre="Retirer ce rôle ?" onFermer=${() => setARetirer(null)}>
      <p>${ROLES[aRetirer.role]} : la personne perd ces droits immédiatement.</p>
      <div class="actions"><button class="btn btn-secondaire" type="button" onClick=${() => setARetirer(null)}>Annuler</button>
        <button class="btn btn-danger" type="button" disabled=${occupe} onClick=${retirer}>Retirer</button></div>
    <//>`}
    ${aDelier && html`<${Dialogue} titre="Détacher le compte ?" onFermer=${() => setADelier(null)}>
      <p>${nomComplet(aDelier)} ne pourra plus se connecter avec ce compte. La fiche reste intacte et pourra être reliée à un autre compte.</p>
      <div class="actions"><button class="btn btn-secondaire" type="button" onClick=${() => setADelier(null)}>Annuler</button>
        <button class="btn btn-danger" type="button" disabled=${occupe} onClick=${delier}>Détacher</button></div>
    <//>`}
  </div>`;
}
