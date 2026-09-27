import type { Metadata } from "next";
import Birthday from "@/components/Birthday";

export const metadata: Metadata = { title: "Happy Birthday, Dad", robots: { index: false, follow: false } };

export default function BirthdayPage() {
  return <Birthday />;
}
