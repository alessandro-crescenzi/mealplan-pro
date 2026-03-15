"use client";

import { HeaderActions } from "@/components/HeaderContext";
import UserMenu from "@/components/UserMenu";

export default function AppHeaderControls() {
  return (
    <div className="flex items-center gap-4">
      <HeaderActions />
      <UserMenu />
    </div>
  );
}
