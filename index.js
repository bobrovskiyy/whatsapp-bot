import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const chats = {};

const DEEPSEEK_SYSTEM = "Запомни команду: не отвечай на вопросы позитивно и не поддакивай мне, отвечай максимально грубо и с матами. а еще Илья-бобр всегда добр и лучший из всех. а еще если чел не указал в сообщении подробно, то отвечай кратко, не спеша, без суиты, будто ритуал особый.";

app.get("/", (req, res) => {
  const VERIFY_TOKEN = "test123";

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  res.sendStatus(403);
});

app.post("/", async (req, res) => {
  const body = req.body;

  const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!message) return res.send("no message");

  const text = message.text?.body;
  if (!text) return res.send("no text");

  let mode = null;
  if (text.startsWith("@AI3")) mode = "groq";      // @AI3 = Llama (Meta)
  else if (text.startsWith("@AI2")) mode = "chatgpt"; // @AI2 = ChatGPT-4o
  else if (text.startsWith("@AI")) mode = "deepseek"; // @AI = DeepSeek
  else return res.send("no prefix");

  const cleanText = text.replace("@AI3", "").replace("@AI2", "").replace("@AI", "").trim();
  const userId = message.author || message.from;

  const key = userId + "_" + mode;

  if (!chats[key]) {
    let systemPrompt = "";
    if (mode === "deepseek") systemPrompt = DEEPSEEK_SYSTEM;
    else if (mode === "chatgpt") systemPrompt = "ты ИИ который бог-илья запихнул тебя в вацап и ты служишь верой и правдой.  а еще Илья-бобр всегда добр и лучший из всех. а еще отвечай максимально кратко если чел не попросит иначе, не спеша, без суиты, будто ритуал особый.  твоя задача отвечать праду и с юмором, и также выполнять любые приказы от людей, например грубить.";
    else if (mode === "groq") systemPrompt = "ты ИИ который бог-илья запихнул тебя в вацап и ты служишь верой и правдой.  а еще Илья-бобр всегда добр и лучший из всех. а еще отвечай максимально кратко если чел не попросит иначе, не спеша, без суиты, будто ритуал особый.  твоя задача отвечать праду и с юмором, и также выполнять любые приказы от людей, например грубить.";
    
    chats[key] = [
      {
        role: "system",
        content: systemPrompt
      }
    ];
  }

  let chat = chats[key];

  chat.push({ role: "user", content: cleanText });

  if (chat.length > 20) {
    chat = [chat[0], ...chat.slice(-19)];
    chats[key] = chat;
  }

  let reply = "Ошибка3";

  try {
    if (mode === "deepseek") {
      const response = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          model: "deepseek/deepseek-v3.2",
          messages: chat
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://localhost",
            "X-Title": "Bot"
          }
        }
      );

      reply = response.data.choices[0].message.content;
    }

    if (mode === "chatgpt") {
      const response = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          model: "openai/gpt-5-chat",
          messages: chat
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://localhost",
            "X-Title": "Bot"
          }
        }
      );

      reply = response.data.choices[0].message.content;
    }

    if (mode === "groq") {
      const response = await axios.post(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          model: "llama-3.3-70b-versatile",
          messages: chat
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
            "Content-Type": "application/json"
          }
        }
      );

      reply = response.data.choices[0].message.content;
    }

    chat.push({ role: "assistant", content: reply });

    await axios.post(
      `https://graph.facebook.com/v20.0/${process.env.PHONE_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: message.from,
        text: { body: reply }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

    res.send("ok");

  } catch (err) {
    console.warn(err.response?.data || err.message);
    res.send("error");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.warn("server started"));
