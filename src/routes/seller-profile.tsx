import { createFileRoute } from '@tanstack/react-router';
import { SellerProfile } from '@/components/seller-pages';
export const Route = createFileRoute('/seller-profile')({
  head: () => ({ meta: [
    { title: 'Sotuvchi profili — BotSmith' },
    { name: 'description', content: 'Sotuvchi profil ma’lumotlari.' },
    { property: 'og:title', content: 'Sotuvchi profili — BotSmith' },
    { property: 'og:description', content: 'Sotuvchi profil ma’lumotlari.' },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:card', content: 'summary_large_image' },
  ] }),
  component: SellerProfile,
});
