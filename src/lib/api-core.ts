import { getSupabaseClient } from "@/lib/supabase";

export type Row = Record<string, unknown>;

export const str = (v: unknown) => (typeof v === "string" ? v : "");
export const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));

/** The Supabase client, created lazily so importing this module never throws. */
export const db = () => getSupabaseClient();

/** Unwraps a Supabase result, throwing its error so react-query can surface it. */
export function check<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw result.error;
  return result.data;
}

// Messages raised by the database functions (see supabase/migrations) mapped to text that is
// safe and useful to show to the user.
const ERROR_MESSAGES: Record<string, string> = {
  not_authenticated: "Avval tizimga kiring.",
  not_a_seller: "Bu amal faqat sotuvchilar uchun.",
  invalid_card: "Karta raqami 16 ta raqamdan iborat bo‘lishi kerak.",
  amount_too_small: "Summa noto‘g‘ri.",
  amount_exceeds_available: "Summa yechish mumkin bo‘lgan balansdan oshib ketdi.",
  bot_not_found: "Bot topilmadi yoki e’lon qilinmagan.",
  own_bot: "Bu o‘zingizning botingiz.",
  order_not_found: "Buyurtma topilmadi.",
  invalid_transition: "Buyurtma holatini bunday o‘zgartirib bo‘lmaydi.",
  forbidden: "Bu amal uchun ruxsat yo‘q.",
  too_many_images: "Bitta botga ko‘pi bilan 5 ta rasm yuklash mumkin.",
  too_many_files: "Bitta botga ko‘pi bilan 10 ta fayl yuklash mumkin.",
  invalid_path: "Fayl manzili noto‘g‘ri.",
  file_not_found: "Fayl topilmadi.",
  rate_limited: "Juda tez yozyapsiz. Bir ozdan keyin qayta urinib ko‘ring.",
  payments_unavailable: "Onlayn to‘lov hozircha ulanmagan.",
};

/** Converts a Supabase/Postgres error into a message that is safe to show to the user. */
export function describeError(error: unknown): string {
  const message =
    error && typeof error === "object" && "message" in error ? str(error.message) : "";
  return (
    ERROR_MESSAGES[message] ??
    (message.includes("duplicate key") && message.includes("username")
      ? "Bu username band."
      : message.toLowerCase().includes("payload too large") ||
          message.toLowerCase().includes("exceeded the maximum allowed size")
        ? "Fayl hajmi ruxsat etilgandan katta."
        : "Amal bajarilmadi. Qayta urinib ko‘ring.")
  );
}
