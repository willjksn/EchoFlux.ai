import type { VercelRequest, VercelResponse } from "@vercel/node";

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>witme.io - Verified creator pages for fans</title>
    <meta name="description" content="Verify creator pages, then support, unlock, message, and book directly in one trusted fan flow." />
    <link rel="canonical" href="https://witme.io/" />

    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="witme.io" />
    <meta property="og:title" content="witme.io - Verified creator pages for fans" />
    <meta property="og:description" content="Verify creator pages, then support, unlock, message, and book directly in one trusted fan flow." />
    <meta property="og:url" content="https://witme.io/" />
    <meta property="og:image" content="https://witme.io/witme-og.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="witme.io trusted creator pages for fans" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="witme.io - Verified creator pages for fans" />
    <meta name="twitter:description" content="Verify creator pages, then support, unlock, message, and book directly in one trusted fan flow." />
    <meta name="twitter:image" content="https://witme.io/witme-og.png" />
  </head>
  <body>
    <p>witme.io preview</p>
  </body>
</html>`;

export default async function handler(_req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300");
  res.status(200).send(html);
}
