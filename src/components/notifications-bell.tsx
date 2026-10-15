import { useState } from "react";
import { Megaphone } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useMarkNotificationsRead, useNotifications } from "@/lib/api-notifications";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Messages the site (admin) sent to the signed-in user, with a badge for unread ones. */
export function NotificationsBell({ className }: { className?: string }) {
  const { data: items = [] } = useNotifications(true);
  const markRead = useMarkNotificationsRead();
  const [open, setOpen] = useState(false);
  const unread = items.filter((item) => !item.read).length;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Keep the "new" marks visible while the list is open; clear them when it closes.
        if (!next && unread > 0) markRead.mutate();
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Sayt xabarlari"
          title="Sayt xabarlari"
          className={cn(
            "relative grid h-9 w-9 place-items-center rounded-md text-muted-foreground hover:bg-muted",
            className,
          )}
        >
          <Megaphone className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] p-0">
        <p className="border-b px-4 py-3 text-sm font-semibold">BotHub xabarlari</p>
        {items.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">Xabarlar yo‘q.</p>
        ) : (
          <ul className="max-h-96 divide-y overflow-y-auto">
            {items.map((item) => (
              <li
                key={item.id}
                className={cn("px-4 py-3 text-sm", !item.read && "bg-primary-soft")}
              >
                <p className="font-medium">
                  {!item.read && (
                    <span className="mr-2 inline-block h-2 w-2 rounded-full bg-primary align-middle" />
                  )}
                  {item.title}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{item.body}</p>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(item.createdAt)}
                  </span>
                  {item.link && (
                    <a href={item.link} className="text-xs font-medium text-primary underline">
                      Ochish
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
