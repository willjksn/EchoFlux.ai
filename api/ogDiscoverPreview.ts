import type { VercelRequest, VercelResponse } from "@vercel/node";

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Explore creators | witme.io</title>
    <meta name="description" content="Browse creator pages by name, handle, and offering type on witme.io." />
    <link rel="canonical" href="https://witme.io/discover" />

    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="witme.io" />
    <meta property="og:title" content="Explore creators | witme.io" />
    <meta property="og:description" content="Browse creator pages by name, handle, and offering type on witme.io." />
    <meta property="og:url" content="https://witme.io/discover" />
    <meta property="og:image" content="https://witme.io/witme-og-discover.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="Explore creators on witme.io" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Explore creators | witme.io" />
    <meta name="twitter:description" content="Browse creator pages by name, handle, and offering type on witme.io." />
    <meta name="twitter:image" content="https://witme.io/witme-og-discover.png" />
  </head>
  <body>
    <p>witme.io discover preview</p>
  </body>
</html>`;

export default async function handler(_req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300");
  res.status(200).send(html);
}
