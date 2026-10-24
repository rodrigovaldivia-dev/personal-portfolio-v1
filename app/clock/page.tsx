import type { Metadata } from "next";
import { ClockTimer } from "@/components/organisms/ClockTimer";

export const metadata: Metadata = {
  title: "Clock | Rodrigo Valdivia",
  description: "A simple focus timer with a repeating audible alarm.",
};

export default function ClockPage() {
  return <ClockTimer />;
}
