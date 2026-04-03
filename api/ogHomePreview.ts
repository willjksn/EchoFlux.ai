import type { VercelRequest, VercelResponse } from "@vercel/node";

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>witme.io - Creator pages for fans</title>
    <meta name="description" content="Get closer with member drops, unlocks, tips, and DMs—all on their page. One link from their bio is all you need to back them for real." />
    <link rel="canonical" href="https://witme.io/" />

    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="witme.io" />
    <meta property="og:title" content="witme.io - Creator pages for fans" />
    <meta property="og:description" content="Memberships, unlocks, tips, messages, and bookings from the same creator page—without extra apps or hunting for the right link." />
    <meta property="og:url" content="https://witme.io/" />
    <meta property="og:image" content="https://witme.io/witme-og.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="witme.io creator pages for fans" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="witme.io - Creator pages for fans" />
    <meta name="twitter:description" content="Get closer with member drops, unlocks, tips, and DMs—all on their page. One link from their bio is all you need to back them for real." />
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
