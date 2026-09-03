import ResetPasswordForm from "@/components/auth/ResetPasswordForm";

export default function ResetPasswordPage() {
  return (
    <div className="flex flex-col items-center gap-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-couple-soft text-3xl">
          🔑
        </span>
        <h1 className="text-2xl font-extrabold text-ink">Nuova password</h1>
      </div>
      <ResetPasswordForm />
    </div>
  );
}
