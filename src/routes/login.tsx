import { LanguageSwitcher } from "@/components/language-switcher";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Eye, EyeOff, MessageCircle } from "lucide-react";
import { Logo } from "@/components/site";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Kirish — BotHub" },
      { name: "description", content: "BotHub hisobingizga kiring." },
      { property: "og:title", content: "Kirish — BotHub" },
      { property: "og:description", content: "BotHub hisobingizga kiring." },
    ],
  }),
  component: Login,
});

export const fieldCls =
  "mt-1 h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:border-primary";

function Login() {
  const supabaseConfigured = isSupabaseConfigured();
  const [email, setEmail] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = Route.useNavigate();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage("");

    try {
      const password = new FormData(event.currentTarget).get("password");
      if (typeof password !== "string") {
        throw new Error("Parolni kiriting.");
      }

      if (!supabaseConfigured) {
        throw new Error("Server sozlanmagan. Administratorga murojaat qiling.");
      }

      const { data, error } = await getSupabaseClient().auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        const code = "code" in error ? error.code : "";
        const errorMessage = error.message.toLowerCase();
        if (code === "email_not_confirmed" || errorMessage.includes("email not confirmed")) {
          throw new Error(
            "Avval emailingizga yuborilgan tasdiqlash havolasini bosing, keyin qayta kiring.",
          );
        }
        if (code === "user_banned" || errorMessage.includes("banned")) {
          throw new Error("Akkauntingiz administrator tomonidan bloklangan.");
        }
        if (errorMessage.includes("invalid login credentials")) {
          throw new Error("Email yoki parol noto‘g‘ri. Email tasdiqlanganini ham tekshiring.");
        }
        throw new Error("Kirish amalga oshmadi. Email va parolni tekshirib, qayta urinib ko‘ring.");
      }

      const { data: profile } = await getSupabaseClient()
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .maybeSingle();
      await navigate({
        to: profile?.role === "admin" ? "/admin" : profile?.role === "seller" ? "/seller" : "/bots",
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Kirishda xatolik yuz berdi.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="relative grid min-h-screen place-items-center bg-muted px-4">
      <LanguageSwitcher className="absolute right-4 top-4" />
      <Link
        to="/support-chat"
        aria-label="Yordam chati"
        title="Yordam chati"
        className="fixed bottom-5 right-5 z-40 grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105"
      >
        <MessageCircle className="h-6 w-6" />
      </Link>
      <form onSubmit={handleSubmit} className="card-soft w-full max-w-sm p-8">
        <Logo className="justify-center" />
        <h1 className="mt-6 text-center text-xl font-bold">Kirish</h1>
        <p className="mt-1 text-center font-semibold">Xush kelibsiz!</p>
        <p className="text-center text-sm text-muted-foreground">Hisobingizga kiring</p>
        {!supabaseConfigured && (
          <p
            role="alert"
            className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
          >
            Server sozlanmagan, kirish hozircha mumkin emas.
          </p>
        )}
        <label className="mt-6 block text-sm">
          Email
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="example@gmail.com"
            className={fieldCls}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className="mt-4 block text-sm">
          <span className="flex justify-between">Parol</span>
          <span className="relative block">
            <input
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              placeholder="Parolni kiriting"
              className={`${fieldCls} pr-11`}
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
        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-6 h-11 w-full rounded-lg bg-primary text-sm font-semibold text-primary-foreground"
        >
          {isSubmitting ? "Kirilmoqda..." : "Kirish"}
        </button>
        <button
          type="button"
          onClick={() => setMessage("Parolni tiklash uchun administratorga murojaat qiling.")}
          className="mt-3 text-sm text-primary"
        >
          Parolni unutdingizmi?
        </button>
        {message && (
          <p role="status" className="mt-3 text-sm text-muted-foreground">
            {message}
          </p>
        )}
        <p className="mt-8 text-center text-sm text-muted-foreground">
          Hisobingiz yo'qmi?{" "}
          <Link to="/register" className="text-primary">
            Ro'yxatdan o'tish
          </Link>
        </p>
      </form>
    </div>
  );
}
