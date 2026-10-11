// Help-centre content, shared by the public, buyer and seller help pages.
export type Faq = readonly [question: string, answer: string];

export const buyerFaqs: Faq[] = [
  [
    "Botni qanday xarid qilaman?",
    "Katalogdan botni tanlang va “Xarid qilish” tugmasini bosing. Buyurtma yaratiladi va “Buyurtmalar” sahifasida holati bilan ko‘rinadi.",
  ],
  [
    "To‘lov qanday amalga oshiriladi?",
    "Buyurtmadagi to‘lov tugmasi orqali (Payme yoki Click, ulangan bo‘lsa). To‘lov tasdiqlangach buyurtma faollashadi. Agar onlayn to‘lov mavjud bo‘lmasa, yordam chatiga yozing — to‘lovni administrator qo‘lda tasdiqlaydi.",
  ],
  [
    "Botni qachon olaman?",
    "To‘lovdan keyin sotuvchi botni bot sahifasida ko‘rsatilgan muddatda yetkazadi. Holatni “Buyurtmalar”da kuzating. Sotuvchi fayl biriktirgan bo‘lsa, yetkazib berish boshlangach ularni shu yerdan yuklab olasiz.",
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
    "Narxlar faqat tizimga kirgan foydalanuvchilarga ko‘rsatiladi. Kirish yoki ro‘yxatdan o‘tish orqali ko‘ring.",
  ],
  [
    "Muammo yuzaga kelsa nima qilaman?",
    "Avval sotuvchiga yozing. Kelisha olmasangiz, yordam chatiga murojaat qiling — platformada 30 kunlik kafolat e’lon qilingan.",
  ],
];

export const sellerFaqs: Faq[] = [
  [
    "Botni qanday joylayman?",
    "Mening botlarim sahifasidagi “Yangi bot qo‘shish” orqali nom, kategoriya, narx, tavsif, rasmlar va (ixtiyoriy) fayllarni kiriting. Administrator tekshirgach bot katalogda e’lon qilinadi.",
  ],
  [
    "Rasm va fayllarni qanday boshqaraman?",
    "Mening botlarim sahifasida botni tanlab, rasm (JPG, PNG yoki WebP, 5 MB gacha, 5 tagacha) va fayllar (50 MB gacha, 10 tagacha) qo‘shing yoki o‘chiring. Fayllarni xaridor siz “Yetkazishni boshlash”ni bosgandan keyingina yuklab oladi (shundan keyin to‘lov qaytarib bo‘lmaydi). E’lon qilingan botga yangi rasm qo‘shsangiz, u qayta tekshiruvga yuboriladi.",
  ],
  [
    "Buyurtmalarni qayerda ko‘raman?",
    "Buyurtmalar sahifasida bot nomi, summa va holat ko‘rinadi. To‘langan buyurtmani yetkazishni boshlab, tayyor bo‘lgach yakunlang.",
  ],
  [
    "Xaridor bilan qanday gaplashaman?",
    "Xaridor bot sahifasidan yozganda xabar “Xabarlar” bo‘limida chiqadi. Buyurtma bergan xaridorga o‘zingiz ham “Buyurtmalar” sahifasidagi tugma orqali yozishingiz mumkin.",
  ],
  [
    "Pulni qanday yechaman?",
    "Eng kamida 100 000 so‘m so‘rash mumkin, hisobda kamida 500 000 so‘m qoladi. 3% komissiya ushlanadi, qolgani kartangizga qo‘lda o‘tkaziladi; holatini yechish tarixida ko‘rasiz.",
  ],
  ["Daromad qachon hisoblanadi?", "Faqat to‘lovi tasdiqlangan buyurtmalar daromadga qo‘shiladi."],
  [
    "Ko‘rishlar qanday hisoblanadi?",
    "Har bir tashrif buyuruvchi bitta botni bir kunda bir marta hisoblanadi; sahifani qayta yangilash yoki o‘zingizning botingizni ochish hisobga olinmaydi.",
  ],
];
