"use client";

import { HouseProvider } from "@/lib/house";
import { Shell } from "./Shell";

export default function ClientApp() {
  return (
    <HouseProvider>
      <Shell />
    </HouseProvider>
  );
}
