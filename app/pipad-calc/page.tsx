import { redirect } from "next/navigation";

export default function LegacyCalcRedirectPage() {
  redirect("/weight-calc");
}
