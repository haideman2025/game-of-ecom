/* GET /api/music/fetch?url=<encoded-audio-url>
   Proxy audio fetch from whitelisted free-music hosts to bypass CORS for the Studio.
   Returns the audio bytes with permissive CORS headers + long cache.
   Whitelist prevents SSRF / abuse.
*/
const ALLOWED_HOSTS = [
  'cdn.pixabay.com',
  'pixabay.com',
  'assets.mixkit.co',
  'cdn.freesound.org',
  'incompetech.com',
  'incompetech.filmmusic.io',
  'cdn.uppbeat.io',
  'audio.jukehost.co.uk',
  'freepd.com',
  'www.freepd.com',
  'archive.org',
  'ia800500.us.archive.org',
  'ia800501.us.archive.org',
  'www.bensound.com',
  'bensound.com'
];

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const target = url.searchParams.get('url');
  if (!target) return new Response('Missing url param', { status: 400 });

  let u;
  try { u = new URL(target); }
  catch (e) { return new Response('Invalid url', { status: 400 }); }

  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    return new Response('Invalid protocol', { status: 400 });
  }

  const hostOk = ALLOWED_HOSTS.some(h => u.hostname === h || u.hostname.endsWith('.' + h));
  if (!hostOk) {
    return new Response(`Host ${u.hostname} not allowed. Allowed: ${ALLOWED_HOSTS.join(', ')}`, { status: 403 });
  }

  try {
    const upstream = await fetch(target, {
      headers: {
        'User-Agent': 'GameOfEcom-Studio/1.0 (+https://fb-pack-studio.pages.dev)',
        'Accept': 'audio/*,*/*;q=0.8',
        'Referer': u.origin + '/'
      },
      // Long-running fetch can take a few seconds for big files
      cf: { cacheTtl: 86400, cacheEverything: true }
    });
    if (!upstream.ok) {
      const body = await upstream.text().then(t => t.slice(0, 300)).catch(() => '');
      // Surface upstream status code directly so client can show useful error
      return new Response(
        JSON.stringify({ error: 'upstream', status: upstream.status, statusText: upstream.statusText, host: u.hostname, body }),
        { status: upstream.status === 404 ? 404 : 502, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }
    const contentType = upstream.headers.get('content-type') || 'audio/mpeg';
    const contentLength = upstream.headers.get('content-length');
    // Cap size to 30MB (free music tracks usually < 10MB)
    if (contentLength && Number(contentLength) > 30 * 1024 * 1024) {
      return new Response('File too large (>30MB)', { status: 413 });
    }
    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        ...(contentLength ? { 'Content-Length': contentLength } : {}),
        'Cache-Control': 'public, max-age=86400, immutable',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'X-Music-Source': u.hostname
      }
    });
  } catch (e) {
    return new Response('Fetch failed: ' + e.message, { status: 500 });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Max-Age': '86400'
    }
  });
}
