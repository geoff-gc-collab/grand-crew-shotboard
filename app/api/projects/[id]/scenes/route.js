import { NextResponse } from "next/server";
import { withData, newId } from "@/lib/store";

const BLANK_SCENE = {
  num: "—",
  title: "",
  location: "",
  shotType: "",
  talent: "",
  extras: "",
  wardrobe: "",
  notes: "",
  desc: "",
  photo: "",
  ref: "",
  images: [],
  colorTag: null,
  intExt: "",
  dayNight: "",
  dayNightIntExt: "",
  timing: "",
  customFields: {},
};

export async function POST(req, { params }) {
  const { id } = await params;
  const body = await req.json();
  const dayId = body.dayId;
  if (!dayId) {
    return NextResponse.json({ error: "dayId is required." }, { status: 400 });
  }

  let error = null;
  let scene;

  await withData((data) => {
    const project = data.projects.find((p) => p.id === id);
    if (!project || !project.days.some((d) => d.id === dayId)) {
      error = "Day not found on project.";
      return data;
    }
    const siblings = data.scenes.filter(
      (s) => s.projectId === id && s.dayId === dayId
    );
    const order = siblings.length ? Math.max(...siblings.map((s) => s.order)) + 1 : 0;

    if (body.restore) {
      // Recreate a previously-deleted scene (used by client-side undo).
      scene = { ...body.restore, projectId: id, dayId, order };
    } else {
      scene = {
        id: newId(),
        projectId: id,
        dayId,
        order,
        ...BLANK_SCENE,
      };
    }
    data.scenes.push(scene);
    return data;
  });

  if (error) {
    return NextResponse.json({ error }, { status: 404 });
  }
  return NextResponse.json({ scene });
}
