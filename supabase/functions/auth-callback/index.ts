// GET /functions/v1/auth-callback
//
// OAuth-flow bridge page. Supabase redirects the browser here with the PKCE
// exchange code in the URL. We respond with a tiny HTML page that:
//   1. navigates the tab to `slowblink://auth/callback?<params>` so the OS
//      hands the deep link to the Electron app, which exchanges the code
//      for a session (see src/main/auth/deep-link.ts),
//   2. attempts `window.close()` so the user isn't left with an orphan tab
//      showing a browser error page for the custom-protocol URL.
//
// JWT verification is disabled (config.toml: `[functions.auth-callback]
// verify_jwt = false`) — the browser arrives here with only a Google-
// provided code, no Supabase auth header.
//
// The URL must be listed in `auth.additional_redirect_urls` so Supabase
// accepts it as a valid `redirect_to`.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

Deno.serve((req) => {
  const url = new URL(req.url);
  const deepLink = `slowblink://auth/callback${url.search}`;

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>Signed in — slowblink</title>
  <style>
    html, body { height: 100%; margin: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      display: grid; place-items: center;
      background: #fff; color: #111;
    }
    main { text-align: center; max-width: 20rem; padding: 1.5rem; }
    h1 { font-weight: 500; font-size: 1.5rem; margin: 0 0 0.5rem; }
    p  { margin: 0; color: #666; }
    @media (prefers-color-scheme: dark) {
      body { background: #111; color: #eee; }
      p { color: #aaa; }
    }
  </style>
</head>
<body>
  <main>
    <h1>You're signed in</h1>
    <p>Returning to slowblink… you can close this tab.</p>
  </main>
  <script>
    (function () {
      window.location.replace(${JSON.stringify(deepLink)});
      setTimeout(function () { window.close(); }, 800);
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
