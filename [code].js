// Cloudflare Pages Function — handles requests to /r/<code>
//
// Unlike the GitHub Pages redirect (404.html), this doesn't just send the
// visitor to gofile.io — it fetches the file server-side and streams the
// bytes back under the Fluxo domain, so the browser's address bar stays on
// fluxo the whole time.
//
// File path convention for Cloudflare Pages Functions: this file at
// functions/r/[code].js handles GET/HEAD requests to /r/<anything>.
//
// gofile now requires an authenticated request even to read public file
// info. Set a GOFILE_TOKEN environment variable in the Cloudflare Pages
// project (Settings → Environment variables) with your own gofile account
// token for stable, rate-limit-friendly access. Without it, this function
// falls back to creating a fresh temporary guest account per request, which
// works but is more likely to get rate-limited under real traffic.

async function getToken(env) {
  if (env && env.GOFILE_TOKEN) return env.GOFILE_TOKEN;

  const res = await fetch('https://api.gofile.io/accounts', { method: 'POST' });
  const data = await res.json();
  if (data.status !== 'ok' || !data.data || !data.data.token) {
    throw new Error('Impossible de créer un compte invité gofile.');
  }
  return data.data.token;
}

export async function onRequest(context) {
  const { params, request, env } = context;
  const code = params.code;

  if (!code || typeof code !== 'string') {
    return new Response('Lien invalide.', { status: 400 });
  }

  let token;
  try {
    token = await getToken(env);
  } catch (e) {
    return new Response('Impossible de contacter gofile pour le moment.', { status: 502 });
  }

  let meta;
  try {
    const metaRes = await fetch(`https://api.gofile.io/contents/${code}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    meta = await metaRes.json();
  } catch (e) {
    return new Response('Impossible de contacter gofile pour le moment.', { status: 502 });
  }

  if (!meta || meta.status !== 'ok' || !meta.data) {
    return new Response('Fichier introuvable ou expiré.', { status: 404 });
  }

  let fileData = meta.data;

  // Uploads live inside an auto-created folder — if the code points to a
  // folder, grab the first file inside it.
  if (fileData.type === 'folder') {
    if (fileData.public === false) {
      return new Response('Ce fichier est privé.', { status: 403 });
    }
    const children = Object.values(fileData.children || {});
    const firstFile = children.find((c) => c.type === 'file');
    if (!firstFile) return new Response('Aucun fichier trouvé dans ce lien.', { status: 404 });
    fileData = firstFile;
  }

  const directLink = fileData.link;
  if (!directLink) {
    return new Response('Lien de fichier introuvable (compte requis ou fichier protégé ?).', { status: 404 });
  }

  // Proxy the actual bytes from gofile's CDN through this function.
  const upstreamHeaders = {};
  const range = request.headers.get('range');
  if (range) upstreamHeaders['Range'] = range;

  let fileRes;
  try {
    fileRes = await fetch(directLink, { headers: upstreamHeaders });
  } catch (e) {
    return new Response('Erreur pendant le téléchargement.', { status: 502 });
  }

  const headers = new Headers(fileRes.headers);
  headers.set('Content-Disposition', `inline; filename="${encodeURIComponent(fileData.name || 'fichier')}"`);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Cache-Control', 'no-store');

  return new Response(fileRes.body, {
    status: fileRes.status,
    headers
  });
}
