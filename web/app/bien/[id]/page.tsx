import { redirect } from "next/navigation";

// ancienne fiche /bien : la fiche unique est /vente/[id]
export default async function PageBien({ params }: PageProps<"/bien/[id]">) {
  const { id } = await params;
  redirect(`/vente/${encodeURIComponent(id)}`);
}
