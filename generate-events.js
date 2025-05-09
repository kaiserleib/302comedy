const axios = require('axios');
const fs = require('fs');

async function fetchEvents(organizerId, maxEvents = 10) {
  try {
    const url = `https://www.eventbrite.com/o/${organizerId}`;
    console.log('Fetching URL:', url);
    const response = await axios.get(url);
    const pageHtml = response.data;
    
    // Extract the JSON data from window.__SERVER_DATA__
    const serverDataMatch = pageHtml.match(/window\.__SERVER_DATA__\s*=\s*({[\s\S]*?});/);
    if (!serverDataMatch) {
      throw new Error('Could not find window.__SERVER_DATA__ in the page');
    }
    
    const serverData = JSON.parse(serverDataMatch[1]);
    
    // Find the jsonld array containing event data
    const jsonld = serverData.jsonld || [];
    const eventListJsonld = jsonld.find(item => item['@context'] === 'https://schema.org' && item.itemListElement);
    
    if (!eventListJsonld || !eventListJsonld.itemListElement) {
      console.log('No events found in jsonld data');
      return [];
    }
    
    const events = [];
    const now = new Date();
    
    eventListJsonld.itemListElement.forEach(item => {
      const event = item.item;
      if (event.startDate) {
        const eventDate = new Date(event.startDate);
        // Only include future events
        if (eventDate > now) {
          const eventObj = {
            name: event.name || 'Event TBD',
            date: eventDate.toLocaleString(),
            venue: event.location?.name || 'Venue TBD',
            url: event.url || '#',
            description: event.description || '',
            image: event.image || ''
          };
          
          console.log('Found future event:', eventObj);
          events.push(eventObj);
        } else {
          console.log('Skipping past event:', event.name, 'on', new Date(event.startDate).toLocaleString());
        }
      }
    });
    
    // Sort events by date
    events.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    // Take only the requested number of events
    const limitedEvents = events.slice(0, maxEvents);
    console.log(`Found ${limitedEvents.length} upcoming events`);
    return limitedEvents;
  } catch (error) {
    console.error('Error fetching events:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response headers:', error.response.headers);
    }
    throw error;
  }
}

function generateEventHTML(events) {
  if (!events || events.length === 0) {
    return '<div class="events-container"><p>No upcoming events found.</p></div>';
  }
  
  let html = '<div class="events-container">\n';
  html += '  <h2>Upcoming Events</h2>\n';
  html += '  <div class="events-list">\n';
  
  events.forEach(event => {
    html += '    <div class="event-item">\n';
    if (event.image) {
      html += `      <div class="event-image"><img src="${event.image}" alt="${event.name}"></div>\n`;
    }
    html += `      <h3><a href="${event.url}" target="_blank">${event.name}</a></h3>\n`;
    html += `      <p class="event-date"><strong>When:</strong> ${event.date}</p>\n`;
    html += `      <p class="event-venue"><strong>Where:</strong> ${event.venue}</p>\n`;
    if (event.description) {
      html += `      <p class="event-description">${event.description}</p>\n`;
    }
    html += `      <a href="${event.url}" class="event-button" target="_blank">Get Tickets</a>\n`;
    html += '    </div>\n';
  });
  
  html += '  </div>\n';
  html += '</div>\n';
  
  return html;
}

function saveServerDataToJson(serverData, organizerId) {
  const outputFile = `server-data-${organizerId}.json`;
  const prettyJson = JSON.stringify(serverData, null, 2);
  fs.writeFileSync(outputFile, prettyJson);
  console.log(`Server data saved to ${outputFile}`);
}

async function updateIndexHtml(eventsHtml) {
  try {
    let indexHtml = fs.readFileSync('index.html', 'utf8');
    const eventsContainerStart = indexHtml.indexOf('<div id="events-container">');
    
    if (eventsContainerStart === -1) {
      throw new Error('Could not find events container in index.html');
    }
    
    // Find the end of the events container by matching nested divs
    let depth = 1;
    let pos = eventsContainerStart + '<div id="events-container">'.length;
    
    while (depth > 0 && pos < indexHtml.length) {
      const nextOpenDiv = indexHtml.indexOf('<div', pos);
      const nextCloseDiv = indexHtml.indexOf('</div>', pos);
      
      if (nextCloseDiv === -1) {
        throw new Error('Malformed HTML: missing closing div');
      }
      
      if (nextOpenDiv !== -1 && nextOpenDiv < nextCloseDiv) {
        depth++;
        pos = nextOpenDiv + 1;
      } else {
        depth--;
        pos = nextCloseDiv + 1;
      }
    }
    
    if (depth !== 0) {
      throw new Error('Malformed HTML: unbalanced div tags');
    }
    
    const eventsContainerEnd = pos - 1;
    
    const newIndexHtml = indexHtml.substring(0, eventsContainerStart) + 
                        '<div id="events-container">' + 
                        eventsHtml + 
                        indexHtml.substring(eventsContainerEnd + 6); // +6 to skip '</div>'
    
    fs.writeFileSync('index.html', newIndexHtml);
    console.log('Updated index.html with latest events');
  } catch (error) {
    console.error('Error updating index.html:', error.message);
    throw error;
  }
}

async function main() {
  const organizerId = process.argv[2];
  const maxEvents = parseInt(process.argv[3]) || 10;
  
  if (!organizerId) {
    console.error('Please provide an organizer ID');
    console.error('Usage: node generate-events.js <organizer-id> [max-events]');
    process.exit(1);
  }
  
  try {
    console.log(`Fetching events for organizer ${organizerId}...`);
    const url = `https://www.eventbrite.com/o/${organizerId}`;
    const response = await axios.get(url);
    const pageHtml = response.data;
    
    // Extract the JSON data from window.__SERVER_DATA__
    const serverDataMatch = pageHtml.match(/window\.__SERVER_DATA__\s*=\s*({[\s\S]*?});/);
    if (!serverDataMatch) {
      throw new Error('Could not find window.__SERVER_DATA__ in the page');
    }
    
    const serverData = JSON.parse(serverDataMatch[1]);
    
    // Save the server data to a JSON file
    saveServerDataToJson(serverData, organizerId);
    
    // Continue with existing event processing
    const events = await fetchEvents(organizerId, maxEvents);
    const eventsHtml = generateEventHTML(events);
    
    // Update index.html with the events
    await updateIndexHtml(eventsHtml);
  } catch (error) {
    console.error('Failed to update events:', error.message);
    process.exit(1);
  }
}

main(); 