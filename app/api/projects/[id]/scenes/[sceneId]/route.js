import { NextResponse } from "next/server";
import { withData } from "@/lib/store";

const EDITABLE_FIELDS = [
  "num", "title", "location", "shotType", "talent",
  "extras", "wardrobe", "notes", "desc", "photo", "ref",
  "intExt", "dayNight", "dayNightIntExt", "timing",
];

// body: { field-updates... } and/or { moveDir: -1 | 1 } and/or { dayId: 'newDay' }
export async function PATCH(req, { params }) {
  const { id, sceneId } = await params;
  const body = await req.json();
  let notFound = false;
  let result;

  await withData((data) => {
    const scene = data.scenes.find((s) => s.id === sceneId && s.projectId === id);
    if (!scene) {
      notFound = true;
      return data;
    }

    EDITABLE_FIELDS.forEach((f) => {
      if (typeof body[f] === "string") scene[f] = body[f];
    });

    if (Array.isArray(body.images)) {
      scene.images = body.images.filter((img) => img && typeof img.url === "string");
    }

    if (body.colorTag === null) {
      scene.colorTag = null;
    } else if (body.colorTag && typeof body.colorTag.color === "string") {
      scene.colorTag = {
        label: typeof body.colorTag.label === "string" ? body.colorTag.label : "",
        color: body.colorTag.color,
      };
    }

    if (body.customFields && typeof body.customFields === "object") {
      scene.customFields = { ...(scene.customFields || {}), ...body.customFields };
    }

    if (body.dayId && body.dayId !== scene.dayId) {
      const siblings = data.scenes.filter(
        (s) => s.projectId === id && s.dayId === body.dayId
      );
      scene.order = siblings.length ? Math.max(...siblings.map((s) => s.order)) + 1 : 0;
      scene.dayId = body.dayId;
    }

    if (body.moveDir === -1 || body.moveDir === 1) {
      const siblings = data.scenes
        .filter((s) => s.projectId === id && s.dayId === scene.dayId)
        .sort((a, b) => a.order - b.order);
      const idx = siblings.findIndex((s) => s.id === scene.id);
      const swapIdx = idx + body.moveDir;
      if (swapIdx >= 0 && swapIdx < siblings.length) {
        const a = siblings[idx];
        const b = siblings[swapIdx];
        const tmp = a.order;
        a.order = b.order;
        b.order = tmp;
      }
    }

    result = scene;
    return data;
  });

  if (notFound) {
    return NextResponse.json({ error: "Scene not found." }, { status: 404 });
  }
  return NextResponse.json({ scene: result });
}

export async function DELETE(req, { params }) {
  const { id, sceneId } = await params;
  let notFound = false;

  await withData((data) => {
    const before = data.scenes.length;
    data.scenes = data.scenes.filter((s) => !(s.id === sceneId && s.projectId === id));
    if (data.scenes.length === before) notFound = true;
    return data;
  });

  if (notFound) {
    return NextResponse.json({ error: "Scene not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
