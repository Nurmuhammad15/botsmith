import { createFileRoute } from '@tanstack/react-router';
import { SellerHelp } from '@/components/seller-pages';
export const Route = createFileRoute('/help')({
  head: () => ({ meta: [
    { title: 'Yordam — BotSmith' },
    { name: 'description', content: 'Bot sotish, buyurtmalar va pul yechish bo‘yicha savollar.' },
    { property: 'og:title', content: 'Yordam — BotSmith' },
    { property: 'og:description', content: 'Bot sotish, buyurtmalar va pul yechish bo‘yicha savollar.' },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:card', content: 'summary_large_image' },
  ] }),
  component: SellerHelp,
});
