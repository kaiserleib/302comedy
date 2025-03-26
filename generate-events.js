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
  
  // Add CSS for styling
  html += '<style>\n';
  html += '  .events-container {\n';
  html += '    font-family: Arial, sans-serif;\n';
  html += '    max-width: 800px;\n';
  html += '    margin: 0 auto;\n';
  html += '  }\n';
  html += '  .events-list {\n';
  html += '    display: grid;\n';
  html += '    grid-template-columns: 1fr;\n';
  html += '    gap: 20px;\n';
  html += '  }\n';
  html += '  .event-item {\n';
  html += '    padding: 20px;\n';
  html += '    border: 1px solid #ddd;\n';
  html += '    border-radius: 5px;\n';
  html += '    background-color: white;\n';
  html += '    box-shadow: 0 2px 4px rgba(0,0,0,0.1);\n';
  html += '  }\n';
  html += '  .event-image {\n';
  html += '    margin-bottom: 15px;\n';
  html += '  }\n';
  html += '  .event-image img {\n';
  html += '    width: 100%;\n';
  html += '    height: auto;\n';
  html += '    border-radius: 4px;\n';
  html += '  }\n';
  html += '  .event-item h3 {\n';
  html += '    margin-top: 0;\n';
  html += '    color: #333;\n';
  html += '  }\n';
  html += '  .event-date, .event-venue {\n';
  html += '    color: #555;\n';
  html += '  }\n';
  html += '  .event-description {\n';
  html += '    margin: 10px 0;\n';
  html += '    font-style: italic;\n';
  html += '  }\n';
  html += '  .event-button {\n';
  html += '    display: inline-block;\n';
  html += '    padding: 8px 16px;\n';
  html += '    background-color: #f8682E;\n';
  html += '    color: white;\n';
  html += '    text-decoration: none;\n';
  html += '    border-radius: 4px;\n';
  html += '    margin-top: 10px;\n';
  html += '  }\n';
  html += '  .event-button:hover {\n';
  html += '    background-color: #e5591b;\n';
  html += '  }\n';
  html += '  @media (min-width: 768px) {\n';
  html += '    .events-list {\n';
  html += '      grid-template-columns: repeat(2, 1fr);\n';
  html += '    }\n';
  html += '  }\n';
  html += '</style>';
  
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
    const eventsContainerEnd = indexHtml.indexOf('</div>', eventsContainerStart);
    
    if (eventsContainerStart === -1 || eventsContainerEnd === -1) {
      throw new Error('Could not find events container in index.html');
    }
    
    const newIndexHtml = indexHtml.substring(0, eventsContainerStart + 25) + 
                        '\n' + eventsHtml + 
                        indexHtml.substring(eventsContainerEnd);
    
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