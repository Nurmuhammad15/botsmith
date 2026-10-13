import { LanguageSwitcher } from "@/components/language-switcher";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ShoppingBag, Code2, Eye, EyeOff } from "lucide-react";
import { Logo } from "@/components/site";
import { cn } from "@/lib/utils";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Ro'yxatdan o'tish — BotHub" },
      {
        name: "description",
        content: "Xaridor yoki dasturchi sifatida BotHub'da ro'yxatdan o'ting.",
      },
      { property: "og:title", content: "Ro'yxatdan o'tish — BotHub" },
      { property: "og:description", content: "Xaridor yoki dasturchi sifatida ro'yxatdan o'ting." },
    ],
  }),
  component: Register,
});

const field =
  "mt-1 h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:border-primary";

function Register() {
  const supabaseConfigured = isSupabaseConfigured();
  const [role, setRole] = useState<"buyer" | "seller">("buyer");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = Route.useNavigate();
  const opts = [
    ["buyer", "Xaridor", "Botlarni xarid qilish uchun", ShoppingBag],
    ["seller", "Dasturchi", "Botlarni sotish uchun", Code2],
  ] as const;
  return (
    <div className="relative grid min-h-screen place-items-center bg-muted px-4">
      <LanguageSwitcher className="absolute right-4 top-4" />
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const formData = new FormData(form);
          const password = formData.get("password");
          const confirmPassword = form.elements.namedItem("confirmPassword");
          if (typeof password !== "string" || !(confirmPassword instanceof HTMLInputElement)) {
            throw new Error("Ro'yxatdan o'tish formasidagi ma'lumotlar noto'g'ri.");
          }
          if (password !== confirmPassword.value) {
            confirmPassword.setCustomValidity("Parollar mos kelmadi.");
            confirmPassword.reportValidity();
            return;
          }

          setIsSubmitting(true);
          setMessage("");
          try {
            if (!supabaseConfigured) {
              throw new Error("Server sozlanmagan. Administratorga murojaat qiling.");
            }

            const { data, error } = await getSupabaseClient().auth.signUp({
              email: String(formData.get("email")),
              password,
              options: {
                emailRedirectTo: `${window.location.origin}/login`,
                data: {
                  full_name: String(formData.get("name")),
                  phone: String(formData.get("phone")),
                  role,
                },
              },
            });
            if (error) throw error;

            if (data.session) {
              await navigate({ to: role === "seller" ? "/seller" : "/bots" });
              return;
            }

            setMessage(
              "Hisob yaratish so‘rovi qabul qilindi. Emailingizga yuborilgan tasdiqlash havolasini bosing, so‘ng tizimga kiring. Xat kelmasa, spam papkasini tekshiring.",
            );
            form.reset();
          } catch (error) {
            setMessage(
              error instanceof Error ? error.message : "Ro'yxatdan o'tishda xatolik yuz berdi.",
            );
          } finally {
            setIsSubmitting(false);
          }
        }}
        onInput={(e) => {
          const form = e.currentTarget;
          const confirmPassword = form.elements.namedItem("confirmPassword");
          if (confirmPassword instanceof HTMLInputElement) {
            confirmPassword.setCustomValidity("");
          }
          setMessage("");
        }}
        className="card-soft w-full max-w-sm p-8"
      >
        <Logo className="justify-center" />
        <h1 className="mt-6 text-center text-xl font-bold">Ro'yxatdan o'tish</h1>
        <p className="text-center text-sm text-muted-foreground">O'zingizning rolingizni tanlang</p>
        {!supabaseConfigured && (
          <p
            role="alert"
            className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
          >
            Server sozlanmagan, ro'yxatdan o'tish hozircha mumkin emas.
          </p>
        )}
        <div className="mt-6 space-y-3">
          {opts.map(([v, title, sub, Icon]) => (
            <button
              type="button"
              key={v}
              onClick={() => setRole(v)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border p-4 text-left",
                role === v && "border-primary bg-primary-soft",
              )}
            >
              <span className="grid h-9 w-9 place-items-center rounded-full bg-background text-primary">
                <Icon className="h-4 w-4" />
              </span>
              <span className="flex-1">
                <span className="block text-sm font-semibold">{title}</span>
                <span className="text-xs text-muted-foreground">{sub}</span>
              </span>
              <span
                className={cn(
                  "h-4 w-4 rounded-full border-2",
                  role === v ? "border-primary bg-primary" : "border-border",
                )}
              />
            </button>
          ))}
        </div>
        <label className="mt-5 block text-sm">
          Ism
          <input
            name="name"
            type="text"
            autoComplete="name"
            required
            minLength={2}
            placeholder="Ismingiz"
            className={field}
          />
        </label>
        <label className="mt-4 block text-sm">
          Telefon raqami
          <input
            name="phone"
            type="tel"
            autoComplete="tel"
            required
            placeholder="+998 90 123 45 67"
            className={field}
          />
        </label>
        <label className="mt-4 block text-sm">
          Email
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="example@gmail.com"
            className={field}
          />
        </label>
        <label className="mt-4 block text-sm">
          Parol
          <span className="relative block">
            <input
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              minLength={8}
              placeholder="Kamida 8 ta belgi"
              className={`${field} pr-11`}
            />
            <button
              type="button"
              aria-label={showPassword ? "Parolni yashirish" : "Parolni ko'rsatish"}
              aria-pressed={showPassword}
              onClick={() => setShowPassword((visible) => !visible)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </span>
        </label>
        <label className="mt-4 block text-sm">
          Parolni tasdiqlang
          <span className="relative block">
            <input
              name="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              minLength={8}
              placeholder="Parolni qayta kiriting"
              className={`${field} pr-11`}
            />
            <button
              type="button"
              aria-label={
                showConfirmPassword
                  ? "Tasdiqlash parolini yashirish"
                  : "Tasdiqlash parolini ko'rsatish"
              }
              aria-pressed={showConfirmPassword}
              onClick={() => setShowConfirmPassword((visible) => !visible)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            >
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </span>
        </label>
        {message && (
          <p role="status" className="mt-4 text-sm text-muted-foreground">
            {message}
          </p>
        )}
        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-6 h-11 w-full rounded-lg bg-primary text-sm font-semibold text-primary-foreground"
        >
          {isSubmitting ? "Yuborilmoqda..." : "Ro'yxatdan o'tish"}
        </button>
        <p className="mt-8 text-center text-sm text-muted-foreground">
          Hisobingiz bormi?{" "}
          <Link to="/login" className="text-primary">
            Kirish
          </Link>
        </p>
      </form>
    </div>
  );
}
