import { GoogleGenAI, Type } from "@google/genai";

// --- Типи ---
type CacheValue = string | Record<string, number>;

// --- Ініціалізація Gemini (клієнтська) ---
const getAI = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'undefined') {
    console.warn("GEMINI_API_KEY is not defined. AI features will be disabled.");
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

const ai = getAI();
const MODEL_NAME = "gemini-3-flash-preview";

// --- LRU кеш ---
const cache = {
  status: new Map<string, string>(),
  prices: new Map<string, Record<string, number>>(),
  recipes: new Map<string, string>(),
};

const MAX_CACHE_SIZE = 50;

function cacheSet<T extends CacheValue>(map: Map<string, T>, key: string, value: T) {
  if (map.size >= MAX_CACHE_SIZE) {
    const firstKey = map.keys().next().value;
    if (firstKey !== undefined) map.delete(firstKey);
  }
  map.set(key, value);
}

// =============================================================================
// ПУБЛІЧНІ ФУНКЦІЇ
// =============================================================================

export async function analyzeStatus(
  tasks: string[],
  shop: string[],
  recipes: string[],
  activeTab: string,
  force: boolean = false
): Promise<string> {
  const cacheKey = `${activeTab}|${tasks.sort().join(",")}|${shop.sort().join(",")}|${recipes.length}`;
  if (!force && cache.status.has(cacheKey)) return cache.status.get(cacheKey)!;

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
    if (!ai) throw new Error("AI_NOT_INITIALIZED");

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: config.user,
      config: { 
        systemInstruction: config.system,
        temperature: 0.7 
      }
    });
    
    const result = response.text ? response.text.trim() : "Продовжуй у тому ж дусі!";
    cacheSet(cache.status, cacheKey, result);
    return result;
  } catch (error: any) {
    console.error("AI Analysis Error:", error);
    if (error.message?.includes('429')) return "ШІ трохи втомився. Зачекайте хвилину.";
    if (error.message?.includes('AI_NOT_INITIALIZED')) return "ШІ не налаштовано (відсутній ключ).";
    return "Ти на правильному шляху! 💪";
  }
}

export async function estimatePrices(items: string[]): Promise<Record<string, number>> {
  if (!ai || items.length === 0) return {};

  const cacheKey = [...items].sort().join("|");
  if (cache.prices.has(cacheKey)) return cache.prices.get(cacheKey)!;

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

    cacheSet(cache.prices, cacheKey, validated);
    return validated;
  } catch (error) {
    console.error("estimatePrices error:", error);
    return {};
  }
}

export async function generateRecipe(items: string[]): Promise<string> {
  if (!ai || items.length === 0) return "Додайте продукти для рецепту.";

  const cacheKey = [...items].sort().join("|");
  if (cache.recipes.has(cacheKey)) return cache.recipes.get(cacheKey)!;

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
    cacheSet(cache.recipes, cacheKey, result);
    return result;
  } catch {
    return "Шеф тимчасово недоступний. 👨‍🍳";
  }
}

export function clearAICache() {
  cache.status.clear();
  cache.prices.clear();
  cache.recipes.clear();
}
