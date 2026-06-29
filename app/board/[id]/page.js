import { readData } from "@/lib/store";
import { notFound } from "next/navigation";
import ShotBoard from "@/components/ShotBoard";

export const dynamic = "force-dynamic";

export default async function BoardPage({ params }) {
  const { id } = await params;
  const data = await readData();
  const project = data.projects.find((p) => p.id === id);
  if (!project) notFound();
  const scenes = data.scenes
    .filter((s) => s.projectId === id)
    .sort((a, b) => a.order - b.order);
  return <ShotBoard initialProject={project} initialScenes={scenes} />;
}
