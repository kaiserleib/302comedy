# 302comedy.com

Static site on GitHub Pages (`main`, root). No build step for the design:
edit `index.html`, `montana/index.html`, `styles.css`, `site.js` directly.

## Show listings

`build.js` reads live, listed events from the Eventbrite API and rewrites the
blocks between `<!-- shows:start … -->` and `<!-- shows:end -->` in both
pages. Montana shows get poster cards, everything else a compact
"Outside Montana" list. `.github/workflows/update-events.yml` runs it every
four hours and commits when something changed.

- Secrets: `EVENTBRITE_API_TOKEN`, `EVENTBRITE_ORG_ID` (repo Actions secrets).
- A show a venue tickets itself goes in `manual-events.json` (fields are
  listed in `build.js`).
- If Eventbrite is unreachable the job fails and the pages are left alone;
  `site.js` hides shows that have ended.
- The workflow re-enables itself on every run, because GitHub turns off
  scheduled workflows after 60 quiet days (that stopped the old one in
  June 2026).
- Ticket links carry `aff=302site`, so Eventbrite's channel report shows
  orders that came from the site.

`npm run check` prints what would be listed without writing.

## Mailing list

Forms post to the Kit form "302 Comedy site signup (302comedy.com)"
(`10228317`, no confirmation email). They ask for an email and a ZIP code
(since 2026-11-26; before that, a town from a fixed list). The ZIP goes in
Kit's custom field "Zip code" (`zip_code`), and `site.js` works out a town
tag from it (`TOWNS`), so each signup still gets two Kit tags:

| Tag | ID |
|---|---|
| 302 site signup (homepage forms) | 26302972 |
| 302 Montana ads signup (`/montana/`) | 26302973 |
| Town - Helena | 26302974 |
| Town - Townsend | 26302975 |
| Town - Missoula | 26302976 |
| Town - Bozeman | 26302977 |
| Town - Elsewhere in Montana | 26302978 |
| Town - Outside Montana | 26302979 |

The ZIP is the real record; the town tags are a convenience and the only
location most older subscribers have (they were tagged on 2026-11-26 with
the town they bought tickets in, and have no ZIP). The 2026-11-22 to 26
signups who picked a town carry that town's most populous ZIP (Helena
59601, Townsend 59644, Missoula 59801, Bozeman 59718), which is a stand-in,
not their address. To send a show's email, use the town tag, or filter on
the ZIP field for a town without a tag. To give a new town its own tag,
create it in Kit and add a row to `TOWNS` in `site.js`.

`site.js` and `styles.css` are loaded with `?v=N`; bump it when a change
to them must reach visitors together with the HTML.

## Ads

`/montana/` is the landing page for the Montana list ads (noindex). Both
pages load Meta pixel `317548785478560`; a confirmed signup fires `Lead`
with `content_name` `302-site-hero`, `302-site-band` or `302-montana-ads`.
Campaign details and results live in `../auto-comedy-producer-bot/ads_log.md`.
