import { NextResponse } from "next/server";
import { readData, withData, PALETTE, newId } from "@/lib/store";

export async function GET(req, { params }) {
  const { id } = await params;
  const data = await readData();
  const project = data.projects.find((p) => p.id === id);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }
  const scenes = data.scenes
    .filter((s) => s.projectId === id)
    .sort((a, b) => a.order - b.order);
  return NextResponse.json({ project, scenes });
}

// body can contain: { name }, { addDay: label }, { renameDay: {dayId, label} },
// { recolorDay: {dayId, color} }, { removeDay: dayId }
export async function PATCH(req, { params }) {
  const { id } = await params;
  const body = await req.json();
  let notFound = false;
  let error = null;
  let result;

  await withData((data) => {
    const project = data.projects.find((p) => p.id === id);
    if (!project) {
      notFound = true;
      return data;
    }

    if (typeof body.name === "string" && body.name.trim()) {
      project.name = body.name.trim();
    }

    if (typeof body.addDay === "string" && body.addDay.trim()) {
      const color = PALETTE[project.days.length % PALETTE.length];
      project.days.push({ id: newId(), label: body.addDay.trim(), color });
    }

    if (body.renameDay && body.renameDay.dayId) {
      const day = project.days.find((d) => d.id === body.renameDay.dayId);
      if (day && body.renameDay.label.trim()) day.label = body.renameDay.label.trim();
    }

    if (body.recolorDay && body.recolorDay.dayId) {
      const day = project.days.find((d) => d.id === body.recolorDay.dayId);
      if (day) day.color = body.recolorDay.color;
    }

    if (Array.isArray(body.columnOrder) && body.columnOrder.every((k) => typeof k === "string")) {
      project.columnOrder = body.columnOrder;
    }

    if (typeof body.autoNumber === "boolean") {
      project.autoNumber = body.autoNumber;
    }

    const VALID_COLUMN_TYPES = ["image", "text", "dropdown"];
    if (body.addColumn && typeof body.addColumn.label === "string" && body.addColumn.label.trim() && VALID_COLUMN_TYPES.includes(body.addColumn.type)) {
      const key = `c_${newId()}`;
      const col = { key, label: body.addColumn.label.trim(), type: body.addColumn.type };
      if (body.addColumn.type === "dropdown" && Array.isArray(body.addColumn.options)) {
        col.options = body.addColumn.options.map((o) => String(o).trim()).filter(Boolean);
      }
      project.customColumns = [...(project.customColumns || []), col];
      project.columnOrder = [...(project.columnOrder || []), key];
    }

    if (body.removeColumn && typeof body.removeColumn.key === "string") {
      project.customColumns = (project.customColumns || []).filter((c) => c.key !== body.removeColumn.key);
      project.columnOrder = (project.columnOrder || []).filter((k) => k !== body.removeColumn.key);
    }

    if (body.removeDay) {
      const hasScenes = data.scenes.some(
        (s) => s.projectId === id && s.dayId === body.removeDay
      );
      if (hasScenes) {
        error = "Move or delete that day's scenes before removing it.";
      } else {
        project.days = project.days.filter((d) => d.id !== body.removeDay);
      }
    }

    // body.reorderDay: { dayId, orderedIds } — drag-and-drop reorder, possibly
    // moving a scene into a different day. orderedIds is the full, final list
    // of scene ids for that day in display order.
    if (!error && body.reorderDay && body.reorderDay.dayId && Array.isArray(body.reorderDay.orderedIds)) {
      const { dayId, orderedIds } = body.reorderDay;
      orderedIds.forEach((sceneId, index) => {
        const scene = data.scenes.find((s) => s.id === sceneId && s.projectId === id);
        if (scene) {
          scene.dayId = dayId;
          scene.order = index;
        }
      });
    }

    result = project;
    return data;
  });

  if (notFound) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }
  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }
  return NextResponse.json({ project: result });
}

export async function DELETE(req, { params }) {
  const { id } = await params;
  await withData((data) => {
    data.projects = data.projects.filter((p) => p.id !== id);
    data.scenes = data.scenes.filter((s) => s.projectId !== id);
    return data;
  });
  return NextResponse.json({ ok: true });
}
