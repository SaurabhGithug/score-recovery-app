import { redirect } from "next/navigation";

export default function TestbookPage() {
  redirect("/papers?kind=mock");
}
