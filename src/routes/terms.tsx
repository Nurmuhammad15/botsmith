import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteLayout } from "@/components/site";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Obuna va qaytarish qoidalari — BotSmith" },
      {
        name: "description",
        content: "BotSmith obunalari, 24 soatlik qaytarish muddati va platforma shartlari.",
      },
      { name: "robots", content: "index,follow" },
    ],
  }),
  component: Terms,
});

function Terms() {
  return (
    <SiteLayout>
      <article className="prose prose-sm mx-auto max-w-3xl px-4 py-12 text-foreground">
        <h1 className="text-3xl font-bold">Obuna va qaytarish qoidalari</h1>
        <p className="mt-2 text-sm text-muted-foreground">Oxirgi yangilanish: 2026-yil 11-oktabr</p>

        <h2 className="mt-8 text-xl font-semibold">Obuna xaridi</h2>
        <p className="mt-3 text-sm leading-7">
          BotSmith katalogida ko‘rsatilgan botdan 1, 7 yoki 30 kunlik muddatga obuna tanlaysiz.
          To‘lov tasdiqlangan vaqtda obuna faollashadi va bot egasining ulangan webhook tizimiga
          faollashtirish xabari yuboriladi. Obuna muddati to‘lov tasdiqlangan paytdan hisoblanadi.
        </p>

        <h2 className="mt-8 text-xl font-semibold">24 soat ichida qaytarish</h2>
        <p className="mt-3 text-sm leading-7">
          Xarid sizga mos kelmasa, to‘lov muvaffaqiyatli tasdiqlanganidan keyin 24 soat ichida
          “Mening buyurtmalarim” sahifasidan sababini yozib qaytarish so‘rovini yuboring. Bu qoida
          obuna 1, 7 yoki 30 kunlik bo‘lishidan qat’i nazar amal qiladi. Murojaat yuborilgach,
          BotSmith jamoasi so‘rovni tekshiradi va tasdiqlangan qaytarishni dastlabki to‘lov usuli
          orqali qo‘lda rasmiylashtiradi. Bank yoki to‘lov provayderining qayta ishlash muddati farq
          qilishi mumkin. 24 soat o‘tgach yangi qaytarish so‘rovi qabul qilinmaydi.
        </p>
        <p className="mt-3 text-sm leading-7">
          Qaytarish so‘rovi ko‘rib chiqilayotgan vaqt ichida bot egasi ruxsatni vaqtincha
          to‘xtatishi mumkin. Qaytarish tasdiqlansa obuna bekor qilinadi; rad etilsa, obuna muddati
          tugamagan bo‘lsa, bot egasiga qayta faollashtirish hodisasi yuboriladi.
        </p>

        <h2 className="mt-8 text-xl font-semibold">Narx va komissiya</h2>
        <p className="mt-3 text-sm leading-7">
          Xaridor to‘lov vaqtida bot sahifasidagi obuna narxini to‘laydi; xaridorga qo‘shimcha 15%
          qo‘shilmaydi. BotSmith sotuvchining belgilagan narxidan 15% platforma komissiyasini ushlab
          qoladi, qolgan 85% sotuvchining hisobiga yoziladi. Pul yechishning alohida komissiyasi 3%
          ni tashkil etadi. Sotuv daromadi yechishdan oldin 24 soat ushlab turiladi; qaytarish
          so‘rovi ko‘rib chiqilayotgan paytda u yechish uchun ochilmaydi.
        </p>

        <h2 className="mt-8 text-xl font-semibold">Rozilik</h2>
        <p className="mt-3 text-sm leading-7">
          To‘lovga o‘tishdan oldin ushbu qoidalarni o‘qib, rozilik katagini belgilashingiz kerak.
          Rozilik va qoidalar versiyasi buyurtmaga biriktirib saqlanadi.
        </p>
        <h2 className="mt-8 text-xl font-semibold">Bot ulanishi</h2>
        <p className="mt-3 text-sm leading-7">
          Bot egasi HTTPS webhook manzilini va maxfiy kalitni taqdim etadi. BotSmith JSON
          hodisalarini yuboradi: `subscription.activated`, `subscription.expired`,
          `subscription.refund_requested`, `subscription.refunded` va `subscription.reactivated`.
          Har bir so‘rov `X-BotSmith-Timestamp` hamda `X-BotSmith-Signature` sarlavhalari bilan
          HMAC-SHA256 usulida imzolanadi. Bot egasi imzoni tekshirishi va takroriy hodisalarni
          `X-BotSmith-Delivery` identifikatori orqali aniqlashi kerak.
        </p>
        <p className="mt-8 text-sm">
          <Link to="/help" className="text-primary underline">
            Savollar bo‘lsa yordam markaziga o‘ting
          </Link>
        </p>
      </article>
    </SiteLayout>
  );
}
