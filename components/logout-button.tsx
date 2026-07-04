"use client";

import { signOut } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();

  const logout = async () => {
    await signOut();
    router.refresh();
    router.push("/");
  };

  return <Button onClick={logout}>Logout</Button>;
}
