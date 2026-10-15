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
import { PageFactures } from './pages/factures.js';
import { PagePublique } from './pages/public.js';
import { PageSimulateur } from './pages/simulateur.js';
import { PageCalendrier } from './pages/calendrier.js';
import { PageSinscrire } from './pages/sinscrire.js';
import { PageMonProfil, lireSouvenir } from './pages/monprofil.js';
import { PageJoueur } from './pages/joueur.js';
import { PagePoints } from './pages/points.js';
import { PageComptes } from './pages/comptes.js';
import { PageJournal } from './pages/journal.js';
import { PageCertificats } from './pages/certificats.js';
import { PageRenouvellements } from './pages/renouvellements.js';
import { api } from './data.js';

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
          ${gestion && lienNav('factures', ['factures'], 'Factures', 'factures')}
          ${lienNav('classement', ['classement'], 'Classement', 'classement')}
          ${lienNav('simulateur', ['simulateur'], 'Simulateur', 'points')}
          ${ctx.estCadre && lienNav('renouvellements', ['renouvellements'], 'Renouvellements', 'licencies')}
          ${ctx.estCadre && lienNav('points', ['points'], 'Points', 'journal')}
          ${ctx.estCadre && lienNav('comptes', ['comptes'], 'Comptes', 'profil')}
          ${ctx.estCadre && lienNav('journal', ['journal'], 'Journal', 'journal')}
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
  if (p === 'classement' || p === 'resultats') return html`<${PagePublique} route=${route} connecte=${true} />`;
  if (p === 'calendrier') return html`<${PageCalendrier} />`;
  if (p === 'sinscrire') return html`<${PageSinscrire} />`;
  if (p === 'monprofil') return html`<${PageMonProfil} />`;
  if (p === 'simulateur') return html`<${PageSimulateur} route=${route} />`;
  if (p === 'joueur' && id) return html`<${PageJoueur} id=${id} />`;
  if (p === 'connexion') return html`<${PageAccueil} ctx=${ctx} />`;
  if (p === 'renouvellements' && ctx.estCadre) return html`<${PageRenouvellements} ctx=${ctx} />`;
  if (p === 'comptes' && ctx.estCadre) return html`<${PageComptes} ctx=${ctx} />`;
  if (p === 'certificats' && gestion) return html`<${PageCertificats} ctx=${ctx} />`;
  if (p === 'journal' && ctx.estCadre) return html`<${PageJournal} ctx=${ctx} route=${route} />`;
  if (p === 'points' && ctx.estCadre) return html`<${PagePoints} ctx=${ctx} />`;
  if (p === 'factures' && gestion) return html`<${PageFactures} ctx=${ctx} route=${route} />`;
  return html`<div class="page"><p class="vide">Page introuvable. <a href=${lien([])}>Retour à l'accueil</a></p></div>`;
}

function App() {
  const [session, setSession] = useState(undefined); // undefined = pas encore connu
  const [recuperation, setRecuperation] = useState(false);
  const [data, setData] = useState(null);
  const [erreur, setErreur] = useState('');
  const [rattachement, setRattachement] = useState({ essai: false, raison: '' });
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
  useEffect(() => { if (uid) charger(); else setRattachement({ essai: false, raison: '' }); }, [uid]);
  const rattacher = useCallback(async () => {
    try {
      const r = await api.lierMonCompte();
      if (r?.lie) await charger();
      setRattachement({ essai: true, raison: r?.lie ? '' : (r?.raison || '') });
    } catch (e) { setRattachement({ essai: true, raison: 'erreur' }); }
  }, [charger]);

  useEffect(() => {
    if (data && uid && !data.licencies.some((l) => l.user_id === uid) && !rattachement.essai) {
      setRattachement({ essai: true, raison: 'encours' });
      rattacher();
    }
  }, [data, uid, rattachement.essai]);

  if (session === undefined) return html`<${Chargement} />`;
  if (!session) {
    const p0 = route.parts[0];
    if (p0 !== 'connexion') {
      const page = p0 === 'calendrier' ? html`<${PageCalendrier} />`
        : p0 === 'sinscrire' ? html`<${PageSinscrire} />`
        : p0 === 'monprofil' || (!p0 && lireSouvenir()) ? html`<${PageMonProfil} />`
        : p0 === 'simulateur' ? html`<${PageSimulateur} route=${route} />`
        : p0 === 'joueur' && route.parts[1] ? html`<${PageJoueur} id=${route.parts[1]} />`
        : html`<${PagePublique} route=${route} connecte=${false} />`;
      return html`<div class="appli-public"><div class="drapeau" aria-hidden="true"><span></span><span></span><span></span></div>
        <header class="public-tete"><a href=${lien([])}><img src="assets/logo-complet.png" alt="Fédération Tahitienne de Tennis de Table" /></a>
          <a class="btn btn-secondaire" href=${lien(['connexion'])}>Espace clubs et arbitres</a></header>
        <main class="contenu">${page}</main></div>`;
    }
    return html`<${PageConnexion} />`;
  }
  if (recuperation) return html`<${PageNouveauMotDePasse} onTermine=${() => setRecuperation(false)} />`;
  const deconnexion = html`<button class="btn btn-secondaire" type="button" onClick=${() => sb.auth.signOut()}>Se déconnecter</button>`;
  if (erreur) return html`<${Ecran} titre="Chargement impossible" texte=${erreur} bouton=${html`<button class="btn btn-primaire" type="button" onClick=${charger}>Réessayer</button>`} />`;
  if (!data) return html`<${Chargement} />`;

  const ctx = construireContexte(data, session);
  ctx.recharger = charger;
  if (!ctx.moi) {
    if (rattachement.raison === 'encours') return html`<${Chargement} texte="Rattachement de ton compte…" />`;
    const textes = {
      email_non_confirme: 'Ton adresse e-mail n\'est pas encore confirmée. Clique sur le lien reçu par e-mail, puis réessaie.',
      ambigu: 'Plusieurs fiches portent ton adresse e-mail. Contacte la fédération pour qu\'elle corrige cela.',
      aucun_acces: 'Les comptes sont réservés aux responsables de club, aux cadres fédéraux et aux juges-arbitres. Les résultats, le classement, le calendrier et le simulateur sont accessibles à tous, sans compte. Si tu dois avoir un accès, demande à la fédération de te l\'attribuer.',
      erreur: 'Le rattachement a échoué. Réessaie dans un instant.'
    };
    const texte = textes[rattachement.raison]
      || 'Aucune fiche de licencié majeur ne porte cette adresse e-mail. Vérifie que la fédération ou ton club a bien enregistré cette adresse sur ta fiche.';
    return html`<${Ecran} titre="Compte non rattaché" texte=${texte}
      bouton=${html`<div class="actions"><button class="btn btn-primaire" type="button" onClick=${() => { setRattachement({ essai: false, raison: '' }); }}>Réessayer</button>${deconnexion}</div>`} />`;
  }
  return html`<${Cadre} ctx=${ctx} route=${route}><${Pages} ctx=${ctx} route=${route} /><//>`;
}

function Racine() {
  return html`<${App} /><${Messages} />`;
}

render(html`<${Racine} />`, document.getElementById('app'));
