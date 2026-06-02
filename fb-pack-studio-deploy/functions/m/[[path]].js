/* GET /m/:path — public stream from R2 bucket MEDIA.
   No auth — Zernio (and FB Graph crawler) must fetch this directly.
   Path is the R2 key (user_id/timestamp_rand.ext). */
export async function onRequestGet({ request, env, params }) {
  if (!env.MEDIA) {
    return new Response('R2 not configured', { status: 503 });
  }

  const key = Array.isArray(params.path) ? params.path.join('/') : params.path;
  if (!key) return new Response('Missing key', { status: 400 });

  let obj;
  try {
    obj = await env.MEDIA.get(key);
  } catch (e) {
    return new Response('R2 fetch failed: ' + e.message, { status: 502 });
  }
  if (!obj) return new Response('Not found', { status: 404 });

  const contentType = obj.httpMetadata?.contentType || 'application/octet-stream';
  const headers = new Headers({
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=86400',
    'Access-Control-Allow-Origin': '*',
    'Content-Length': String(obj.size)
  });
  // Handle range requests for video streaming
  const range = request.headers.get('range');
  if (range) {
    const m = range.match(/bytes=(\d+)-(\d*)/);
    if (m) {
      const start = parseInt(m[1]);
      const end = m[2] ? parseInt(m[2]) : obj.size - 1;
      const ranged = await env.MEDIA.get(key, { range: { offset: start, length: end - start + 1 } });
      if (ranged) {
        headers.set('Content-Range', `bytes ${start}-${end}/${obj.size}`);
        headers.set('Content-Length', String(end - start + 1));
        headers.set('Accept-Ranges', 'bytes');
        return new Response(ranged.body, { status: 206, headers });
      }
    }
  }

  return new Response(obj.body, { headers });
}

export async function onRequestHead({ request, env, params }) {
  if (!env.MEDIA) return new Response(null, { status: 503 });
  const key = Array.isArray(params.path) ? params.path.join('/') : params.path;
  const obj = await env.MEDIA.head(key);
  if (!obj) return new Response(null, { status: 404 });
  return new Response(null, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
      'Content-Length': String(obj.size),
      'Accept-Ranges': 'bytes'
    }
  });
}
