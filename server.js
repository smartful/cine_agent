import express from 'express';
import cors from 'cors';

const PORT = 3001;
const app = express();
// autorise tous les origins
app.use(cors());

// Exemple: http://localhost:3001/showtimes?theaterId=B0132&date=2025-09-16
app.get('/showtimes', async (req, res) => {
  const { theaterId, date } = req.query;
  if (!theaterId || !date) {
    return res.status(400).json({ error: 'Missing theaterId or date' });
  }

  const url = `https://www.allocine.fr/_/showtimes/theater-${theaterId}/d-${date}/`;

  try {
    const response = await fetch(url, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return res.status(response.status).json({ error: `Allociné error ${response.status}`, body: text });
    }

    const data = await response.json();
    res.json(data?.results);
  } catch (err) {
    console.error('Error Allo Ciné API : \n', err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`✅ Showtimes API dispo sur : http://localhost:${PORT}/showtimes`));
