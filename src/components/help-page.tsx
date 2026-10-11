import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { FaqList } from "@/components/faq-list";
import { SellerHelp } from "@/components/seller-pages";
import { DashboardLayout, SiteLayout } from "@/components/site";
import { buyerFaqs, sellerFaqs } from "@/lib/faq";
import { useMarketplaceAuth } from "@/lib/marketplace-auth-context";
import { buyerNav } from "@/lib/nav";

function SupportLink() {
  return (
    <p className="mt-6 max-w-3xl text-sm text-muted-foreground">
      Javob topmadingizmi?{" "}
      <Link to="/support-chat" className="font-medium text-primary">
        Yordam chatiga yozing
      </Link>
      .
    </p>
  );
}

function Loading() {
  return (
    <SiteLayout>
      <p className="py-24 text-center text-sm text-muted-foreground">Yuklanmoqda…</p>
    </SiteLayout>
  );
}

function BuyerHelp({ signedIn }: { signedIn: boolean }) {
  const content: ReactNode = (
    <>
      <h1 className="mb-6 text-2xl font-bold">Yordam</h1>
      <FaqList title="Xaridorlar uchun savollar" items={buyerFaqs} />
      {!signedIn && (
        <div className="mt-10">
          <FaqList title="Sotuvchilar uchun savollar" items={sellerFaqs} />
        </div>
      )}
      <SupportLink />
    </>
  );
  if (signedIn) {
    return (
      <DashboardLayout user="" role="Xaridor" items={buyerNav}>
        {content}
      </DashboardLayout>
    );
  }
  return (
    <SiteLayout>
      <div className="mx-auto max-w-7xl px-4 py-10">{content}</div>
    </SiteLayout>
  );
}

/**
 * /help for everyone: sellers get the help centre inside their dashboard, buyers inside the
 * buyer dashboard, and signed-out visitors see it on the public site (no redirect to login).
 */
export function HelpPage() {
  const { account, ready } = useMarketplaceAuth();
  if (!ready) return <Loading />;
  if (account?.isSeller) return <SellerHelp />;
  return <BuyerHelp signedIn={Boolean(account)} />;
}
