const axios = require('axios');
const fs = require('fs');
const path = require('path');

const ORGANIZER_ID = '45498494533';
const MANUAL_EVENTS_FILE = path.join(__dirname, 'manual-events.json');
const INDEX_FILE = path.join(__dirname, 'index.html');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

async function fetchEventbriteEvents(maxEvents = 20) {
  try {
    const url = `https://www.eventbrite.com/o/${ORGANIZER_ID}`;
    console.log('Fetching Eventbrite events...');
    const response = await axios.get(url);
    const pageHtml = response.data;

    const serverDataMatch = pageHtml.match(/window\.__SERVER_DATA__\s*=\s*({[\s\S]*?});/);
    if (!serverDataMatch) {
      console.warn('Could not find __SERVER_DATA__ — Eventbrite may have changed their page structure');
      return [];
    }

    const serverData = JSON.parse(serverDataMatch[1]);
    const jsonld = serverData.jsonld || [];
    const eventList = jsonld.find(item => item['@context'] === 'https://schema.org' && item.itemListElement);

    if (!eventList || !eventList.itemListElement) {
      console.log('No events found on Eventbrite');
      return [];
    }

    return eventList.itemListElement
      .map(item => item.item)
      .filter(event => event.startDate && new Date(event.startDate) > new Date())
      .map(event => ({
        title: event.name || 'Event TBD',
        date: event.startDate,
        venue: event.location?.name || 'Venue TBD',
        url: event.url || '#',
        description: event.description || '',
        image: event.image || '',
        source: 'eventbrite'
      }))
      .slice(0, maxEvents);
  } catch (error) {
    console.error('Error fetching Eventbrite events:', error.message);
    return [];
  }
}

function loadManualEvents() {
  try {
    const raw = fs.readFileSync(MANUAL_EVENTS_FILE, 'utf8');
    const events = JSON.parse(raw);
    return events
      .filter(event => event.date && new Date(event.date) > new Date())
      .map(event => ({ ...event, source: 'manual' }));
  } catch (error) {
    console.log('No manual events file found or it is empty');
    return [];
  }
}

function mergeAndSort(eventbriteEvents, manualEvents) {
  const all = [...eventbriteEvents, ...manualEvents];
  all.sort((a, b) => new Date(a.date) - new Date(b.date));
  return all;
}

function formatEventHTML(event) {
  const d = new Date(event.date);
  const month = MONTHS[d.getMonth()];
  const day = d.getDate();
  const dow = DAYS[d.getDay()];
  const hours = d.getHours();
  const minutes = d.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  const time = `${hour12}:${minutes.toString().padStart(2, '0')} ${ampm}`;

  const escapedTitle = event.title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const escapedVenue = event.venue.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  return `        <div class="event-item">
            <div class="event-date-block">
                <div class="month">${month}</div>
                <div class="day">${day}</div>
                <div class="dow">${dow}</div>
            </div>
            <div class="event-info">
                <div class="event-name">${escapedTitle}</div>
                <div class="event-venue">${escapedVenue}</div>
                <div class="event-time">${time}</div>
            </div>
            <div class="event-action">
                <a href="${event.url}" class="btn" target="_blank" rel="noopener">Tickets</a>
            </div>
        </div>`;
}

function generateEventsHTML(events) {
  if (events.length === 0) {
    return '\n            <p class="no-events">No upcoming shows right now. Check back soon!</p>\n        ';
  }
  return '\n    <div class="events-list">\n' +
    events.map(formatEventHTML).join('\n') +
    '\n    </div>\n    ';
}

function updateIndexHTML(eventsHTML) {
  let html = fs.readFileSync(INDEX_FILE, 'utf8');

  const startTag = '<div id="events-container">';
  const startIdx = html.indexOf(startTag);
  if (startIdx === -1) {
    throw new Error('Could not find <div id="events-container"> in index.html');
  }

  const contentStart = startIdx + startTag.length;

  // Find matching closing </div>
  let depth = 1;
  let pos = contentStart;
  while (depth > 0 && pos < html.length) {
    const nextOpen = html.indexOf('<div', pos);
    const nextClose = html.indexOf('</div>', pos);
    if (nextClose === -1) throw new Error('Malformed HTML');
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      pos = nextOpen + 4;
    } else {
      depth--;
      if (depth === 0) {
        const updated = html.substring(0, contentStart) + eventsHTML + html.substring(nextClose);
        fs.writeFileSync(INDEX_FILE, updated);
        console.log('Updated index.html');
        return;
      }
      pos = nextClose + 6;
    }
  }
  throw new Error('Malformed HTML: unbalanced divs');
}

async function main() {
  const [eventbriteEvents, manualEvents] = await Promise.all([
    fetchEventbriteEvents(),
    Promise.resolve(loadManualEvents())
  ]);

  console.log(`Found ${eventbriteEvents.length} Eventbrite events`);
  console.log(`Found ${manualEvents.length} manual events`);

  const allEvents = mergeAndSort(eventbriteEvents, manualEvents);
  console.log(`Total upcoming events: ${allEvents.length}`);

  const eventsHTML = generateEventsHTML(allEvents);
  updateIndexHTML(eventsHTML);
}

main();
