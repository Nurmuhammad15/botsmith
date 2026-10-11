import { createFileRoute } from '@tanstack/react-router';
import { SellerOrders } from '@/components/seller-pages';
export const Route = createFileRoute('/seller-orders')({
  head: () => ({ meta: [
    { title: 'Buyurtmalar — BotSmith' },
    { name: 'description', content: 'Bot sotuvlari va buyurtma holatlarini ko‘ring.' },
    { property: 'og:title', content: 'Buyurtmalar — BotSmith' },
    { property: 'og:description', content: 'Bot sotuvlari va buyurtma holatlarini ko‘ring.' },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:card', content: 'summary_large_image' },
  ] }),
  component: SellerOrders,
});
