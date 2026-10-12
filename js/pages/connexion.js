// Écrans de connexion, de mot de passe oublié et de nouveau mot de passe.
import { html, useState } from '../preact.js';
import { sb } from '../data.js';
import { msgErreur } from '../lib.js';
import { Champ } from '../ui.js';

function Cadre({ titre, children }) {
  return html`<div class="connexion">
    <div class="drapeau" aria-hidden="true"><span></span><span></span><span></span></div>
    <main class="connexion-corps">
      <div class="carte connexion-carte">
        <img src="assets/logo-complet.png" alt="Fédération Tahitienne de Tennis de Table" />
        <h1>${titre}</h1>
        ${children}
      </div>
    </main>
  </div>`;
}

export function PageConnexion() {
  const [mode, setMode] = useState('connexion'); // 'connexion', 'oubli' ou 'creation'
  const [email, setEmail] = useState('');
  const [mdp, setMdp] = useState('');
  const [mdp2, setMdp2] = useState('');
  const [erreur, setErreur] = useState('');
  const [info, setInfo] = useState('');
  const [occupe, setOccupe] = useState(false);

  async function envoyer(e) {
    e.preventDefault();
    setErreur('');
    setInfo('');
    setOccupe(true);
    try {
      if (mode === 'connexion') {
        const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: mdp });
        if (error) throw error;
      } else if (mode === 'creation') {
        if (mdp.length < 10) throw new Error('Le mot de passe doit contenir au moins 10 caractères.');
        if (mdp !== mdp2) throw new Error('Les deux mots de passe ne sont pas identiques.');
        const { error } = await sb.auth.signUp({
          email: email.trim(), password: mdp,
          options: { emailRedirectTo: location.origin + location.pathname }
        });
        if (error) throw error;
        setInfo('Compte en cours de création. Ouvre l\'e-mail que nous venons de t\'envoyer et clique sur le lien de confirmation, puis connecte-toi. Utilise l\'adresse e-mail inscrite sur ta fiche de licencié.');
        setMdp(''); setMdp2('');
      } else {
        const { error } = await sb.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: location.origin + location.pathname
        });
        if (error) throw error;
        setInfo('Si cette adresse correspond à un compte, un e-mail de réinitialisation vient d\'être envoyé.');
      }
    } catch (err) {
      setErreur(msgErreur(err));
    } finally {
      setOccupe(false);
    }
  }

  return html`<${Cadre} titre=${mode === 'connexion' ? 'Connexion' : mode === 'creation' ? 'Créer mon compte' : 'Mot de passe oublié'}>
    <form class="grille" onSubmit=${envoyer} noValidate>
      <${Champ} id="c-email" libelle="Adresse e-mail">
        <input id="c-email" type="email" autocomplete="username" required value=${email}
          onInput=${(e) => setEmail(e.target.value)} />
      <//>
      ${mode !== 'oubli' && html`<${Champ} id="c-mdp" libelle="Mot de passe" aide=${mode === 'creation' ? '10 caractères minimum.' : undefined}>
        <input id="c-mdp" type="password" autocomplete=${mode === 'creation' ? 'new-password' : 'current-password'} required value=${mdp}
          onInput=${(e) => setMdp(e.target.value)} />
      <//>`}
      ${mode === 'creation' && html`<${Champ} id="c-mdp2" libelle="Confirmer le mot de passe">
        <input id="c-mdp2" type="password" autocomplete="new-password" required value=${mdp2}
          onInput=${(e) => setMdp2(e.target.value)} />
      <//>`}
      ${erreur && html`<p class="erreur" role="alert">${erreur}</p>`}
      ${mode === 'creation' && html`<p class="aide">Réservé aux responsables de club, cadres fédéraux et juges-arbitres, avec l'adresse e-mail enregistrée sur ta fiche. Le classement et les résultats sont publics, sans compte.</p>`}
      ${info && html`<p class="avis" role="status">${info}</p>`}
      <button class="btn btn-primaire btn-plein" type="submit" disabled=${occupe || !email || (mode !== 'oubli' && !mdp) || (mode === 'creation' && !mdp2)}>
        ${occupe ? 'Patiente…' : mode === 'connexion' ? 'Se connecter' : mode === 'creation' ? 'Créer mon compte' : 'Envoyer le lien'}
      </button>
      <button class="btn btn-lien" type="button"
        onClick=${() => { setMode(mode === 'connexion' ? 'oubli' : 'connexion'); setErreur(''); setInfo(''); }}>
        ${mode === 'connexion' ? 'Mot de passe oublié ?' : 'Retour à la connexion'}
      </button>
      ${mode === 'connexion' && html`<button class="btn btn-lien" type="button"
        onClick=${() => { setMode('creation'); setErreur(''); setInfo(''); }}>Créer mon compte</button>`}
      <a class="btn btn-lien" href="#/classement">Voir le classement public</a>
    </form>
  <//>`;
}

export function PageNouveauMotDePasse({ onTermine }) {
  const [mdp, setMdp] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [erreur, setErreur] = useState('');
  const [occupe, setOccupe] = useState(false);

  async function envoyer(e) {
    e.preventDefault();
    setErreur('');
    if (mdp.length < 10) return setErreur('Le mot de passe doit contenir au moins 10 caractères.');
    if (mdp !== confirmation) return setErreur('Les deux mots de passe ne sont pas identiques.');
    setOccupe(true);
    try {
      const { error } = await sb.auth.updateUser({ password: mdp });
      if (error) throw error;
      onTermine();
    } catch (err) {
      setErreur(msgErreur(err));
    } finally {
      setOccupe(false);
    }
  }

  return html`<${Cadre} titre="Nouveau mot de passe">
    <form class="grille" onSubmit=${envoyer} noValidate>
      <${Champ} id="n-mdp" libelle="Nouveau mot de passe" aide="10 caractères minimum.">
        <input id="n-mdp" type="password" autocomplete="new-password" value=${mdp} onInput=${(e) => setMdp(e.target.value)} />
      <//>
      <${Champ} id="n-conf" libelle="Confirmer le mot de passe">
        <input id="n-conf" type="password" autocomplete="new-password" value=${confirmation} onInput=${(e) => setConfirmation(e.target.value)} />
      <//>
      ${erreur && html`<p class="erreur" role="alert">${erreur}</p>`}
      <button class="btn btn-primaire btn-plein" type="submit" disabled=${occupe}>Enregistrer</button>
    </form>
  <//>`;
}
