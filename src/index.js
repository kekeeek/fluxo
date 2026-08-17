// Cloudflare Worker — entry point.
//
// Two jobs:
// 1. Serve the static site (index.html, app.html, etc.) from the ASSETS
//    binding, exactly like a normal static host.
// 2. For /r/<code>, don't serve a static file — fetch the file server-side
//    from gofile and stream the bytes back under the Fluxo domain, so the
//    browser's address bar never shows gofile.io.
//
// gofile now requires an authenticated request even to read public file
// info. Set a GOFILE_TOKEN environment variable in the Worker's settings
// (Settings → Variables) with your own gofile account token for stable,
// rate-limit-friendly access. Without it, this falls back to creating a
// fresh temporary guest account per request.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/r\/([A-Za-z0-9_-]+)\/?$/);

    if (match) {
      return handleDirectLink(match[1], request, env);
    }

    return env.ASSETS.fetch(request);
  }
};

async function getToken(env) {
  if (env && env.GOFILE_TOKEN) return env.GOFILE_TOKEN;

  const res = await fetch('https://api.gofile.io/accounts', { method: 'POST' });
  const data = await res.json();
  if (data.status !== 'ok' || !data.data || !data.data.token) {
    throw new Error('Impossible de créer un compte invité gofile.');
  }
  return data.data.token;
}

async function handleDirectLink(code, request, env) {
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
