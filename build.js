#!/usr/bin/env node
/*
 * Fills the show listings on the site from Eventbrite.
 *
 * Reads every live, publicly listed event in the 302 Comedy Eventbrite
 * organization through the API, adds anything in manual-events.json (shows
 * a venue tickets itself), and rewrites the blocks between
 *
 *     <!-- shows:start <scope> --> ... <!-- shows:end -->
 *
 * in each page listed in PAGES. Scopes: "montana", "road" (everything
 * outside Montana), "montana-compact" (the ad landing page) and "jsonld"
 * (schema.org data for search engines).
 *
 * If Eventbrite can't be reached the script exits non-zero and leaves the
 * pages alone: a stale list is better than an empty one, and site.js hides
 * shows that have already happened.
 *
 * Needs EVENTBRITE_API_TOKEN and EVENTBRITE_ORG_ID. No dependencies; Node 20+.
 *
 *     node build.js            # rewrite the pages
 *     node build.js --check    # print what would be listed, write nothing
 */

const fs = require('fs');
const path = require('path');

const PAGES = ['index.html', 'montana/index.html'];
const MANUAL_EVENTS = path.join(__dirname, 'manual-events.json');
const EB = 'https://www.eventbriteapi.com/v3';
const AFF = '302site'; // Eventbrite's channel report shows site-driven orders under this code

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------------------------------------------------------------- sources

async function eventbriteEvents() {
  const token = process.env.EVENTBRITE_API_TOKEN;
  const org = process.env.EVENTBRITE_ORG_ID;
  if (!token || !org) throw new Error('EVENTBRITE_API_TOKEN and EVENTBRITE_ORG_ID must be set');

  const events = [];
  let continuation = null;
  do {
    const query = new URLSearchParams({
      status: 'live', order_by: 'start_asc', page_size: '100',
      expand: 'venue,ticket_availability',
    });
    if (continuation) query.set('continuation', continuation);
    const res = await fetch(`${EB}/organizations/${org}/events/?${query}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Eventbrite answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const page = await res.json();
    events.push(...(page.events || []));
    continuation = page.pagination?.has_more_items ? page.pagination.continuation : null;
  } while (continuation);

  return events.filter(e => e.listed !== false).map(e => {
    const venue = e.venue || {};
    const address = venue.address || {};
    const tickets = e.ticket_availability || {};
    const min = tickets.minimum_ticket_price;
    return {
      title: e.name?.text || 'Live stand-up comedy',
      summary: e.summary || '',
      start: e.start.local,              // wall-clock time at the venue
      startUtc: e.start.utc,
      endUtc: e.end?.utc || e.start.utc,
      venue: venue.name || '',
      street: address.address_1 || '',
      city: address.city || '',
      region: address.region || '',
      postal: address.postal_code || '',
      url: withAff(e.url),
      image: e.logo?.url || '',
      free: !!e.is_free,
      price: min && Number(min.major_value) > 0 ? Number(min.major_value) : null,
      soldOut: !!tickets.is_sold_out,
    };
  });
}

function manualEvents() {
  // [{ "title", "start": "2027-01-15T19:00:00" (venue time), "venue", "city",
  //    "region": "MT", "url", "image"?, "price"?: 15, "free"?: true }]
  if (!fs.existsSync(MANUAL_EVENTS)) return [];
  return JSON.parse(fs.readFileSync(MANUAL_EVENTS, 'utf8')).map(e => ({
    summary: '', street: '', postal: '', image: '', free: false, price: null, soldOut: false,
    region: 'MT',
    // No UTC time given, so treat venue time as Mountain; exact enough to
    // drop a show the morning after it happens.
    startUtc: new Date(`${e.start}-07:00`).toISOString(),
    endUtc: new Date(new Date(`${e.start}-07:00`).getTime() + 2 * 3600e3).toISOString(),
    ...e,
  }));
}

function withAff(url) {
  const u = new URL(url);
  u.searchParams.set('aff', AFF);
  return u.toString();
}

// -------------------------------------------------------------- rendering

function when(event) {
  // Parse the local string by hand: the runner's own timezone must not leak in.
  const [, y, mo, d, h, mi] = event.start.match(/^(\d+)-(\d+)-(\d+)T(\d+):(\d+)/).map(Number);
  const dow = DAYS[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()];
  const hour = h % 12 || 12;
  const time = `${hour}${mi ? ':' + String(mi).padStart(2, '0') : ''} ${h >= 12 ? 'pm' : 'am'}`;
  return { dow, month: MONTHS[mo - 1], day: d, time };
}

function priceLabel(event) {
  if (event.soldOut) return 'Sold out';
  if (event.free) return 'Free admission';
  if (event.price) return `From $${Number.isInteger(event.price) ? event.price : event.price.toFixed(2)}`;
  return '';
}

const place = event => [event.city, event.region].filter(Boolean).join(', ');

function card(event) {
  const w = when(event);
  const price = priceLabel(event);
  const art = event.image
    ? `<img src="${esc(event.image)}" alt="" loading="lazy" width="1000" height="500">`
    : `<div class="show-art-fallback"><span>Live standup comedy</span><strong>${esc(event.title)}</strong></div>`;
  return `            <article class="show" data-ends="${esc(event.endUtc)}">
                <a class="show-art" href="${esc(event.url)}" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true">${art}</a>
                <div class="show-body">
                    <p class="show-town">${esc(place(event))}</p>
                    <h3><a href="${esc(event.url)}" target="_blank" rel="noopener">${esc(event.title)}</a></h3>
                    <p class="show-when">${w.dow}, ${w.month} ${w.day} · ${w.time} · ${esc(event.venue)}</p>
                    <div class="show-foot">
                        <span class="show-price">${esc(price)}</span>
                        <a class="btn${event.soldOut ? ' btn-quiet' : ''}" href="${esc(event.url)}" target="_blank" rel="noopener">${event.soldOut ? 'Details' : event.free ? 'Save a seat' : 'Get tickets'}</a>
                    </div>
                </div>
            </article>`;
}

function row(event) {
  const w = when(event);
  return `            <li class="row" data-ends="${esc(event.endUtc)}">
                <span class="row-date"><b>${w.month} ${w.day}</b> ${w.dow} · ${w.time}</span>
                <span class="row-what"><a href="${esc(event.url)}" target="_blank" rel="noopener">${esc(event.title)}</a><i>${esc(event.venue)} · ${esc(place(event))}</i></span>
                <span class="row-price">${esc(priceLabel(event))}</span>
            </li>`;
}

function jsonld(events) {
  const items = events.map(e => ({
    '@type': 'ComedyEvent',
    name: e.title,
    startDate: e.start,
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    eventStatus: 'https://schema.org/EventScheduled',
    location: {
      '@type': 'Place', name: e.venue,
      address: {
        '@type': 'PostalAddress', streetAddress: e.street, addressLocality: e.city,
        addressRegion: e.region, postalCode: e.postal, addressCountry: 'US',
      },
    },
    ...(e.image ? { image: e.image } : {}),
    ...(e.summary ? { description: e.summary } : {}),
    organizer: { '@type': 'Organization', name: '302 Comedy', url: 'https://302comedy.com' },
    offers: {
      '@type': 'Offer', url: e.url, priceCurrency: 'USD', price: e.free ? 0 : e.price ?? undefined,
      availability: `https://schema.org/${e.soldOut ? 'SoldOut' : 'InStock'}`,
    },
  }));
  const json = JSON.stringify({ '@context': 'https://schema.org', '@graph': items })
    .replace(/</g, '\\u003c');
  return `    <script type="application/ld+json">${json}</script>`;
}

