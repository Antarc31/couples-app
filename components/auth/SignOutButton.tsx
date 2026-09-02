"use client";

import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-actions";
import Button from "@/components/ui/Button";

export default function SignOutButton() {
  const router = useRouter();
  return (
    <Button
      variant="secondary"
      className="w-full"
      onClick={async () => {
        await signOut();
        router.push("/login");
        router.refresh();
      }}
    >
      Esci
    </Button>
  );
}
