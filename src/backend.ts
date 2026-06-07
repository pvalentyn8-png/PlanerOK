import express from "express";
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

const app = express();

app.use(express.json());

// API Ендпоінти
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Ендпоінт аналізу мотивації
app.post("/api/ai/analyze-status", async (req, res) => {
  const { tasks, shop, recipes, activeTab, language } = req.body;
  const lang = language === 'pl' ? 'pl' : 'ua';

  const uaQuotes = [
    "Справжні зміни починаються не з понеділка, а з маленького вибору просто зараз. Роби свій крок!",
    "Твоя сила — у твоїй системі. Кожне викреслене завдання сьогодні — це інвестиція у твоє завтра. Валік з тобою!",
    "Розвиток — це не відсутність помилок, це сміливість продовжувати рух, навіть коли важко. Ти можеш більше!",
    "Усвідомленість наповнює змістом кожен твій крок. Плануй свій день так, ніби будуєш шедевр.",
    "Дисципліна — це міст між твоїми цілями та твоїми реальними досягненнями. Зроби цей важливий крок!",
    "Будь кращим за себе вчорашнього. Навіть найменший прогрес наближає тебе до внутрішньої свободи.",
    "Трансформація починається з уміння цінувати свій час. Твої плани — це твої пріоритети росту.",
    "Успіх — це сума маленьких зусиль, що повторюються день у день. Давай змінимо життя на краще разом!",
    "Щоб отримати те, чого ніколи не мав, почни робити те, чого ніколи не робив. Виходь за рамки!",
    "Життя змінюється тоді, коли твій фокус зміщується з обмежень на твої безмежні можливості! Валік у тебе вірить."
  ];

  const plQuotes = [
    "Prawdziwa zmiana zaczyna się od małego kroku tu i teraz. Zrób swój ruch!",
    "Twoja siła tkwi w systematyczności. Każde dzisiejsze zadanie to inwestycja w jutro.",
    "Rozwój to nie brak błędów, ale odwaga do dalszego działania. Stać Cię na więcej! Walik wierzy w Ciebie.",
    "Uważność nadaje sens każdemu krokowi. Zaplanuj swój dzień jak wspaniałe dzieło.",
    "Dyscyplina to most łączący Twoje cele z ich realizacją. Zrób ten mały krok!",
    "Bądź lepszy od siebie z wczoraj. Nawet najmniejszy postęp zbliża Cię do wolności.",
    "Sukces to suma małych wysiłków powtarzanych każdego dnia. Walik trzyma kciuki!",
    "Aby mieć to, czego nigdy nie miałeś, zacznij robić to, czego nigdy nie robiłeś!",
    "Życie zmienia się wtedy, gdy skupiasz się na swoich nieograniczonych możliwościach!"
  ];

  const getRandomFallback = () => {
    const list = lang === 'pl' ? plQuotes : uaQuotes;
    return list[Math.floor(Math.random() * list.length)];
  };

  if (!ai) {
    return res.json({ result: getRandomFallback() });
  }

  const configs: Record<string, { system: string; user: string }> = {
    tasks: {
      system: lang === 'ua'
        ? "Ти — Валік, мудрий, досвідчений та харизматичний ментор зі збільшення особистої сили, саморозвитку та трансформації. Твоє завдання — проаналізувати плани людини і дати одну влучну, глибоку чи надзвичайно надихаючу фразу українською мовою з категорії змін особистості, яка підштовхне людину до самовдосконалення, розкриття потенціалу та усвідомленості. Відповідай дружньо, енергійно, лаконічно (максимум 20 слів). Не використовуй банальні гасла. Можеш завершити фразу підписом '- Валік'."
        : "Jesteś Walik, mądrym, doświadczonym i charyzmatycznym mentorem rozwoju osobistego, dyscypliny i transformacji życia. Twoim zadaniem jest przeanalizowanie planów i podanie jednego celnego, głębokiego i motywującego zdania w języku polskim z kategorii rozwoju osobistego, które popchnie człowieka do samodoskonalenia i świadomości. Odpowiadaj przyjaźnie, energicznie, zwięźle (maksymalnie 20 słów). Możesz podpisać na końcu '- Walik'.",
      user: lang === 'ua'
        ? (tasks && tasks.length > 0 ? `Ось мої плани: ${tasks.slice(0, 10).join(", ")}. Дай мені настанову Валіка!` : "Мій список справ порожній. Дай пораду від Валіка про важливість планування.")
        : (tasks && tasks.length > 0 ? `Oto moje plany: ${tasks.slice(0, 10).join(", ")}. Daj mi radę od Walika!` : "Moja lista zadań jest pusta. Daj mądrą radę od Walika o dyscyplinie."),
    },
    shop: {
      system: lang === 'ua'
        ? "Ти — Валік, ментор з усвідомленого споживання, балансу та саморозвитку. Подивися на список покупок та дай одну мудру й усвідомлену пораду українською мовою, як робити покупки з повагою до свого бюджету, здоров'я та внутрішнього балансу у процесі особистісної трансформації. Максимум 20 слів."
        : "Jesteś Walik, mądrym mentorem świadomej konsumpcji, balansu i samorozwoju. Spójrz na listę zakupów i daj jedną mądrą radę w języku polskim, jak kupować z szacunkiem do budżetu i wewnętrznej harmonii. Maksymalnie 20 słów.",
      user: lang === 'ua'
        ? (shop && shop.length > 0 ? `Збираюся купити: ${shop.slice(0, 10).join(", ")}. Дай усвідомлену пораду від Валіка.` : "Список покупок порожній. Дай пораду від Валіка, як купувати з розумом.")
        : (shop && shop.length > 0 ? `Chcę kupić: ${shop.slice(0, 10).join(", ")}. Daj mi mądrą radę od Walika.` : "Lista zakupów jest pusta. Daj radę od Walika o świadomych zakupach."),
    },
    journal: {
      system: lang === 'ua'
        ? "Ти — Валік, провідник у світ самопізнання, внутрішнього спокою та любові до себе. Твоя мета — дати коротку надихаючу фразу або думку українською мовою про те, як турбота про свій раціон, кулінарне творення чи ведення щоденника рецептів сприяє особистісній трансформації, змінам та гармонії. Максимум 20 слів."
        : "Jesteś Walik, przewodnikiem po świecie samooceny, spokoju i miłości do samego siebie. Daj krótkie inspirujące zdanie w języku polskim o tym, jak troska o jedzenie czy prowadzenie dziennika przepisów sprzyja transformacji osobistej. Maksymalnie 20 słów.",
      user: lang === 'ua'
        ? (recipes && recipes.length > 0 ? `В журналі є ${recipes.length} ідей. Дай мудрість Валіка.` : "Журнал порожній. Дай пораду від Валіка про турботу про себе.")
        : (recipes && recipes.length > 0 ? `W dzienniku jest ${recipes.length} przepisów. Daj mądrość od Walika.` : "Dziennik przepisów jest pusty. Daj radę od Walika o dbaniu o siebie."),
    },
  };

  const config = configs[activeTab] || configs.tasks;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: config.user,
      config: { 
        systemInstruction: config.system,
        temperature: 0.85 
      }
    });
    const result = response.text ? response.text.trim() : getRandomFallback();
    res.json({ result });
  } catch (error: any) {
    console.error("AI Analysis Error:", error);
    res.json({ result: getRandomFallback() });
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

// Ендпоінт порівняння кошика у обраних користувачем супермаркетах
app.post("/api/ai/compare-stores", async (req, res) => {
  const { items, stores } = req.body;
  if (!items || items.length === 0) {
    return res.json({ result: null });
  }

  const selectedStores = (stores && Array.isArray(stores) && stores.length > 0)
    ? stores
    : ["Lidl", "Biedronka"];

  // Розрахунок детерміністичних реалістичних демо-даних у разі відсутності AI або при збоях
  const buildFallbackResult = () => {
    const fallbackTotals: Record<string, number> = {};
    let sumBase = 0;
    
    items.forEach((item: string) => {
      let itemHash = 0;
      for (let i = 0; i < item.length; i++) {
        itemHash += item.charCodeAt(i);
      }
      const val = 4.5 + (itemHash % 21); // Орієнтовна ціна від 4.5 до 25.5 PLN
      sumBase += val;
    });

    selectedStores.forEach((st: string) => {
      let modifier = 1.0;
      const label = st.toLowerCase().trim();
      if (label.includes('zabka') || label.includes('żabka')) modifier = 1.35; // Żabka дорожча в середньому
      else if (label.includes('auchan')) modifier = 0.94; // Auchan гіпермаркет, дешевше
      else if (label.includes('lidl')) modifier = 1.01;
      else if (label.includes('biedronka')) modifier = 0.99;
      else if (label.includes('kaufland')) modifier = 0.97;
      else if (label.includes('carrefour')) modifier = 1.03;
      else if (label.includes('dino')) modifier = 1.02;

      fallbackTotals[st] = parseFloat((sumBase * modifier).toFixed(2));
    });

    // Найдешевший та найдорожчий кошик
    let cheaperStore = selectedStores[0];
    let minPrice = fallbackTotals[cheaperStore] || 999;
    let maxPrice = fallbackTotals[cheaperStore] || 0;

    selectedStores.forEach((st: string) => {
      const val = fallbackTotals[st];
      if (val < minPrice) {
        minPrice = val;
        cheaperStore = st;
      }
      if (val > maxPrice) {
        maxPrice = val;
      }
    });

    const diffPLN = parseFloat((maxPrice - minPrice).toFixed(2));
    const diffPercent = minPrice > 0 ? Math.round((diffPLN / minPrice) * 100) : 0;
    const explanation = `За оцінкою PlannerOk для обраних магазинів (${selectedStores.join(', ')}), у ${cheaperStore} загальна вартість кошика є найнижчою. Поради: свіжі продукти купуйте у Lidl та Biedronka, на сухі товари порівнюйте Auchan, а Żabka ідеальна для термінових експрес-покупок.`;

    return {
      cheaperStore,
      totals: fallbackTotals,
      biedronkaTotal: fallbackTotals["Biedronka"] || fallbackTotals["biedronka"] || 0,
      lidlTotal: fallbackTotals["Lidl"] || fallbackTotals["lidl"] || 0,
      differencePLN: diffPLN,
      differencePercent: diffPercent,
      explanation,
      storeTotals: Object.entries(fallbackTotals).map(([storeName, totalPrice]) => ({ storeName, totalPrice }))
    };
  };

  if (!ai) {
    return res.json({ result: buildFallbackResult() });
  }

  try {
    const system = `Ти — експерт з оптимізації витрат у польських супермаркетах.
    Твоє завдання — проаналізувати список продуктів, оцінити їх сумарну вартість окремо для КОЖНОГО зі вказаних користувачем магазинів: ${selectedStores.join(", ")}, визначити який з них найдешевший серед вказаних, розрахувати різницю і дати коротку пораду українською мовою.
    Використовуй реальні середні ціни в PLN за останні місяці (приблизно: м'ясо 15-30 PLN, хліб 3-6 PLN, молоко 3.5 PLN, фрукти 5-15 PLN тощо; Żabka зазвичай значно дорожча на 30-40%, Auchan і Biedronka є дешевшими).
    Відповідай виключно форматом JSON за схемою. Пояснення (explanation) має бути коротким, дотепним і корисним українською мовою (до 30-40 слів).`;

    const user = `Проаналізуй та порівняй кошик продуктів для обраних магазинів (${selectedStores.join(", ")}): ${items.join(", ")}`;

    const schema: any = {
      type: Type.OBJECT,
      properties: {
        cheaperStore: { 
          type: Type.STRING, 
          description: "Назва найдешевшого магазину з обраних користувачем" 
        },
        storeTotals: {
          type: Type.ARRAY,
          description: "Сумарні вартості кошика для кожного з обраних користувачем магазинів",
          items: {
            type: Type.OBJECT,
            properties: {
              storeName: { type: Type.STRING, description: "Назва супермаркету" },
              totalPrice: { type: Type.NUMBER, description: "Сумарна вартість кошика в PLN" }
            },
            required: ["storeName", "totalPrice"]
          }
        },
        differencePLN: { 
          type: Type.NUMBER, 
          description: "Різниця між найдешевшим та найдорожчим магазином в PLN (додатне число)" 
        },
        differencePercent: { 
          type: Type.NUMBER, 
          description: "Різниця у відсотках" 
        },
        explanation: { 
          type: Type.STRING, 
          description: "Коротке пояснення українською мовою - макс 35 слів." 
        }
      },
      required: ["cheaperStore", "storeTotals", "differencePLN", "differencePercent", "explanation"],
    };

    const response = await ai.models.generateContent({ 
      model: MODEL_NAME,
      contents: user,
      config: {
        systemInstruction: system,
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: 0.2,
      }
    });

    const data = JSON.parse(response.text || "null");
    if (!data || !data.storeTotals) {
      return res.json({ result: buildFallbackResult() });
    }

    const totals: Record<string, number> = {};
    data.storeTotals.forEach((t: any) => {
      if (t && t.storeName) {
        totals[t.storeName] = t.totalPrice;
      }
    });

    const formattedData = {
      ...data,
      totals,
      biedronkaTotal: totals["Biedronka"] || totals["biedronka"] || 0,
      lidlTotal: totals["Lidl"] || totals["lidl"] || 0,
    };

    res.json({ result: formattedData });
  } catch (error) {
    console.error("compare-stores error:", error);
    res.json({ result: buildFallbackResult() });
  }
});

// Ендпоінт отримання акційних товарів у Lidl, Biedronka, Żabka та Dino
app.post("/api/ai/promotions", async (req, res) => {
  const { category } = req.body;
  
  // Реалістичні демо-дані акцій на випадок відсутності ключа ШІ або збоїв
  const fallbackPromotions = [
    {
      id: "promo-fb-1",
      store: "Biedronka",
      product: "Мука пшенична Mąka Basia extra 1kg",
      price: 2.49,
      originalPrice: 4.19,
      discountText: "-40% з карткою Moja Biedronka",
      startDate: "2026-06-04",
      endDate: "2026-06-10",
      category: "Бакалія"
    },
    {
      id: "promo-fb-2",
      store: "Lidl",
      product: "Масло вершкове Pilos Extra 200g",
      price: 3.99,
      originalPrice: 6.89,
      discountText: "Kup 3, zapłać mniej",
      startDate: "2026-06-04",
      endDate: "2026-06-10",
      category: "Молочні продукти"
    },
    {
      id: "promo-fb-3",
      store: "Żabka",
      product: "Гарячий хот-дог великий (Кобінос / Кабанос)",
      price: 5.99,
      originalPrice: 8.49,
      discountText: "Суперціна у додатку Żappka",
      startDate: "2026-06-05",
      endDate: "2026-06-12",
      category: "Снеки"
    },
    {
      id: "promo-fb-4",
      store: "Biedronka",
      product: "Філе курячої грудки Kraina Mięs 1kg",
      price: 13.99,
      originalPrice: 22.99,
      discountText: "-39% у супермаркеті",
      startDate: "2026-06-04",
      endDate: "2026-06-10",
      category: "М'ясо"
    },
    {
      id: "promo-fb-5",
      store: "Lidl",
      product: "Свіжа лохина (боровинка) у коробці 500g",
      price: 11.99,
      originalPrice: 19.99,
      discountText: "-40% суперціна",
      startDate: "2026-06-04",
      endDate: "2026-06-10",
      category: "Овочі та фрукти"
    },
    {
      id: "promo-fb-6",
      store: "Żabka",
      product: "Енергетичний напій Tiger 250ml (асортимент)",
      price: 2.00,
      originalPrice: 3.49,
      discountText: "Kup 2, drugi -60%",
      startDate: "2026-06-05",
      endDate: "2026-06-12",
      category: "Напої"
    },
    {
      id: "promo-fb-7",
      store: "Biedronka",
      product: "Помідори на гілці солодкі свіжі 1kg",
      price: 4.99,
      originalPrice: 9.99,
      discountText: "Знижка -50%",
      startDate: "2026-06-04",
      endDate: "2026-06-10",
      category: "Овочі та фрукти"
    },
    {
      id: "promo-fb-8",
      store: "Lidl",
      product: "Багети часникові хрусткі для випікання 2x175g",
      price: 3.29,
      originalPrice: 4.99,
      discountText: "Купи 2 за ціною 1.5",
      startDate: "2026-06-04",
      endDate: "2026-06-10",
      category: "Бакалія"
    },
    {
      id: "promo-fb-9",
      store: "Żabka",
      product: "Молочний напій Müller Mullermilch 400ml",
      price: 3.33,
      originalPrice: 4.99,
      discountText: "2+1 gratis (три за ціною двох)",
      startDate: "2026-06-05",
      endDate: "2026-06-12",
      category: "Молочні продукти"
    },
    {
      id: "promo-fb-10",
      store: "Dino",
      product: "Банани свіжі еквадорські стиглі 1kg",
      price: 3.49,
      originalPrice: 6.99,
      discountText: "Суперціна в Dino",
      startDate: "2026-06-04",
      endDate: "2026-06-10",
      category: "Овочі та фрукти"
    },
    {
      id: "promo-fb-11",
      store: "Dino",
      product: "Сік яблучниій Solevita / Dino 1L",
      price: 2.89,
      originalPrice: 3.99,
      discountText: "Купи 3 пляшки дешевше",
      startDate: "2026-06-04",
      endDate: "2026-06-11",
      category: "Напої"
    },
    {
      id: "promo-fb-12",
      store: "Dino",
      product: "Шоколад молочний Milka Alpejskie Mleko 100g",
      price: 2.99,
      originalPrice: 4.99,
      discountText: "Знижка з карткою Dino",
      startDate: "2026-06-05",
      endDate: "2026-06-11",
      category: "Солодощі"
    },
    {
      id: "promo-fb-13",
      store: "Dino",
      product: "Кава мелена Jacobs Kronung aroma 500g",
      price: 19.99,
      originalPrice: 29.99,
      discountText: "Акція тижня в Dino",
      startDate: "2026-06-04",
      endDate: "2026-06-10",
      category: "Бакалія"
    },
    {
      id: "promo-fb-14",
      store: "Dino",
      product: "Свиняча лопатка без кістки Kraina Mięs 1kg",
      price: 12.99,
      originalPrice: 19.99,
      discountText: "-35% найнижча ціна",
      startDate: "2026-06-04",
      endDate: "2026-06-10",
      category: "М'ясо"
    },
    {
      id: "promo-fb-15",
      store: "Dino",
      product: "Йогурт питний Activia асортимент лохина 280g",
      price: 2.49,
      originalPrice: 3.69,
      discountText: "Купи 2 за ціною 1.5",
      startDate: "2026-06-05",
      endDate: "2026-06-12",
      category: "Молочні продукти"
    }
  ];

  if (!ai) {
    // Якщо ШІ не ініціалізовано, повертаємо фільтровані мок-дані
    const filtered = category && category !== 'всі'
      ? fallbackPromotions.filter(p => p.category.toLowerCase() === category.toLowerCase())
      : fallbackPromotions;
    return res.json({ result: filtered });
  }

  try {
    const system = `Ти — експерт з купівель, акцій та дисконтів у польських мережах супермаркетів (Lidl, Biedronka, Żabka та Dino).
    Твоє завдання — згенерувати багатий та різноманітний список актуальних, реалістичних та вигідних акційних товарів на червень 2026 року (сьогодні у системі: 2026-06-07).
    Для КОЖНОГО товару обов'язково вкажи ТЕРМІН ДІЇ АКЦІЇ (startDate та endDate повинні бути в околі поточної дати, наприклад, startDate від 2026-06-04 до 2026-06-08, endDate від 2026-06-10 до 2026-06-14).
    Формат дат: YYYY-MM-DD.
    Акції повинні бути різноманітними: м'ясо (М'ясо), овочі/фрукти (Овочі та фрукти), молочні продукти (Молочні продукти), напої (Напої), бакалія (Бакалія), солодощі (Солодощі) та снеки (Снеки).
    Для Żabka вказуй унікальні формати акцій, такі як "Kup 2 і плати менше", "2+1 gratis", "Wielosztuki", які є канонічними для цієї мережі.
    Для Dino, Lidl та Biedronka вказуй знижки в % (наприклад, -30%, -40% чи -50%, 'Купи 2, другий -60%' чи '1+1 безкоштовно').
    Продукти пиши зрозумілою мовою (можна сумішшю польських назв та українських пояснень, наприклад 'Масло вершкове Masło Extra Pilos' або 'Банани свіжі стійкі Dino').
    Поверни відповідь виключно як масив JSON відповідно до схеми.`;

    const user = `Створи великий список з 15-20 унікальних промо-пропозицій для супермаркетів Lidl, Biedronka, Żabka та Dino (розподіли приблизно порівну між цими 4 мережами). Фільтрація за категорією: ${category || 'всі'}.`;

    const schema: any = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING, description: "Унікальний ідентифікатор" },
          store: { type: Type.STRING, description: "Значення: 'Lidl', 'Biedronka', 'Żabka' або 'Dino'" },
          product: { type: Type.STRING, description: "Назва товару українською з польськими елементами" },
          price: { type: Type.NUMBER, description: "Акційна ціна в PLN (наприклад 3.49)" },
          originalPrice: { type: Type.NUMBER, description: "Оригінальна ціна в PLN (наприклад 5.99)" },
          discountText: { type: Type.STRING, description: "Короткий опис акційного медіатору: -30%, 1+1, 2+1 безкоштовно тощо" },
          startDate: { type: Type.STRING, description: "Початок акції у форматі YYYY-MM-DD" },
          endDate: { type: Type.STRING, description: "Кінець акції у форматі YYYY-MM-DD" },
          category: { type: Type.STRING, description: "Категорія: Бакалія, Молочні продукти, Напої, М'ясо, Овочі та фрукти, Снеки, Солодощі" }
        },
        required: ["id", "store", "product", "price", "originalPrice", "discountText", "startDate", "endDate", "category"]
      }
    };

    const response = await ai.models.generateContent({ 
      model: MODEL_NAME,
      contents: user,
      config: {
        systemInstruction: system,
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: 0.7,
      }
    });

    const parsed = JSON.parse(response.text || "[]");
    res.json({ result: parsed.length > 0 ? parsed : fallbackPromotions });
  } catch (err) {
    console.error("estimatePromotions err:", err);
    res.json({ result: fallbackPromotions });
  }
});

export default app;
