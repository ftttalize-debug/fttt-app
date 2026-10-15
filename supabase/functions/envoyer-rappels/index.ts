// Fonction Supabase « envoyer-rappels » : envoie l'alerte J-3 / J-1 à tous les téléphones abonnés.
// À déployer avec « Verify JWT » désactivé (elle est appelée chaque matin par pg_cron, sans compte).
// Sans danger : chaque rappel n'est réservé et envoyé qu'une seule fois par compétition (SQL 033).
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const fmt = (iso: string) => new Date(iso + 'T12:00:00Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' });

Deno.serve(async () => {
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: cfg, error: e0 } = await sb.from('push_config').select('cle_publique, cle_privee').eq('id', 1).single();
  if (e0 || !cfg) return new Response(JSON.stringify({ erreur: 'Clés absentes (script 033)' }), { status: 500 });
  webpush.setVapidDetails('https://app.fttt.pf', cfg.cle_publique, cfg.cle_privee);

  const { data: rappels, error: e1 } = await sb.rpc('rappels_a_envoyer');
  if (e1) return new Response(JSON.stringify({ erreur: e1.message }), { status: 500 });
  if (!rappels?.length) return new Response(JSON.stringify({ rappels: 0 }));

  const { data: abos } = await sb.from('push_abonnements').select('endpoint, p256dh, auth');
  let envoyes = 0, supprimes = 0;
  for (const r of rappels) {
    const titre = r.jalon === 'J1' ? 'Dernier jour demain pour s\'inscrire' : 'Inscriptions : plus que 3 jours';
    const texte = `${r.nom} : inscriptions jusqu'au ${fmt(r.date_limite)}.`;
    const charge = JSON.stringify({ titre, texte, url: '/#/calendrier' });
    for (let i = 0; i < (abos?.length ?? 0); i += 50) {
      await Promise.all(abos!.slice(i, i + 50).map(async (a) => {
        try {
          await webpush.sendNotification({ endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } }, charge, { TTL: 86400 });
          envoyes++;
        } catch (err) {
          const code = (err as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) { await sb.from('push_abonnements').delete().eq('endpoint', a.endpoint); supprimes++; }
        }
      }));
    }
  }
  return new Response(JSON.stringify({ rappels: rappels.length, envoyes, abonnements_supprimes: supprimes }));
});
