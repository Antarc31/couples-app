import { redirect } from "next/navigation";
import { getCurrentCoupleData } from "@/lib/current-couple";
import Card from "@/components/ui/Card";
import SignOutButton from "@/components/auth/SignOutButton";
import DeleteAccountButton from "@/components/auth/DeleteAccountButton";
import LeaveCoupleButton from "@/components/auth/LeaveCoupleButton";
import ProfileEditForm from "@/components/profilo/ProfileEditForm";
import CoupleFeatureToggles from "@/components/profilo/CoupleFeatureToggles";

export default async function ProfiloPage() {
  const data = await getCurrentCoupleData();
  if (!data) redirect("/login");

  return (
    <div className="flex flex-1 flex-col gap-4 px-4 pt-5">
      <h1 className="text-xl font-extrabold text-ink">Profilo</h1>

      <Card className="flex items-center gap-4">
        <span
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-xl font-extrabold text-white"
          style={{ backgroundColor: data.color }}
        >
          {(data.displayName ?? data.email)?.slice(0, 1).toUpperCase()}
        </span>
        <div>
          <p className="text-base font-bold text-ink">{data.displayName ?? "Senza nome"}</p>
          <p className="text-sm text-ink-soft">{data.email}</p>
        </div>
      </Card>

      {data.partner && (
        <Card className="flex items-center gap-4">
          <span
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-xl font-extrabold text-white"
            style={{ backgroundColor: data.partner.color }}
          >
            {(data.partner.displayName ?? "P").slice(0, 1).toUpperCase()}
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Il tuo partner</p>
            <p className="text-base font-bold text-ink">{data.partner.displayName ?? "Senza nome"}</p>
          </div>
        </Card>
      )}

      <ProfileEditForm
        birthDate={data.birthDate}
        isPaired={data.partner !== null}
        relationshipStartDate={data.couple?.relationshipStartDate ?? null}
      />

      {data.partner && data.couple && (
        <CoupleFeatureToggles
          quizEnabled={data.couple.quizEnabled}
          moodCheckinEnabled={data.couple.moodCheckinEnabled}
        />
      )}

      <SignOutButton />

      <div className="mt-2 flex flex-col gap-2 border-t border-border pt-4">
        <a href="/privacy" className="text-center text-sm text-ink-soft underline">
          Privacy policy
        </a>
        {data.partner && <LeaveCoupleButton />}
        <DeleteAccountButton />
      </div>
    </div>
  );
}
