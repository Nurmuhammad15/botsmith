import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { startTranslating } from "@/lib/translate";

export type Lang = "uz" | "ru" | "en";
const dict = {
  bots: { uz: "Botlar", ru: "Боты", en: "Bots" },
  how: { uz: "Qanday ishlaydi", ru: "Как это работает", en: "How it works" },
  sell: { uz: "Bot sotish", ru: "Продать бота", en: "Sell a bot" },
  login: { uz: "Kirish", ru: "Войти", en: "Log in" },
  register: { uz: "Ro'yxatdan o'tish", ru: "Регистрация", en: "Sign up" },
  heroA: { uz: "Telegram", ru: "Telegram", en: "Buy" },
  heroB: { uz: "botlarni", ru: "ботов", en: "Telegram" },
  heroC: { uz: "xarid qiling", ru: "покупайте", en: "bots" },
  heroD: { uz: "yoki", ru: "или", en: "or" },
  heroE: { uz: "o'zingizning botingizni soting.", ru: "продавайте своих.", en: "sell your own." },
  heroSub: {
    uz: "Tayyor Telegram botlar, ishonchli dasturchilar va xavfsiz to'lov. Bizning platforma orqali o'z biznesingizni avtomatlashtiring yoki o'z botlaringizni soting.",
    ru: "Готовые Telegram-боты, надёжные разработчики и безопасная оплата. Автоматизируйте бизнес или продавайте своих ботов.",
    en: "Ready-made Telegram bots, trusted developers and secure payments. Automate your business or sell your own bots.",
  },
  search: {
    uz: "Bot nomi yoki kategoriya bo'yicha qidirish...",
    ru: "Поиск по названию или категории...",
    en: "Search by bot name or category...",
  },
  viewBots: { uz: "Botlarni ko'rish", ru: "Смотреть ботов", en: "Browse bots" },
  startSelling: { uz: "Bot sotishni boshlash", ru: "Начать продавать", en: "Start selling" },
  categories: { uz: "Kategoriyalar", ru: "Категории", en: "Categories" },
  popular: { uz: "Mashhur botlar", ru: "Популярные боты", en: "Popular bots" },
  seeAll: { uz: "Barchasini ko'rish", ru: "Смотреть все", en: "See all" },
  allBots: { uz: "Barcha botlar", ru: "Все боты", en: "All bots" },
  buy: { uz: "Xarid qilish", ru: "Купить", en: "Buy now" },
  message: { uz: "Sotuvchiga yozish", ru: "Написать продавцу", en: "Message seller" },
} as const;
export type Key = keyof typeof dict;

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: (k: Key) => string }>({
  lang: "uz",
  setLang: () => {},
  t: (k) => dict[k].uz,
});
const STORAGE_KEY = "botsmith-lang";

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("uz");

  // The server and first render are Uzbek; the saved language is applied right after hydration.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "ru" || saved === "en" || saved === "uz") setLangState(saved);
    } catch {
      /* storage unavailable: stay on Uzbek */
    }
  }, []);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  // Translate everything on the page (and whatever React renders later) into the chosen language.
  useEffect(() => {
    document.documentElement.lang = lang;
    return lang === "uz" ? undefined : startTranslating(lang);
  }, [lang]);

  return <Ctx.Provider value={{ lang, setLang, t: (k) => dict[k][lang] }}>{children}</Ctx.Provider>;
}
export const useT = () => useContext(Ctx);
