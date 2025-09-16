// ---- Config ----
const API_URL = 'http://127.0.0.1:1234/v1/chat/completions';
const ALLO_CINE_URL = 'https://www.allocine.fr/_/showtimes/theater-B0132/d-2025-09-16/';
const SHOWTIMES_URL = 'http://localhost:3001/showtimes';
const MODEL = 'google/gemma-3n-e4b';

const SYSTEM_LANG = 'Answer user question in french.';
const TOOLING_PROMPT = `
You are an assistant who can provide answers or return a JSON string to trigger function if it exist.
Functions available :
- addTool(a,b) => a + b; // returns the sums of a and b
- multiplyTool(a,b) => a * b; // return the product of a and b
- showtimesTool(theaterId, date, genre) => any  // returns today showtimes JSON
If you respond in JSON, you MUST format like this : { "tool": "addTool", "args": [1, 1] }
Sample of request and response :
Request : "What is 1 + 2?"
Response : { "tool": "addTool", "args": [1, 2] }

Request : "What is 3 * 4?"
Response : { "tool": "multiplyTool", "args": [3, 4] }

Request : "Find me an science fiction movie"
Response : { "tool": "showtimesTool", "args": ["B0132", "2025-09-16", "Science Fiction"] }

Request : "Capital of France?"
Response : "Paris"
`;

// ---- DOM references ----
const messages = document.getElementById('messages');
const form = document.getElementById('chatForm');
const userInput = document.getElementById('userInput');
const submitButton = document.getElementById('submitButton');

// ---- UI helpers ----
const UI = {
  appendMessage(sender, text) {
    const messageNode = document.createElement('div');
    messageNode.className = `message ${sender}`;
    messageNode.textContent = text;
    messages.appendChild(messageNode);
    messages.scrollTop = messages.scrollHeight;
  },
  setBusy(busy) {
    submitButton.disabled = busy;
    submitButton.textContent = busy ? '…' : 'Envoyer';
  },
};

const getTodayApiFormat = () => {
  const today = new Date();
  const fullYear = today.getFullYear();
  // For January it is 0
  const month = today.getMonth() + 1;
  const formatMonth = month > 9 ? month.toString() : '0' + month.toString();
  const day = today.getDate();
  const formatDay = day > 9 ? day.toString() : '0' + day.toString();
  return `${fullYear}-${formatMonth}-${formatDay}`;
};

// ---- Tools ----
const Tools = {
  registry: {
    addTool: (a, b) => a + b,
    multiplyTool: (a, b) => a * b,
    showtimesTool: async (theaterId, date, genre) => {
      const cinemaUrl = new URL(SHOWTIMES_URL);
      const todayDate = getTodayApiFormat();
      console.log('todayDate :', todayDate);

      cinemaUrl.searchParams.set('theaterId', 'B0132');
      cinemaUrl.searchParams.set('date', todayDate);
      const cinemaResponse = await fetch(cinemaUrl);
      if (!cinemaResponse.ok) {
        throw new Error(`HTTP ${cinemaResponse?.status} ${cinemaResponse?.statusText}`);
      }
      const cinemaData = await cinemaResponse.json();
      if (!cinemaData?.length) return `Aucune séance trouvée pour ${theaterId} le ${date}.`;

      // Filtre par genre
      const filtered = genre
        ? cinemaData.filter((item) => {
            const genres = item?.movie?.genres || [];
            return genres.some(
              (genreItem) =>
                genreItem.translate.toLowerCase() === genre.toLowerCase() ||
                genreItem.tag.toLowerCase() === genre.toLowerCase()
            );
          })
        : cinemaData;

      if (!filtered.length) return `Aucun film trouvé pour le genre "${genre}".`;

      console.log('filtered : ', filtered);

      const lines = filtered.map((item) => {
        const hours = item?.showtimes?.original.map((time) => time?.startsAt).join(', ');
        return `• ${item?.movie?.title} — ${hours}`;
      });
      return `🎬 Horaires ${theaterId} / ${date}\n` + lines.join('\n');
    },
  },

  tryRun: async (content) => {
    console.log('content : ', content);
    try {
      const json = JSON.parse(content);
      if (!json || typeof json !== 'object') {
        console.error('The result should be on JSON format, and is not on JSON format.');
        return null;
      }

      const functionTool = Tools.registry[json.tool];
      if (!functionTool || !Array.isArray(json.args)) {
        console.error('The data in the JSON result provide wrong information about tool or args.');
        return null;
      }

      const result = await functionTool(...json.args);
      console.log('Result : ', result);
      return `Resultat de l'outil ${json.tool}(${json.args.join(', ')}) :\n${result}`;
    } catch (error) {
      console.log('No tool has been chosen : \n', error);
      return null;
    }
  },
};

// ---- API layer ----
const ChatAPI = {
  async complete(userMessage) {
    const payload = {
      messages: [
        { role: 'system', content: SYSTEM_LANG },
        { role: 'system', content: TOOLING_PROMPT },
        { role: 'user', content: `${userMessage}/no_think` },
      ],
      temperature: 0.7,
      max_tokens: 1024,
      stream: false,
      model: MODEL,
    };

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const textError = await response?.text().catch(() => '');
      throw new Error(`HTTP ${response?.status} ${response?.statusText} - ${textError}`);
    }

    const data = await response.json();
    return data?.choices?.[0]?.message?.content ?? '';
  },
};

// ---- Main ----
const handleSubmit = async (e) => {
  e.preventDefault();
  const cleanedUserInput = userInput.value.trim();
  if (!cleanedUserInput) return;

  UI.appendMessage('user', cleanedUserInput);
  userInput.value = '';
  UI.setBusy(true);

  try {
    const content = await ChatAPI.complete(cleanedUserInput);

    // Si le modèle renvoie un JSON d'outil, on exécute
    const toolResult = await Tools.tryRun(content);
    if (toolResult) {
      UI.appendMessage('bot', toolResult);
    } else {
      UI.appendMessage('bot', content);
    }
  } catch (error) {
    console.error(error);
    UI.appendMessage('bot', "💥 L'IA a une erreur. (Regardez la console pour plus d'information)");
  } finally {
    UI.setBusy(false);
    userInput.focus();
  }
};

// ---- Wire events ----
form.addEventListener('submit', handleSubmit);
