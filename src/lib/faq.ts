// Help-centre content, shared by the public, buyer and seller help pages.
export type Faq = readonly [question: string, answer: string];

export const buyerFaqs: Faq[] = [
  [
    "Botni qanday xarid qilaman?",
    "Katalogdan botni tanlang, 1, 7 yoki 30 kunlik obunani tanlang va “Obuna bo‘lish”ni bosing. Qoidalarni qabul qilib to‘lov qilganingizdan so‘ng botga kirish faollashadi.",
  ],
  [
    "To‘lov qanday amalga oshiriladi?",
    "Buyurtmadagi to‘lov tugmasi orqali (Payme yoki Click, ulangan bo‘lsa). To‘lov tasdiqlangach tanlangan obuna muddati boshlanadi. Agar onlayn to‘lov mavjud bo‘lmasa, yordam chatiga yozing — to‘lovni administrator qo‘lda tasdiqlaydi.",
  ],
  [
    "Obuna qachon faollashadi?",
    "To‘lov provayder tomonidan tasdiqlanishi bilan obuna boshlanadi. Obuna muddati va tugash vaqtini “Buyurtmalar” sahifasida ko‘rasiz.",
  ],
  [
    "Sotuvchi bilan qanday bog‘lanaman?",
    "Bot sahifasidagi “Sotuvchiga yozish” tugmasi orqali. Barcha yozishmalar “Xabarlar” bo‘limida saqlanadi va yangi xabar kelganda belgi chiqadi.",
  ],
  [
    "Sevimli botlarni qanday saqlayman?",
    "Bot kartasidagi yurak belgisini bosing. Saqlangan botlar “Sevimlilar” sahifasida chiqadi.",
  ],
  [
    "Sharhni qanday qoldiraman?",
    "To‘lovi tasdiqlangan bot sahifasidagi “Sharhlar” bo‘limida baho va fikringizni yuboring. Har bir bot uchun bitta sharh qoldirish mumkin.",
  ],
  [
    "Nega narxlarni ko‘rmayapman?",
    "Obuna narxlari bot sahifasida tizimga kirmagan foydalanuvchilarga ham ko‘rsatiladi.",
  ],
  [
    "Muammo yuzaga kelsa nima qilaman?",
    "To‘lov tasdiqlangach 24 soat ichida “Buyurtmalar” sahifasidan sababini ko‘rsatib qaytarish so‘rovini yuboring. BotHub jamoasi uni ko‘rib chiqadi; batafsil shartlar “Obuna va qaytarish qoidalari” sahifasida.",
  ],
];

export const sellerFaqs: Faq[] = [
  [
    "Bot obunasini qanday joylayman?",
    "“Yangi bot qo‘shish” orqali bot nomi, tavsifi, rasmlari va 1/7/30 kunlik obuna narxlarini kiriting. Administrator tekshirgach bot katalogda e’lon qilinadi.",
  ],
  [
    "Rasm va obuna narxlarini qanday boshqaraman?",
    "Bot sahifasida rasmlar va uchta obuna narxini yangilang. Xaridor 1, 7 yoki 30 kunlik rejani tanlaydi; sayt bot fayllarini sotmaydi va tarqatmaydi. E’lon qilingan botga yangi rasm qo‘shsangiz, u qayta tekshiruvga yuboriladi.",
  ],
  [
    "Botga kirishni qanday boshqaraman?",
    "“Buyurtmalar” bo‘limida to‘lov, obuna muddati va qaytarish so‘rovi holatini ko‘ring. Xaridorga shu yerdan yozib, botingizga kirishni qo‘lda bering yoki obuna tugaganda bekor qiling. To‘lov va qaytarish qarorlarini BotHub nazorat qiladi.",
  ],
  [
    "Xaridor bilan qanday gaplashaman?",
    "Xaridor bot sahifasidan yozganda xabar “Xabarlar” bo‘limida chiqadi. Buyurtma bergan xaridorga o‘zingiz ham “Buyurtmalar” sahifasidagi tugma orqali yozishingiz mumkin.",
  ],
  [
    "Pulni qanday yechaman?",
    "To‘langan obuna daromadi 24 soat ushlab turilgach yechish uchun ochiladi. BotHub sotuv narxidan 5% komissiya ushlab qoladi; yechish so‘rovidan yana 5% olinadi. To‘lovni administrator qo‘lda amalga oshiradi.",
  ],
  [
    "Daromad qachon hisoblanadi?",
    "Daromad to‘lov tasdiqlangach hisoblanadi va qaytarish so‘rovi muddati o‘tib, 24 soatlik ushlab turish tugagach yechish uchun ochiladi.",
  ],
  [
    "Ko‘rishlar qanday hisoblanadi?",
    "Har bir tashrif buyuruvchi bitta botni bir kunda bir marta hisoblanadi; sahifani qayta yangilash yoki o‘zingizning botingizni ochish hisobga olinmaydi.",
  ],
];
