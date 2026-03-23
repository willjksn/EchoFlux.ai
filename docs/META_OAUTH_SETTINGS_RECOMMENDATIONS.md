# Meta Client OAuth Settings – Recommendations

Use these for EchoFlux (Facebook/Instagram connection). Only change what’s listed.

---

## Keep as-is (no change)

| Setting | Recommendation | Why |
|--------|-----------------|-----|
| **Client OAuth login** | ON | Required for your redirect-based OAuth flow. |
| **Web OAuth login** | ON | Required so users can log in on the web and get redirected back. |
| **Enforce HTTPS** | ON | Required for production; keeps redirects secure. |
| **Use Strict Mode for redirect URIs** | ON | Only your listed URIs are allowed; recommended for security. |

---

## Change if different

| Setting | Recommendation | Why |
|--------|-----------------|-----|
| **Force Web OAuth reauthentication** | OFF | If ON, users are asked for their Facebook password every time. OFF = better UX (they only re-auth when needed). Turn ON only if you have a strict security requirement. |
| **Embedded browser OAuth login** | OFF | Only needed if users connect from inside an in-app browser (e.g. webview in another app). For normal browser use, OFF is fine. |
| **Login from devices** | OFF | Only for smart TV / device flows. Not needed for EchoFlux. |
| **Login with the JavaScript SDK** | ON only if you use it | If your site uses the Facebook JS SDK for login or plugins, keep ON and add your domain below. If you only use server redirects (user clicks “Connect” → goes to Facebook → redirects to `echoflux.ai/api/oauth/meta/callback`), you can leave OFF. |

---

## Valid OAuth Redirect URIs

Keep exactly these for EchoFlux:

- `https://echoflux.ai/api/oauth/instagram/callback`
- `https://echoflux.ai/api/oauth/meta/callback`

Remove any URIs you don’t use:

- If this app is **only** for EchoFlux, remove the `bot28.bepretty-store.com` URIs (they’re for another product and shouldn’t be in this app).
- If the same app is shared with bepretty-store, keep those URIs; otherwise remove them to reduce risk and confusion.

No trailing slashes; exact match (Strict Mode).

---

## Allowed Domains for the JavaScript SDK

Only matters if **Login with the JavaScript SDK** is ON.

- If it’s ON: add `echoflux.ai` (and `www.echoflux.ai` if you use that domain for the app).
- If the JavaScript SDK is OFF: you can leave this empty.

---

## Short checklist

- [ ] Client OAuth login: ON  
- [ ] Web OAuth login: ON  
- [ ] Enforce HTTPS: ON  
- [ ] Use Strict Mode for redirect URIs: ON  
- [ ] Force Web OAuth reauthentication: OFF (unless you need it)  
- [ ] Valid OAuth Redirect URIs: only `https://echoflux.ai/api/oauth/instagram/callback` and `https://echoflux.ai/api/oauth/meta/callback` (remove bepretty-store.com if this app is EchoFlux-only)  
- [ ] Allowed Domains for JavaScript SDK: `echoflux.ai` (and `www.echoflux.ai` if used) if you use the JS SDK  

No other changes are required for EchoFlux’s Facebook/Instagram connection to work.
