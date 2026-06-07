// --- LRU кеш ---
const cache = {
  status: new Map<string, string>(),
  prices: new Map<string, Record<string, number>>(),
  recipes: new Map<string, string>(),
  compare: new Map<string, any>(),
};

const MAX_CACHE_SIZE = 50;

function cacheSet<T>(map: Map<string, T>, key: string, value: T) {
  if (map.size >= MAX_CACHE_SIZE) {
    const firstKey = map.keys().next().value;
    if (firstKey !== undefined) map.delete(firstKey);
  }
  map.set(key, value);
}

// =============================================================================
// ПУБЛІЧНІ ФУНКЦІЇ ДЛЯ КЛІЄНТА (ЗВЕРНЕННЯ ДО НАШОГО EXРRESS API)
// =============================================================================

export interface StoreComparison {
  cheaperStore: 'Biedronka' | 'Lidl';
  biedronkaTotal: number;
  lidlTotal: number;
  differencePLN: number;
  differencePercent: number;
  explanation: string;
}

export async function compareStores(items: string[], force: boolean = false): Promise<StoreComparison | null> {
  if (items.length === 0) return null;

  const cacheKey = [...items].sort().join("|");
  if (!force && cache.compare.has(cacheKey)) return cache.compare.get(cacheKey)!;

  try {
    const response = await fetch("/api/ai/compare-stores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items })
    });
    const data = await response.json();
    const result = data.result || null;
    if (result) {
      cacheSet(cache.compare, cacheKey, result);
    }
    return result;
  } catch (error) {
    console.error("compareStores Client Fetch Error:", error);
    return null;
  }
}

export async function analyzeStatus(
  tasks: string[],
  shop: string[],
  recipes: string[],
  activeTab: string,
  force: boolean = false
): Promise<string> {
  const cacheKey = `${activeTab}|${tasks.sort().join(",")}|${shop.sort().join(",")}|${recipes.length}`;
  if (!force && cache.status.has(cacheKey)) return cache.status.get(cacheKey)!;

  try {
    const response = await fetch("/api/ai/analyze-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tasks, shop, recipes, activeTab })
    });
    const data = await response.json();
    const result = data.result || "Продовжуй у тому ж дусі!";
    cacheSet(cache.status, cacheKey, result);
    return result;
  } catch (error) {
    console.error("AI Analysis Client Fetch Error:", error);
    return "Ти на правильному шляху! 💪";
  }
}

export async function estimatePrices(items: string[]): Promise<Record<string, number>> {
  if (items.length === 0) return {};

  const cacheKey = [...items].sort().join("|");
  if (cache.prices.has(cacheKey)) return cache.prices.get(cacheKey)!;

  try {
    const response = await fetch("/api/ai/estimate-prices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items })
    });
    const data = await response.json();
    const validated = data.result || {};
    cacheSet(cache.prices, cacheKey, validated);
    return validated;
  } catch (error) {
    console.error("estimatePrices Client Fetch Error:", error);
    return {};
  }
}

export async function generateRecipe(items: string[]): Promise<string> {
  if (items.length === 0) return "Додайте продукти для рецепту.";

  const cacheKey = [...items].sort().join("|");
  if (cache.recipes.has(cacheKey)) return cache.recipes.get(cacheKey)!;

  try {
    const response = await fetch("/api/ai/generate-recipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items })
    });
    const data = await response.json();
    const result = data.result || "Не вдалося сформувати рецепт.";
    cacheSet(cache.recipes, cacheKey, result);
    return result;
  } catch (error) {
    console.error("generateRecipe Client Fetch Error:", error);
    return "Шеф тимчасово недоступний. 👨‍🍳";
  }
}

export function clearAICache() {
  cache.status.clear();
  cache.prices.clear();
  cache.recipes.clear();
  cache.compare.clear();
}
