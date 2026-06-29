import { readData } from "@/lib/store";
import ProjectList from "@/components/ProjectList";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const data = await readData();
  const projects = data.projects.map((p) => ({
    ...p,
    sceneCount: data.scenes.filter((s) => s.projectId === p.id).length,
  }));
  return <ProjectList initialProjects={projects} />;
}
