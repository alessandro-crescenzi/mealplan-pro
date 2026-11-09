# Export to Bring!

"Apri in Bring!" in the shopping-list modal works like this:

1. The browser sends the list (`{ title, items: [{ name, count }] }`) to `POST /api/shopping-list/share`
   (authenticated). The function stores it in KV under `shopping-list:<uuid>` with a 3-day TTL and
   returns `{ url }` = `<origin>/api/public/shopping-list/<uuid>`.
2. The browser opens `https://api.getbring.com/rest/bringrecipes/deeplink?url=<that url>&source=web&baseQuantity=1&requestedQuantity=1`.
3. Bring!'s servers fetch the public URL, read the schema.org `Recipe` JSON-LD
   (`recipeIngredient`, e.g. `"2 zucchine"`) and open the import in the app.

Bring!'s documented import accepts a URL with schema.org Recipe markup (the `.json` import format
is not documented). Guide: https://sites.google.com/getbring.com/bring-import-dev-guide/web-to-app-integration

## Cloudflare Access must let `/api/public/*` through

Bring!'s servers have no Access identity, so the public page needs an Access **Bypass** rule:

Zero Trust → Access → Applications → Add application → Self-hosted:
- Domain: the app's hostname, path `api/public/*`
- Policy: action **Bypass**, include **Everyone**

Check: `curl -i https://<app-host>/api/public/shopping-list/x` must return the app's own `404`
JSON (`Lista non trovata o scaduta.`), not an Access login page or a `302`/`403`.

The token is a random UUID and lists expire on their own, but anyone with the link can read the list
(ingredient names only, no emails).

## Local development

The button cannot complete the import locally: Bring!'s servers cannot reach `localhost`. The
endpoints themselves work with `npm run preview:pages`.
