/* Minimal middleware — security headers on every response */
export const onRequest = async (ctx) => {
  const res = await ctx.next();
  // Don't override redirect responses
  if (res.status >= 300 && res.status < 400) return res;
  try {
    res.headers.set('X-Content-Type-Options', 'nosniff');
    res.headers.set('Referrer-Policy', 'no-referrer-when-downgrade');
  } catch(e) {}
  return res;
};
