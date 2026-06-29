import { NextResponse } from "next/server";
import { readData, writeData, newProjectId, PALETTE } from "@/lib/store";

export async function GET() {
  const data = await readData();
  const projects = data.projects.map((p) => ({
    ...p,
    sceneCount: data.scenes.filter((s) => s.projectId === p.id).length,
  }));
  return NextResponse.json({ projects });
}

export async function POST(req) {
  const body = await req.json();
  const name = (body.name || "").trim();
  if (!name) {
    return NextResponse.json({ error: "Project name is required." }, { status: 400 });
  }
  const data = await readData();
  const id = newProjectId(name, data.projects);
  const project = {
    id,
    name,
    createdAt: new Date().toISOString(),
    days: [{ id: "day1", label: "Day 1", color: PALETTE[0] }],
  };
  data.projects.push(project);
  await writeData(data);
  return NextResponse.json({ project });
}
