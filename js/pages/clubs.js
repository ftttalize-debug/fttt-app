// Clubs : liste, création, modification et responsables de club.
import { html, useState, useEffect, useMemo } from '../preact.js';
import { api } from '../data.js';
import { lien, naviguer, norm, nomComplet, emailValide, msgErreur, fmtDate } from '../lib.js';
import { Icone, Pastille, Champ, Dialogue, ChoixPersonne, toast } from '../ui.js';
import { fmtXpf } from './competitions.js';

function responsablesDe(ctx, clubId) {
  return ctx.roles
    .filter((r) => r.role === 'responsable_club' && r.club_id === clubId)
    .map((r) => ({ role: r, licencie: ctx.licencieParId.get(r.licencie_id) }))
    .filter((x) => x.licencie);
}

export function PageClubs({ ctx }) {
  const { clubs, licencies, estCadre } = ctx;
  const lignes = useMemo(() => clubs.map((c) => {
    const membres = licencies.filter((l) => l.club_id === c.id);
    const fact = ctx.factures.filter((f) => f.club_id === c.id && f.statut !== 'annulee');
    const du = fact.filter((f) => f.statut === 'generee' || f.statut === 'envoyee').reduce((n, f) => n + f.montant_xpf, 0);
    return { club: c, actifs: membres.filter((l) => l.statut === 'actif').length, total: membres.length, resp: responsablesDe(ctx, c.id), nbFactures: fact.length, du };
  }), [clubs, licencies, ctx.roles, ctx.factures]);
  const trier = (t) => [...t].sort((x, y) => x.club.nom.localeCompare(y.club.nom, 'fr'));
  const affilies = trier(lignes.filter((x) => x.actifs > 0));
  const nonAffilies = trier(lignes.filter((x) => x.actifs === 0));

  return html`<div class="page">
    <div class="page-tete">
      <div><h1>Clubs</h1><p>${clubs.length} club${clubs.length > 1 ? 's' : ''} · ${lignes.filter((x) => x.actifs > 0).length} affilié${lignes.filter((x) => x.actifs > 0).length > 1 ? 's' : ''} pour la saison</p></div>
      ${estCadre && html`<div class="page-actions"><a class="btn btn-primaire" href=${lien(['clubs', 'nouveau'])}><${Icone} nom="plus" taille=${20} /> Nouveau club</a></div>`}
    </div>
    ${clubs.length === 0 ? html`<p class="vide">Aucun club.</p>` : html`<div>
      ${[['Clubs affiliés', affilies], ['Clubs non affiliés', nonAffilies]].map(([titre, liste]) => liste.length > 0 && html`<section key=${titre}>
        <h2 class="groupe-titre">${titre} (${liste.length})</h2>
        <ul class="liste">
      ${liste.map(({ club, actifs, total, resp, nbFactures, du }) => html`<li key=${club.id}>
        <a class=${'ligne' + (club.actif ? '' : ' ligne-archive')} style="display:flex" href=${lien(['clubs', club.id])}>
          <span class="ligne-nom">
            <strong>${club.nom}${club.sigle ? ` (${club.sigle})` : ''}</strong>
            <small>${resp.length ? 'Responsable : ' + resp.map((r) => nomComplet(r.licencie)).join(', ') : 'Aucun responsable désigné'}</small>
          </span>
          <span class="etiquettes">
            <${Pastille} genre="actif">${actifs} actif${actifs > 1 ? 's' : ''}<//>
            <${Pastille}>${total} fiche${total > 1 ? 's' : ''}<//>
            ${nbFactures > 0 && (du > 0 ? html`<${Pastille} genre="alerte">${fmtXpf(du)} à régler<//>` : html`<${Pastille} genre="actif">À jour de ses factures<//>`)}
            ${!club.actif && html`<${Pastille} genre="archive">Inactif<//>`}
          </span>
        </a>
      </li>`)}
        </ul>
      </section>`)}
    </div>`}
  </div>`;
}

const clubVide = { nom: '', sigle: '', adresse: '', email_facturation: '', actif: true };