const SCOPES = {
  montana(events) {
    const shows = events.filter(e => e.region === 'MT');
    if (!shows.length) {
      return `        <p class="empty">No Montana dates on sale this minute. New shows go to the list first: <a href="#list">get on it</a>.</p>`;
    }
    return `        <div class="shows-grid">\n${shows.map(card).join('\n')}\n        </div>`;
  },
  road(events) {
    const shows = events.filter(e => e.region !== 'MT');
    if (!shows.length) return '';
    return `    <section class="road" id="road">
        <div class="wrap">
            <p class="kicker">On the road</p>
            <h2>Outside Montana</h2>
            <ul class="rows">\n${shows.map(row).join('\n')}\n            </ul>
        </div>
    </section>`;
  },
  'montana-compact'(events) {
    const shows = events.filter(e => e.region === 'MT').slice(0, 6);
    if (!shows.length) return '';
    return `        <section class="next">
            <p class="kicker">On sale now</p>
            <ul class="rows">\n${shows.map(row).join('\n')}\n            </ul>
        </section>`;
  },
  jsonld,
};

function fill(html, events, file) {
  let found = 0;
  const out = html.replace(
    /(<!-- shows:start ([\w-]+) -->)[\s\S]*?(<!-- shows:end -->)/g,
    (_, open, scope, close) => {
      if (!SCOPES[scope]) throw new Error(`${file}: unknown scope "${scope}"`);
      found++;
      const body = SCOPES[scope](events);
      return `${open}\n${body}${body ? '\n' : ''}    ${close}`;
    });
  if (!found) throw new Error(`${file}: no <!-- shows:start … --> markers found`);
  return out;
}

async function main() {
  const now = Date.now();
  const events = [...await eventbriteEvents(), ...manualEvents()]
    .filter(e => new Date(e.endUtc).getTime() > now)
    .sort((a, b) => new Date(a.startUtc) - new Date(b.startUtc));

  console.log(`${events.length} upcoming show(s):`);
  for (const e of events) console.log(`  ${e.start}  ${e.title} — ${e.venue}, ${place(e)}  [${priceLabel(e)}]`);
  if (process.argv.includes('--check')) return;

  for (const file of PAGES) {
    const full = path.join(__dirname, file);
    const before = fs.readFileSync(full, 'utf8');
    const after = fill(before, events, file);
    if (after !== before) {
      fs.writeFileSync(full, after);
      console.log(`updated ${file}`);
    }
  }
}

main().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
