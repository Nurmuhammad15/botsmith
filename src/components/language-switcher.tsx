import { Check, ChevronDown, Globe } from "lucide-react";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useT, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const LANGUAGES: { code: Lang; short: string; name: string }[] = [
  { code: "uz", short: "UZ", name: "O‘zbekcha" },
  { code: "ru", short: "RU", name: "Русский" },
  { code: "en", short: "EN", name: "English" },
];

/** Language picker used in every header (site, seller panel, sign-in pages). */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { lang, setLang } = useT();
  const [open, setOpen] = useState(false);
  const current = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0]!;

  return (
    <div data-no-translate className={className}>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Language"
            className="inline-flex h-9 items-center gap-1 rounded-md px-1.5 sm:gap-1.5 sm:px-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Globe className="h-4 w-4 text-muted-foreground" />
            {current.short}
            <ChevronDown
              className={cn(
                "hidden h-3.5 w-3.5 sm:block text-muted-foreground transition-transform",
                open && "rotate-180",
              )}
            />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44 p-1">
          {LANGUAGES.map((item) => (
            <DropdownMenuItem
              key={item.code}
              onSelect={() => setLang(item.code)}
              className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 text-sm"
            >
              <span className="flex items-center gap-3">
                <span className="w-6 text-xs font-semibold text-muted-foreground">
                  {item.short}
                </span>
                {item.name}
              </span>
              {item.code === lang && <Check className="h-4 w-4 text-primary" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
