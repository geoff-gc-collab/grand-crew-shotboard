import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const DATA_PATH = path.join(process.cwd(), "data", "data.json");

export const PALETTE = [
  "#5A8AC0", // blue
  "#DD8A4D", // orange
  "#6FAE8C", // green
  "#9B7FC7", // purple
  "#D9714E", // red
  "#4FB3B0", // teal
];

let writeLock = Promise.resolve();

function slugify(name) {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "project"
  );
}

function defaultData() {
  const projectId = "42nd-strt";
  return {
    projects: [
      {
        id: projectId,
        name: "42nd Strt",
        createdAt: new Date().toISOString(),
        days: [
          { id: "day1", label: "Day 1 — Miles Alone", color: PALETTE[0] },
          { id: "day2", label: "Day 2 — Miles + Yonna Together", color: PALETTE[1] },
        ],
      },
    ],
    scenes: [
      mkScene(projectId, "day1", 0, "1", "Bridge / Train Exterior Establishing", "Rockaway Beach / A Train over Jamaica Bay", "Wide / Drone", "", "", "", "Plate for VFX water extension — no talent needed", "Wide/drone shot of the train crossing the bridge over Jamaica Bay, open water on both sides, city skyline visible far off."),
      mkScene(projectId, "day1", 1, "2", "A Train Interior, Miles Alone", "A Train over Jamaica Bay", "Int", "Miles", "", "TBD", "Core performance scene", "Miles seated on the orange subway seats, water visible through the windows, singing the lyrics while the world outside drifts past in slow motion."),
      mkScene(projectId, "day1", 2, "3", "Bobblehead on Windowsill", "A Train over Jamaica Bay", "Insert", "Miles", "", "", "Same setup as Scene 2 — grab together", "Jalen Brunson bobblehead sitting on the train windowsill beside Miles, his quiet companion."),
      mkScene(projectId, "day1", 3, "5", "Underground Transition", "Subway / Underground", "Walking", "Miles", "", "TBD", "Visual bridge from Rockaway to Midtown", "Miles moving from the train into the underground system — tunnels, stairs/escalators, switching platforms, pushing deeper into the city."),
      mkScene(projectId, "day1", 4, "8", "Subway Platform, Miles Alone", "Subway Platform", "Wide", "Miles", "", "TBD", "Sells isolation inside transit infrastructure", "Wide shot of Miles alone on a platform, a train blurring past, stairs or signage in frame."),
      mkScene(projectId, "day1", 5, "9", "42nd Street Exterior, Wide", "42nd Street", "Wide", "Miles", "Crowd extras", "TBD", "Endpoint of the solo journey", "Miles moving through a packed 42nd Street crowd, the street sign overhead, the world overwhelming and slow around him, nobody noticing him."),
      mkScene(projectId, "day1", 6, "12", "42nd Street Signage Grabs", "42nd Street (various)", "B-roll", "", "", "", "No talent needed — flexible / 2nd unit", "Standalone shots of actual 42nd St signage around the city, used as graphic cutaways and transition points between timelines."),
      mkScene(projectId, "day1", 7, "13", "Dense Crowd Immersion Plates", "42nd Street / Times Square", "B-roll / VFX plate", "", "Background crowd", "", "No talent needed — flexible / 2nd unit", "Handheld or elevated crowd footage shot to feed VFX, used to thicken and extend the crowd until it feels mythological."),

      mkScene(projectId, "day2", 0, "10", '"Lean On" — MJ Lean', "Times Square Subway Station", "Med / Wide", "Miles, Yonna, Busker", "", "TBD", "Needs busker talent", "Miles & Yonna walk through the Times Square subway station, passing a busker performing. Miles breaks into the MJ lean on the lyric, Yonna reacts, fully caught off guard."),
      mkScene(projectId, "day2", 1, "11", "Times Square Exterior, Joyful", "Times Square", "Wide", "Miles, Yonna", "Background extras", "TBD", "Needs background extras", "The two of them in Times Square at night, lights and energy around them, laughing, dancing, fully present."),
      mkScene(projectId, "day2", 2, "—", "Miles-in-Distance Cameo", "Times Square", "Pickup", "Miles", "", "", "Quick pickup while crew is already set up — not its own block", "Miles appears in the background/distance of the Times Square footage — a ghost of the alone timeline bleeding into the together timeline's location."),
      mkScene(projectId, "day2", 3, "6", "Subway Car — \"Bump 'n Grind\" + Headphones", "Subway Car", "Int", "Miles, Yonna, Background Woman", "Background talent", "TBD", "Needs background talent for the meme recreation", "A woman in the background recreates the viral bump-and-grind train meme. Miles and Yonna catch it, share a look, then share a single pair of headphones, one earbud each."),
      mkScene(projectId, "day2", 4, "7", "F Train Interior, Orange Seats", "F Train", "Handheld", "Miles, Yonna", "", "", "Run-and-gun joyful energy", "Handheld, hopping on the train laughing, moving toward the beach, orange seats visible."),
      mkScene(projectId, "day2", 5, "4", "Beach — Ending Moment", "Rockaway Beach", "Wide", "Miles, Yonna", "", "", "Final scene — schedule for matching golden hour with Scene 1", "Miles and Yonna seated together on the sand, water behind them, the wistful Graduate-style final shot."),
    ],
  };
}

function mkScene(projectId, dayId, order, num, title, location, shotType, talent, extras, wardrobe, notes, desc) {
  return {
    id: randomUUID(),
    projectId,
    dayId,
    order,
    num,
    title,
    location,
    shotType,
    talent,
    extras,
    wardrobe,
    notes,
    desc,
    photo: "",
    ref: "",
    images: [],
    colorTag: null,
  };
}

function migrate(data) {
  data.scenes.forEach((s) => {
    if (!Array.isArray(s.images)) s.images = [];
    if (s.colorTag === undefined) s.colorTag = null;
  });
  return data;
}

export async function readData() {
  try {
    const raw = await fs.readFile(DATA_PATH, "utf-8");
    return migrate(JSON.parse(raw));
  } catch (err) {
    const data = defaultData();
    await writeData(data);
    return data;
  }
}

export async function writeData(data) {
  writeLock = writeLock.then(async () => {
    await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
    await fs.writeFile(DATA_PATH, JSON.stringify(data, null, 2));
  });
  await writeLock;
  return data;
}

export function newProjectId(name, existing) {
  const base = slugify(name);
  let id = base;
  let i = 2;
  while (existing.some((p) => p.id === id)) {
    id = `${base}-${i}`;
    i += 1;
  }
  return id;
}

export function newId() {
  return randomUUID();
}
