import { createFileRoute, Link } from '@tanstack/react-router';
import { Search, CreditCard, Bot } from 'lucide-react';
import { SiteLayout } from '@/components/site';
import { Button } from '@/components/ui/button';
export const Route = createFileRoute('/how-it-works')({
  head: () => ({meta: [{title:'Qanday ishlaydi — BotSmith'},{name:'description',content:'Bot tanlash, buyurtma berish va botni qabul qilish.'},{property:'og:title',content:'Qanday ishlaydi — BotSmith'},{property:'og:description',content:'Bot xarid qilish bosqichlari.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary_large_image'}]}),
  component: HowItWorks,
});
function HowItWorks(){return <SiteLayout><div className="mx-auto max-w-5xl px-4 py-12"><h1 className="text-3xl font-bold">Qanday ishlaydi</h1><div className="mt-9 grid gap-8 sm:grid-cols-3">{[[Search,'Bot tanlang','Katalogdagi botlarni narx, kategoriya va reyting bo‘yicha solishtiring.'],[CreditCard,'Buyurtma bering','Tanlangan botning narxi va yetkazish shartlarini ko‘rib chiqing.'],[Bot,'Botni qabul qiling','Buyurtmalar sahifasida holat va bot ma’lumotlarini kuzating.']].map(([Icon,title,desc],i) => {const I=Icon as typeof Bot;return <section key={i} className="border-t pt-6"><I className="h-7 w-7 text-primary" /><h2 className="mt-5 font-semibold">{i+1}. {String(title)}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{String(desc)}</p></section>})}</div><p className="mt-9 text-sm text-muted-foreground">Hozircha namuna: haqiqiy xaridlar va to‘lovlar ulanmagan.</p><Button asChild className="mt-5"><Link to="/bots">Botlarni ko‘rish</Link></Button></div></SiteLayout>}
