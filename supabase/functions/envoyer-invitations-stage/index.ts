// Fonction Supabase « rapid-processor » (nom attribué par Supabase ; code du dossier envoyer-invitations-stage) : envoie par e-mail (Brevo) les invitations de stage mises en file par le script 045.
// À déployer avec « Verify JWT » désactivé. Sans danger : elle n'envoie que des lignes déjà autorisées par la base
// (statut « a_envoyer »), et chaque ligne est réservée avant l'envoi, donc jamais envoyée deux fois.
// Secret à créer dans Supabase (Edge Functions → Secrets) : BREVO_API_KEY.
import { createClient } from 'npm:@supabase/supabase-js@2';

const LIEN = 'https://app.fttt.pf/#/stages';
const fmt = (iso: string) => new Date(iso + 'T12:00:00Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

Deno.serve(async () => {
  const cle = Deno.env.get('BREVO_API_KEY');
  if (!cle) return new Response(JSON.stringify({ erreur: 'Secret BREVO_API_KEY absent' }), { status: 500 });
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Réserve les lignes à envoyer (une seule exécution peut les prendre)
  const { data: lignes, error } = await sb.from('invitations_stage').update({ statut: 'envoi' })
    .eq('statut', 'a_envoyer').select('id, email, destinataire, stage_id, licencie_id');
  if (error) return new Response(JSON.stringify({ erreur: error.message }), { status: 500 });
  if (!lignes?.length) return new Response(JSON.stringify({ envoyes: 0 }));

  const { data: stages } = await sb.from('stages').select('id, nom, date_debut, date_fin, lieu, tarif_licencie, tarif_non_licencie').in('id', [...new Set(lignes.map((l) => l.stage_id))]);
  const { data: jeunes } = await sb.from('licencies').select('id, prenom').in('id', lignes.map((l) => l.licencie_id));
  const stage = new Map((stages ?? []).map((s) => [s.id, s]));
  const prenom = new Map((jeunes ?? []).map((j) => [j.id, j.prenom]));

  // Un e-mail par adresse et par stage, avec le prénom de chaque jeune concerné
  const groupes = new Map<string, typeof lignes>();
  for (const l of lignes) { const k = l.email.toLowerCase() + '|' + l.stage_id; groupes.set(k, [...(groupes.get(k) ?? []), l]); }

  let envoyes = 0, echecs = 0;
  for (const g of groupes.values()) {
    const s = stage.get(g[0].stage_id);
    const ids = g.map((l) => l.id);
    if (!s) { await sb.from('invitations_stage').update({ statut: 'echec', erreur: 'Stage introuvable' }).in('id', ids); echecs += g.length; continue; }
    const noms = [...new Set(g.map((l) => prenom.get(l.licencie_id)).filter(Boolean))] as string[];
    const liste = noms.length > 1 ? noms.slice(0, -1).join(', ') + ' et ' + noms[noms.length - 1] : noms[0] ?? 'votre enfant';
    const dates = s.date_fin !== s.date_debut ? `du ${fmt(s.date_debut)} au ${fmt(s.date_fin)}` : `le ${fmt(s.date_debut)}`;
    const bonjour = g[0].destinataire ? `Bonjour ${esc(g[0].destinataire)},` : 'Bonjour,';
    const html = `<p>${bonjour}</p>
<p>Votre club vous invite à inscrire <strong>${esc(liste)}</strong> au stage <strong>${esc(s.nom)}</strong> de la Fédération Tahitienne de Tennis de Table, ${dates}${s.lieu ? ' (' + esc(s.lieu) + ')' : ''}.</p>
<p>L'inscription se fait en quelques minutes, sans compte : <a href="${LIEN}">${LIEN}</a><br>
Il suffit de saisir vos coordonnées et celles de votre enfant, puis de cocher le stage. Une fiche d'inscription déjà remplie vous sera proposée : il ne reste qu'à la signer.</p>
<p>Tarif : ${s.tarif_licencie.toLocaleString('fr-FR')} XPF pour un licencié, ${s.tarif_non_licencie.toLocaleString('fr-FR')} XPF sinon (licence événementielle incluse). Un certificat médical d'aptitude est à remettre le premier jour, sauf pour les licenciés.</p>
<p>Cordialement,<br>Fédération Tahitienne de Tennis de Table<br>contact@fttt.pf</p>`;
    try {
      const rep = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': cle, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          sender: { name: 'FTTT', email: 'no-reply@fttt.pf' }, replyTo: { email: 'contact@fttt.pf', name: 'FTTT' },
          to: [{ email: g[0].email }], subject: `Inscription au ${s.nom} (FTTT)`, htmlContent: html
        })
      });
      if (!rep.ok) throw new Error(`Brevo ${rep.status} ${(await rep.text()).slice(0, 200)}`);
      await sb.from('invitations_stage').update({ statut: 'envoyee', envoye_at: new Date().toISOString() }).in('id', ids);
      envoyes++;
    } catch (e) {
      await sb.from('invitations_stage').update({ statut: 'echec', erreur: String(e).slice(0, 300) }).in('id', ids);
      echecs++;
    }
  }
  return new Response(JSON.stringify({ envoyes, echecs }));
});
