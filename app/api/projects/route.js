import { NextResponse } from "next/server";
import { readData, withData, newProjectId, PALETTE } from "@/lib/store";
import { DEFAULT_COLUMN_ORDER } from "@/lib/columns";

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

  let project;
  await withData((data) => {
    const id = newProjectId(name, data.projects);
    project = {
      id,
      name,
      createdAt: new Date().toISOString(),
      columnOrder: DEFAULT_COLUMN_ORDER,
      autoNumber: false,
      customColumns: [],
      days: [{ id: "day1", label: "Day 1", color: PALETTE[0] }],
    };
    data.projects.push(project);
    return data;
  });

  return NextResponse.json({ project });
}
