// Point d'entrée : session, chargement des données, navigation et cadre de l'application.
import { html, render, useState, useEffect, useCallback } from './preact.js';
import { sb, chargerTout } from './data.js';
import { construireContexte } from './vue.js';
import { lireRoute, lien, nomComplet } from './lib.js';
import { Icone, Chargement, Messages } from './ui.js';
import { PageConnexion, PageNouveauMotDePasse } from './pages/connexion.js';
import { PageAccueil } from './pages/accueil.js';
import { PageLicencies } from './pages/licencies.js';
import { PageLicencie, PageNouveauLicencie } from './pages/licencie.js';
import { PageClubs, PageClub } from './pages/clubs.js';
import { PageCompetitions, PageCompetition } from './pages/competitions.js';

function useRoute() {
  const [route, setRoute] = useState(lireRoute());
  useEffect(() => {
    const f = () => { setRoute(lireRoute()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return route;
}

const libelleRole = (ctx) => (ctx.estCadre ? 'Cadre fédéral' : ctx.estResponsable ? 'Responsable de club' : 'Licencié');

function Cadre({ ctx, route, children }) {
  const [ouvert, setOuvert] = useState(false);
  useEffect(() => setOuvert(false), [route.parts.join('/')]);
  const section = route.parts[0] || '';
  const gestion = ctx.estCadre || ctx.estResponsable;
  const lienNav = (cle, parts, label, icone) => html`<a href=${lien(parts)} aria-current=${section === cle ? 'page' : undefined}>
    <${Icone} nom=${icone} taille=${22} /> ${label}</a>`;
  const bientot = (label, icone) => html`<span class="nav-inactif"><${Icone} nom=${icone} taille=${22} /> ${label} <em>bientôt</em></span>`;
  return html`<div class="appli">
    <header class="entete">
      <div class="drapeau" aria-hidden="true"><span></span><span></span><span></span></div>
      <div class="entete-barre">
        <img src="assets/logo-complet.png" alt="FTTT" />
        <button class="btn-icone" type="button" aria-label="Menu" aria-expanded=${ouvert} onClick=${() => setOuvert(!ouvert)}>
          <${Icone} nom=${ouvert ? 'fermer' : 'menu'} taille=${26} />
        </button>
      </div>
      <div class=${'menu' + (ouvert ? ' ouvert' : '')}>
        <img class="menu-logo" src="assets/logo-complet.png" alt="Fédération Tahitienne de Tennis de Table" />
        <nav class="nav" aria-label="Navigation principale">
          ${lienNav('', [], 'Accueil', 'accueil')}
          ${gestion
            ? html`${lienNav('licencies', ['licencies'], 'Licenciés', 'licencies')}${lienNav('clubs', ['clubs'], 'Clubs', 'clubs')}`
            : lienNav('profil', ['profil'], 'Ma fiche', 'profil')}
          ${lienNav('competitions', ['competitions'], 'Compétitions', 'competitions')}
          ${bientot('Classement', 'classement')}
        </nav>
        <div class="compte">
          <div class="compte-role">${libelleRole(ctx)}</div>
          <div class="compte-nom">${nomComplet(ctx.moi)}</div>
          <button class="btn btn-secondaire" type="button" onClick=${() => sb.auth.signOut()}>
            <${Icone} nom="sortie" taille=${20} /> Se déconnecter
          </button>
        </div>
      </div>
    </header>
    <main class="contenu">${children}</main>
  </div>`;
}

function Ecran({ titre, texte, bouton }) {
  return html`<div class="connexion"><div class="drapeau" aria-hidden="true"><span></span><span></span><span></span></div>
    <main class="connexion-corps"><div class="carte connexion-carte">
      <img src="assets/logo-complet.png" alt="Fédération Tahitienne de Tennis de Table" />
      <h1>${titre}</h1><p>${texte}</p>${bouton}
    </div></main></div>`;
}

function Pages({ ctx, route }) {
  const [p, id] = route.parts;
  const gestion = ctx.estCadre || ctx.estResponsable;
  if (!p) return html`<${PageAccueil} ctx=${ctx} />`;
  if (p === 'profil') return html`<${PageLicencie} ctx=${ctx} id=${ctx.moi.id} />`;
  if (p === 'licencies') {
    if (id === 'nouveau') return html`<${PageNouveauLicencie} ctx=${ctx} />`;
    if (id) return html`<${PageLicencie} ctx=${ctx} id=${id} />`;
    return gestion ? html`<${PageLicencies} ctx=${ctx} route=${route} />` : html`<${PageAccueil} ctx=${ctx} />`;
  }
  if (p === 'clubs' && gestion) return id ? html`<${PageClub} ctx=${ctx} id=${id} />` : html`<${PageClubs} ctx=${ctx} />`;
  if (p === 'competitions') return id ? html`<${PageCompetition} ctx=${ctx} id=${id} />` : html`<${PageCompetitions} ctx=${ctx} route=${route} />`;
  return html`<div class="page"><p class="vide">Page introuvable. <a href=${lien([])}>Retour à l'accueil</a></p></div>`;
}

function App() {
  const [session, setSession] = useState(undefined); // undefined = pas encore connu
  const [recuperation, setRecuperation] = useState(false);
  const [data, setData] = useState(null);
  const [erreur, setErreur] = useState('');
  const route = useRoute();

  useEffect(() => {
    sb.auth.getSession().then(({ data: d }) => setSession(d.session));
    const { data: abo } = sb.auth.onAuthStateChange((evt, s) => {
      if (evt === 'PASSWORD_RECOVERY') setRecuperation(true);
      if (evt === 'SIGNED_OUT') { setData(null); setRecuperation(false); }
      setSession(s);
    });
    return () => abo.subscription.unsubscribe();
  }, []);

  const uid = session?.user?.id;
  const charger = useCallback(async () => {
    try { setErreur(''); setData(await chargerTout()); }
    catch (e) { setErreur(e?.message || 'Erreur de chargement.'); }
  }, []);
  useEffect(() => { if (uid) charger(); }, [uid]);

  if (session === undefined) return html`<${Chargement} />`;
  if (!session) return html`<${PageConnexion} />`;
  if (recuperation) return html`<${PageNouveauMotDePasse} onTermine=${() => setRecuperation(false)} />`;
  const deconnexion = html`<button class="btn btn-secondaire" type="button" onClick=${() => sb.auth.signOut()}>Se déconnecter</button>`;
  if (erreur) return html`<${Ecran} titre="Chargement impossible" texte=${erreur} bouton=${html`<button class="btn btn-primaire" type="button" onClick=${charger}>Réessayer</button>`} />`;
  if (!data) return html`<${Chargement} />`;

  const ctx = construireContexte(data, session);
  ctx.recharger = charger;
  if (!ctx.moi) {
    return html`<${Ecran} titre="Compte non rattaché" texte="Ton compte n'est pas encore relié à une fiche de licencié. Contacte la fédération pour qu'elle le relie." bouton=${deconnexion} />`;
  }
  return html`<${Cadre} ctx=${ctx} route=${route}><${Pages} ctx=${ctx} route=${route} /><//>`;
}

function Racine() {
  return html`<${App} /><${Messages} />`;
}

render(html`<${Racine} />`, document.getElementById('app'));
