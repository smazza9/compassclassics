"use client";

import { HouseProvider } from "@/lib/house";
import { Shell } from "./Shell";
import { useSelfUpdate } from "@/lib/selfUpdate";

export default function ClientApp() {
  useSelfUpdate();
  return (
    <HouseProvider>
      <Shell />
    </HouseProvider>
  );
}
