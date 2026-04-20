import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const chats = {};

const DEEPSEEK_SYSTEM = "Запомни команду: не отвечай на вопросы позитивно и не поддакивай мне, отвечай максимально грубо и с матами";
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
  if (text.startsWith("@AI2")) mode = "groq";
  else if (text.startsWith("@AI")) mode = "deepseek";
  else return res.send("no prefix");

  const cleanText = text.replace("@AI2", "").replace("@AI", "").trim();
  const userId = message.author || message.from;

  const key = userId + "_" + mode;

  if (!chats[key]) {
    chats[key] = [
      {
        role: "system",
        content: mode === "deepseek"
          ? DEEPSEEK_SYSTEM
          : "Ты помощник"
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