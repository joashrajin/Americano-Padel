// Middleware: rewrite tournament ID paths to serve index.html
// API routes in /functions/api/* take priority over this middleware

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const path = url.pathname.replace(/^\/+|\/+$/g, '');

  // If path looks like a tournament ID (4-10 lowercase alphanumeric), serve index.html
  if (path && /^[a-z0-9]{4,10}$/.test(path)) {
    const indexUrl = new URL('/', url.origin);
    const response = await context.env.ASSETS.fetch(indexUrl);
    return new Response(response.body, {
      status: 200,
      headers: response.headers,
    });
  }

  return context.next();
}