function FormulaireClub({ ctx, club }) {
  const nouveau = !club;
  const depuis = (c) => ({ nom: c.nom || '', sigle: c.sigle || '', adresse: c.adresse || '', email_facturation: c.email_facturation || '', actif: c.actif !== false });
  const [f, setF] = useState(depuis(club || clubVide));
  const [erreurs, setErreurs] = useState({});
  const [occupe, setOccupe] = useState(false);
  useEffect(() => { if (club) setF(depuis(club)); }, [club]);
  const maj = (p) => setF((x) => ({ ...x, ...p }));
  const norme = (x) => ({ nom: x.nom.trim(), sigle: x.sigle.trim() || null, adresse: x.adresse.trim() || null, email_facturation: x.email_facturation.trim().toLowerCase() || null, actif: !!x.actif });
  const modifie = nouveau || JSON.stringify(norme(f)) !== JSON.stringify(norme(depuis(club)));
  const peutModifier = ctx.estCadre;

  async function enregistrer(e) {
    e.preventDefault();
    const err = {};
    if (!f.nom.trim()) err.nom = 'Obligatoire.';
    else if (ctx.clubs.some((c) => c.id !== club?.id && norm(c.nom) === norm(f.nom))) err.nom = 'Un club porte déjà ce nom.';
    if (!emailValide(f.email_facturation)) err.email = 'Adresse e-mail invalide.';
    setErreurs(err);
    if (Object.keys(err).length) return;
    setOccupe(true);
    try {
      if (nouveau) {
        const cree = await api.creerClub(norme(f));
        await ctx.recharger();
        toast('Club créé.');
        naviguer(['clubs', cree.id]);
      } else {
        await api.majClub(club.id, norme(f));
        await ctx.recharger();
        toast('Club enregistré.');
      }
    } catch (er) {
      toast(msgErreur(er), 'erreur');
    } finally {
      setOccupe(false);
    }
  }

  return html`<form class="carte" onSubmit=${enregistrer} noValidate>
    <h2>Informations du club</h2>
    <div class="grille grille-2">
      <${Champ} id="k-nom" libelle="Nom du club" erreur=${erreurs.nom}>
        <input id="k-nom" type="text" disabled=${!peutModifier} value=${f.nom} onInput=${(e) => maj({ nom: e.target.value })} />
      <//>
      <${Champ} id="k-sigle" libelle="Sigle">
        <input id="k-sigle" type="text" disabled=${!peutModifier} value=${f.sigle} onInput=${(e) => maj({ sigle: e.target.value })} />
      <//>
      <div class="plein">
        <${Champ} id="k-adresse" libelle="Adresse">
          <input id="k-adresse" type="text" disabled=${!peutModifier} value=${f.adresse} onInput=${(e) => maj({ adresse: e.target.value })} />
        <//>
      </div>
      <${Champ} id="k-email" libelle="E-mail de facturation" aide="Les factures en PDF seront envoyées à cette adresse." erreur=${erreurs.email}>
        <input id="k-email" type="email" disabled=${!peutModifier} value=${f.email_facturation} onInput=${(e) => maj({ email_facturation: e.target.value })} />
      <//>
      <div class="champ">
        <span class="etiquette">Statut</span>
        <div class="case">
          <input id="k-actif" type="checkbox" disabled=${!peutModifier} checked=${f.actif} onChange=${(e) => maj({ actif: e.target.checked })} />
          <label for="k-actif">Club actif</label>
        </div>
      </div>
    </div>
    ${peutModifier && html`<div class="actions">
      <button class="btn btn-primaire" type="submit" disabled=${!modifie || occupe}>${occupe ? 'Enregistrement…' : nouveau ? 'Créer le club' : 'Enregistrer'}</button>
      ${nouveau && html`<a class="btn btn-secondaire" href=${lien(['clubs'])}>Annuler</a>`}
    </div>`}
  </form>`;
}

