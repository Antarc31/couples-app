import LoginForm from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <div className="flex flex-col items-center gap-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-couple-soft text-3xl">
          💗
        </span>
        <h1 className="text-2xl font-extrabold text-ink">Couples</h1>
        <p className="text-sm text-ink-soft">
          La vostra dashboard di coppia: calendario, pensieri e appuntamenti,
          tutto in un posto solo.
        </p>
      </div>
      <LoginForm />
    </div>
  );
}
