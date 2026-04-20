// GET /functions/v1/auth-callback
//
// OAuth-flow bridge page. Supabase redirects the browser here with the PKCE
// exchange code in the URL. We respond with a tiny HTML page that hands the
// deep link `slowblink://auth/callback?<params>` to the OS so the Electron
// app can exchange the code for a session (see src/main/auth/deep-link.ts).
//
// Strategy: best-effort auto-redirect via meta refresh + scripted navigation,
// plus a visible "Open slowblink" button the user can click if the browser
// blocked the auto-redirect (modern Chrome requires a user gesture to launch
// custom protocol handlers). Then attempt window.close().
//
// JWT verification is disabled (config.toml: `[functions.auth-callback]
// verify_jwt = false`) — the browser arrives here with only a Google-
// provided code, no Supabase auth header.
//
// The URL must be listed in `auth.additional_redirect_urls` so Supabase
// accepts it as a valid `redirect_to`.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

Deno.serve((req) => {
  const url = new URL(req.url);
  const deepLink = `slowblink://auth/callback${url.search}`;
  const deepLinkHtml = escapeHtml(deepLink);
  const deepLinkJs = JSON.stringify(deepLink);

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta http-equiv="refresh" content="0;url=${deepLinkHtml}">
  <title>Signed in — slowblink</title>
  <style>
    html, body { height: 100%; margin: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      display: grid; place-items: center;
      background: #fff; color: #111;
    }
    main { text-align: center; max-width: 22rem; padding: 1.5rem; }
    h1 { font-weight: 500; font-size: 1.5rem; margin: 0 0 0.5rem; }
    p  { margin: 0 0 1rem; color: #666; }
    a.button {
      display: inline-block; padding: 0.6rem 1rem; border-radius: 0.5rem;
      background: #111; color: #fff; text-decoration: none; font-weight: 500;
    }
    @media (prefers-color-scheme: dark) {
      body { background: #111; color: #eee; }
      p { color: #aaa; }
      a.button { background: #eee; color: #111; }
    }
  </style>
</head>
<body>
  <main>
    <h1>You're signed in</h1>
    <p>Returning to slowblink…</p>
    <a class="button" href="${deepLinkHtml}">Open slowblink</a>
  </main>
  <script>
    (function () {
      try { window.location.href = ${deepLinkJs}; } catch (e) {}
      setTimeout(function () { try { window.close(); } catch (e) {} }, 1500);
    })();
  </script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
});