function CarteResponsables({ ctx, club }) {
  const resp = responsablesDe(ctx, club.id);
  const [ajout, setAjout] = useState(null);
  const [aRetirer, setARetirer] = useState(null);
  const [occupe, setOccupe] = useState(false);
  const candidats = useMemo(() => ctx.licencies
    .filter((l) => l.club_id === club.id && l.statut === 'actif' && !resp.some((r) => r.licencie.id === l.id))
    .map((l) => ({ id: l.id, libelle: nomComplet(l), detail: l.categorie, cle: norm(`${l.prenom} ${l.nom}`) })), [ctx.licencies, ctx.roles, club.id]);

  async function ajouter() {
    if (!ajout) return;
    setOccupe(true);
    try {
      await api.ajouterRole(ajout, 'responsable_club', club.id);
      await ctx.recharger();
      toast('Responsable de club ajouté.');
      setAjout(null);
    } catch (err) {
      toast(msgErreur(err), 'erreur');
    } finally {
      setOccupe(false);
    }
  }

  async function retirer() {
    setOccupe(true);
    try {
      await api.retirerRole(aRetirer.role.id);
      await ctx.recharger();
      toast('Responsable retiré.');
      setARetirer(null);
    } catch (err) {
      toast(msgErreur(err), 'erreur');
    } finally {
      setOccupe(false);
    }
  }

  return html`<section class="carte" aria-label="Responsables du club">
    <h2>Responsables du club</h2>
    ${resp.length === 0
      ? html`<p class="avis">Aucun responsable désigné. Il inscrira les joueurs du club aux compétitions et recevra les factures.</p>`
      : html`<ul class="historique">
          ${resp.map((r) => html`<li key=${r.role.id}>
            <strong style="flex:1">${nomComplet(r.licencie)}</strong>
            <small>${r.licencie.email || 'sans e-mail'}</small>
            ${ctx.estCadre && html`<button class="btn btn-lien" type="button" onClick=${() => setARetirer(r)}>Retirer</button>`}
          </li>`)}
        </ul>`}
    ${ctx.estCadre && html`<div style="margin-top:16px">
      <${Champ} id="k-resp" libelle="Ajouter un responsable" aide="Choisis parmi les licenciés actifs du club. Son compte de connexion est créé séparément.">
        <${ChoixPersonne} id="k-resp" options=${candidats} valeur=${ajout} onChange=${setAjout} />
      <//>
      <div class="actions"><button class="btn btn-primaire" type="button" disabled=${!ajout || occupe} onClick=${ajouter}>Ajouter comme responsable</button></div>
    </div>`}
    ${aRetirer && html`<${Dialogue} titre="Retirer ce responsable ?" onFermer=${() => setARetirer(null)}>
      <p>${nomComplet(aRetirer.licencie)} ne pourra plus inscrire les joueurs de ${club.nom} ni consulter ses factures.</p>
      <div class="actions">
        <button class="btn btn-danger" type="button" disabled=${occupe} onClick=${retirer}>Retirer</button>
        <button class="btn btn-secondaire" type="button" onClick=${() => setARetirer(null)}>Annuler</button>
      </div>
    <//>`}
  </section>`;
}

export function PageClub({ ctx, id }) {
  const club = id === 'nouveau' ? null : ctx.clubParId.get(id);
  if (id !== 'nouveau' && !club) {
    return html`<div class="page"><a class="retour" href=${lien(['clubs'])}><${Icone} nom="retour" taille=${20} /> Clubs</a><p class="vide">Club introuvable.</p></div>`;
  }
  if (id === 'nouveau' && !ctx.estCadre) {
    return html`<div class="page"><p class="vide">Seul le cadre fédéral peut créer un club.</p></div>`;
  }
  const membres = club ? ctx.licenciesGeres.filter((l) => l.club_id === club.id) : [];
  const actifs = membres.filter((l) => l.statut === 'actif').length;
  return html`<div class="page">
    <a class="retour" href=${lien(['clubs'])}><${Icone} nom="retour" taille=${20} /> Clubs</a>
    <div class="page-tete">
      <div><h1>${club ? club.nom : 'Nouveau club'}</h1>${club && html`<p>${actifs > 0 ? 'Affilié' : 'Non affilié'} pour la saison · ${actifs} licencié${actifs > 1 ? 's' : ''} actif${actifs > 1 ? 's' : ''} · ${membres.length} fiche${membres.length > 1 ? 's' : ''} au total</p>`}</div>
      ${club && html`<div class="page-actions"><a class="btn btn-secondaire" href=${lien(['licencies'], { club: club.id })}>Voir les licenciés</a></div>`}
    </div>
    <${FormulaireClub} ctx=${ctx} club=${club} />
    ${club && html`<${CarteResponsables} ctx=${ctx} club=${club} />`}
  </div>`;
}
