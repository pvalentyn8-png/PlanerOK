import express from "express";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";

// Ініціалізація Gemini (виключно на серверній стороні)
const ai = process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'undefined'
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    })
  : null;

const MODEL_NAME = "gemini-3.5-flash"; // Останній рекомендований та продуктивний ШІ

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Ендпоінти
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Ендпоінт аналізу мотивації
  app.post("/api/ai/analyze-status", async (req, res) => {
    const { tasks, shop, recipes, activeTab } = req.body;
    if (!ai) {
      return res.json({ result: "ШІ не налаштовано (відсутній ключ)." });
    }

    const configs: Record<string, { system: string; user: string }> = {
      tasks: {
        system: "Ти — дотепний та мудрий персональний коуч. Твоє завдання — подивитися на список справ і дати одну влучну, коротку та надзвичайно надихаючу фразу, яка змусить людину відчути приплив сил. Відповідай ТІЛЬКИ українською. Будь дружнім, але енергійним. Максимум 20 слів.",
        user: tasks && tasks.length > 0 ? `Ось мої плани: ${tasks.slice(0, 10).join(", ")}. Дай мені заряд енергії на ці справи!` : "Мій список справ порожній. Дай надихаючу пораду, чому важливо планувати свій успіх сьогодні.",
      },
      shop: {
        system: "Ти — експерт з раціональних покупок. Дай пораду, як купити все необхідне і не витратити зайвого. Відповідай ТІЛЬКИ українською. Максимум 20 слів.",
        user: shop && shop.length > 0 ? `Збираюся купити: ${shop.slice(0, 10).join(", ")}. Дай одну стратегічну пораду для цього списку.` : "Список покупок порожній. Дай пораду, як перетворити похід у магазин на приємну пригоду.",
      },
      journal: {
        system: "Ти — кулінарна муза. Твоя мета — розпалити апетит та бажання творити на кухні. Відповідай ТІЛЬКИ українською. Максимум 20 слів.",
        user: recipes && recipes.length > 0 ? `В журналі є ${recipes.length} ідей. Скажи щось таке, щоб мені захотілося приготувати щось особливе прямо зараз.` : "Журнал порожній. Скажи, чому домашня їжа — це найкращий прояв любові до себе.",
      },
    };

    const config = configs[activeTab] || configs.tasks;

    try {
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: config.user,
        config: { 
          systemInstruction: config.system,
          temperature: 0.7 
        }
      });
      const result = response.text ? response.text.trim() : "Продовжуй у тому ж дусі!";
      res.json({ result });
    } catch (error: any) {
      console.error("AI Analysis Error:", error);
      if (error.message?.includes('429')) {
        return res.json({ result: "ШІ трохи втомився. Зачекайте хвилину." });
      }
      res.json({ result: "Ти на правильному шляху! 💪" });
    }
  });

  // Ендпоінт оцінки цін
  app.post("/api/ai/estimate-prices", async (req, res) => {
    const { items } = req.body;
    if (!ai || !items || items.length === 0) {
      return res.json({ result: {} });
    }

    try {
      const system = `Ти — експерт з цін у Польщі. Надай об'єкт JSON де ключі - це назви товарів, а значення - їх середня ціна в PLN. Використовуй ціни Biedronka/Lidl.`;
      const user = `Оціни ціни для товарів (відповідай ТІЛЬКИ JSON): ${items.join(", ")}`;

      const schema: any = {
        type: Type.OBJECT,
        properties: items.reduce((acc: any, item: string) => {
          acc[item] = { 
            type: Type.NUMBER, 
            description: `Середня ціна для ${item} у PLN` 
          };
          return acc;
        }, {}),
        required: items,
      };

      const response = await ai.models.generateContent({ 
        model: MODEL_NAME,
        contents: user,
        config: {
          systemInstruction: system,
          responseMimeType: "application/json",
          responseSchema: schema,
          temperature: 0.1,
        }
      });

      const data = JSON.parse(response.text || "{}");
      const validated: Record<string, number> = {};
      for (const [key, val] of Object.entries(data)) {
        const num = typeof val === 'number' ? val : parseFloat(String(val));
        if (!isNaN(num) && num > 0) {
          validated[key] = Math.round(num * 100) / 100;
        }
      }

      res.json({ result: validated });
    } catch (error) {
      console.error("estimatePrices error:", error);
      res.json({ result: {} });
    }
  });

  // Ендпоінт генерації рецепту
  app.post("/api/ai/generate-recipe", async (req, res) => {
    const { items } = req.body;
    if (!ai || !items || items.length === 0) {
      return res.json({ result: "Додайте продукти для рецепту." });
    }

    try {
      const system = `Ти — шеф-кухар. Відповідай українською. Використовуй Markdown.
      Схема:
      ## НАЗВА
      ⏱ Час: X хв
      📝 Кроки: (нумерований список)
      💡 Секрет: одне речення`;
      const user = `Інгредієнти: ${items.join(", ")}. Створи 1 рецепт.`;

      const response = await ai.models.generateContent({ 
        model: MODEL_NAME,
        contents: user,
        config: { systemInstruction: system }
      });

      const result = response.text ? response.text.trim() : "Не вдалося сформувати рецепт.";
      res.json({ result });
    } catch (error) {
      console.error("generateRecipe error:", error);
      res.json({ result: "Шеф тимчасово недоступний. 👨‍🍳" });
    }
  });

  // Проміжне ПЗ Vite для розробки
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting in development mode with Vite middleware...");
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting in production mode...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"), (err) => {
        if (err) {
          console.error("Error sending index.html:", err);
          res.status(500).send("Server Error");
        }
      });
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Сервер запущено на http://localhost:${PORT}`);
  }).on('error', (err) => {
    console.error("Server failed to start:", err);
  });
}

startServer().catch((err) => {
  console.error("Unhandled error in startServer:", err);
});
