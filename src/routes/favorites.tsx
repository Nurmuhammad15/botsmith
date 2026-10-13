import { createFileRoute, Link } from "@tanstack/react-router";
import { BotCard, DashboardLayout } from "@/components/site";
import { useFavoriteBots } from "@/lib/api";
import { useMarketplaceAccount } from "@/lib/marketplace-auth-context";
import { navForAccount } from "@/lib/nav";

export const Route = createFileRoute("/favorites")({
  head: () => ({
    meta: [
      { title: "Sevimlilar — BotSmith" },
      { name: "description", content: "Siz saqlab qo‘ygan Telegram botlar." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Favorites,
});

function Favorites() {
  const { items, role } = navForAccount(useMarketplaceAccount());
  return (
    <DashboardLayout user="" role={role} items={items}>
      <FavoritesContent />
    </DashboardLayout>
  );
}

function FavoritesContent() {
  const account = useMarketplaceAccount();
  const { data: bots = [], isPending, isError } = useFavoriteBots(account?.id);

  return (
    <>
      <h1 className="text-xl font-bold">Sevimlilar</h1>
      {isPending ? (
        <p className="mt-4 text-sm text-muted-foreground">Yuklanmoqda…</p>
      ) : isError ? (
        <p role="alert" className="mt-4 text-sm text-destructive">
          Sevimlilarni yuklab bo‘lmadi. Sahifani yangilang.
        </p>
      ) : bots.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Hozircha sevimli botlar yo‘q. Bot kartasidagi yurak belgisini bosib saqlang.{" "}
          <Link to="/bots" className="font-medium text-primary">
            Botlarni ko‘rish
          </Link>
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
          {bots.map((bot) => (
            <BotCard key={bot.id} bot={bot} />
          ))}
        </div>
      )}
    </>
  );
}
