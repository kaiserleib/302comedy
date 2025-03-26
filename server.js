const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());
app.use(express.static('.')); // Serve static files from current directory

app.post('/api/fetch-eventbrite', async (req, res) => {
  try {
    const { url } = req.body;
    const response = await axios.get(url);
    res.send(response.data);
  } catch (error) {
    console.error('Error fetching Eventbrite page:', error);
    res.status(500).send('Failed to fetch Eventbrite page');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 