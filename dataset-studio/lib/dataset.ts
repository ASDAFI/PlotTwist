export function newBoxId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // getRandomValues also works on local HTTP previews where randomUUID is absent.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export type Box = {
  box_id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  [key: string]: unknown;
};
export type Deception = {
  id: number | string;
  intended_option: string | null;
  deceptive_idea: string;
  bounding_boxes: Box[];
  [key: string]: unknown;
};
export type RecordData = {
  image: {
    path: string;
    width: number;
    height: number;
    [key: string]: unknown;
  };
  problem: string;
  choices: Record<string, string>;
  ordered_deceptions: Deception[];
  answer: {
    option: string | null;
    idea: string;
    bounding_boxes: Box[];
    source: unknown;
    [key: string]: unknown;
  };
  contributor: {
    name: string;
    openreview_id: string | null;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};
export type Item = {
  id?: string;
  version?: number;
  thumbnailUrl?: string;
  originalProblem?: string;
  lastEditor?: { name: string; openreview_id: string } | null;
  key: string;
  data: RecordData;
  imageUrl: string;
  imageFile?: File;
  changed: boolean;
  deleted: boolean;
};
export type ResponseRow = {
  matchStatus?: string;
  parseStatus?: string;
  error?: string | null;
  model: string;
  filename: string;
  line: number;
  raw: Record<string, unknown>;
  text: string;
  matchKey: string | null;
  reasoning: string;
  answer: string | null;
  malformed: boolean;
};
export const sourceUrl =
  "https://www.jagranjosh.com/general-knowledge/brain-teaser-iq-test-spot-who-is-rich-only-top-1-per-cent-observant-answer-correctly-in-5-seconds-1747571299-1";
export const example: RecordData = {
  image: { path: "images/020.jpg", width: 1013, height: 675 },
  source: { url: sourceUrl, authored_date: null },
  popularity: { views: null, comments_count: null, likes: null },
  problem: "Who is rich?",
  choices: { A: "Woman A", B: "Woman B" },
  ordered_deceptions: [
    {
      id: 1,
      intended_option: null,
      deceptive_idea:
        "Visible clothing and possessions invite a quick judgment about wealth.",
      bounding_boxes: [],
    },
    {
      id: 2,
      intended_option: null,
      deceptive_idea:
        "The fake logo on woman B’s shirt can be overlooked among the surrounding visual information.",
      bounding_boxes: [],
    },
    {
      id: 3,
      intended_option: null,
      deceptive_idea:
        "Woman B is receiving a large amount of cash, making her appear wealthy.",
      bounding_boxes: [
        {
          box_id: "ea352a8d-e35f-4fcf-a994-7c1671ca98fc",
          x: 780.9638886101253,
          y: 386.22202488591466,
          width: 165.7648375878881,
          height: 164.87276048090632,
        },
      ],
    },
  ],
  answer: {
    option: "A",
    idea: "Woman A is rich; Woman B’s shirt has a fake Nike logo.",
    bounding_boxes: [],
    source: { type: null, note: null },
  },
  difficulty: null,
  category: null,
  contributor: { name: "mahyar", openreview_id: null },
  added_date: null,
  is_ai_generated: false,
};
export function demoItems(): Item[] {
  return [0, 1, 2].map((n) => {
    const data = structuredClone(example);
    data.image.path = `images/0${20 + n}.jpg`;
    if (n === 1) {
      data.problem = "Whose shirt has a fake logo?";
      data.answer.option = "B";
      data.answer.idea = "The logo on woman B’s shirt is incorrectly shaped.";
      data.ordered_deceptions = [];
    }
    if (n === 2) {
      data.problem = "Who receives cash from the customer?";
      data.answer.option = "B";
      data.answer.idea = "The customer hands cash to woman B.";
      data.ordered_deceptions = [];
    }
    return {
      key: `0${20 + n}.json`,
      data,
      imageUrl: "/assets/riddle.jpg",
      changed: false,
      deleted: false,
    };
  });
}
export function safePath(path: string) {
  const p = path.replace(/\\/g, "/").replace(/^\.\//, "");
  if (
    !p ||
    p.startsWith("/") ||
    /^[a-z]:/i.test(p) ||
    p.split("/").some((s) => s === ".." || s === "" || s === ".")
  )
    throw new Error(`Unsafe relative path: ${path}`);
  return p;
}
export function stem(path: string) {
  return path
    .replace(/\\/g, "/")
    .split("/")
    .pop()!
    .replace(/\.[^.]+$/, "");
}
export function getField(obj: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (cur, k) =>
        cur && typeof cur === "object"
          ? (cur as Record<string, unknown>)[k]
          : undefined,
      obj,
    );
}
export function parseResponse(text: string) {
  const answers = [...text.matchAll(/<answer>\s*([\s\S]*?)\s*<\/answer>/gi)];
  const reasons = [
    ...text.matchAll(/<reasoning>\s*([\s\S]*?)\s*<\/reasoning>/gi),
  ];
  return {
    answer: answers.length === 1 ? answers[0][1].trim() : null,
    reasoning: reasons.length === 1 ? reasons[0][1].trim() : "",
    malformed: answers.length !== 1 || !answers[0]?.[1].trim(),
  };
}
export function isRecord(data: unknown): data is RecordData {
  if (!data || typeof data !== "object") return false;
  const d = data as RecordData;
  return !!(
    d.image &&
    typeof d.image.path === "string" &&
    Number.isFinite(d.image.width) &&
    d.image.width > 0 &&
    Number.isFinite(d.image.height) &&
    d.image.height > 0 &&
    typeof d.problem === "string" &&
    d.choices &&
    typeof d.choices === "object" &&
    !Array.isArray(d.choices) &&
    Object.values(d.choices).every((v) => typeof v === "string") &&
    Array.isArray(d.ordered_deceptions) &&
    d.ordered_deceptions.every(
      (x) =>
        x &&
        typeof x.deceptive_idea === "string" &&
        Array.isArray(x.bounding_boxes),
    ) &&
    d.answer &&
    typeof d.answer.idea === "string" &&
    Array.isArray(d.answer.bounding_boxes) &&
    d.contributor
  );
}
export function validateBox(b: Box, w: number, h: number) {
  return (
    [b.x, b.y, b.width, b.height].every(Number.isFinite) &&
    b.width > 0 &&
    b.height > 0 &&
    b.x >= 0 &&
    b.y >= 0 &&
    b.x + b.width <= w + 0.01 &&
    b.y + b.height <= h + 0.01
  );
}
export function clampBox(b: Box, w: number, h: number): Box {
  const width = Math.min(w, Math.max(1, b.width)),
    height = Math.min(h, Math.max(1, b.height));
  return {
    ...b,
    width,
    height,
    x: Math.max(0, Math.min(w - width, b.x)),
    y: Math.max(0, Math.min(h - height, b.y)),
  };
}
export function modelProvider(name: string) {
  const n = name.toLowerCase();
  return n.includes("gpt") || n.includes("openai")
    ? "openai"
    : n.includes("claude") || n.includes("anthropic")
      ? "anthropic"
      : n.includes("gemini") || n.includes("google")
        ? "gemini"
        : n.includes("llama") || n.includes("meta")
          ? "meta"
          : n.includes("qwen")
            ? "qwen"
            : null;
}
export const demoResponses: ResponseRow[] = [
  [
    "GPT-4o",
    "openai/gpt-4o",
    "A",
    "The logo on woman B’s shirt appears to imitate Nike. The cash is a distracting cue, so the intended answer is woman A.",
  ],
  [
    "Gemini 2.5 Pro",
    "google/gemini-2.5-pro",
    "A",
    "Woman A. Woman B’s incorrectly shaped shirt logo is the diagnostic detail in this visual riddle.",
  ],
  [
    "Claude Sonnet",
    "anthropic/claude-sonnet",
    "B",
    "Woman B is being handed a large stack of money. This suggests she has more money available.",
  ],
  [
    "Qwen3-VL",
    "qwen/qwen3-vl",
    "B",
    "Woman B is receiving a substantial amount of cash from a customer.",
  ],
  [
    "Llama 4",
    "meta-llama/llama-4",
    "A",
    "The shirt logo provides a more useful clue than the visible cash. Woman A is the intended answer.",
  ],
].map(([model, filename, answer, reasoning], i) => ({
  model,
  filename,
  line: i + 1,
  raw: { illustrative: true },
  text: `<reasoning>${reasoning}</reasoning>\n<answer>${answer}</answer>`,
  matchKey: "020",
  answer,
  reasoning,
  malformed: false,
}));
export function exportRecord(item: Item, name: string, id: string) {
  const data = structuredClone(item.data);
  if (item.changed)
    data.contributor = { ...data.contributor, name, openreview_id: id };
  return data;
}
// ZIP (STORE) writer: UTF-8 names, original image bytes, CRC32 per member.
export function zipFiles(
  files: { path: string; bytes: Uint8Array }[],
): Uint8Array {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const directory: Uint8Array[] = [];
  let offset = 0;
  const table = Uint32Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  for (const f of files) {
    const path = encoder.encode(safePath(f.path));
    let crc = 0xffffffff;
    for (const b of f.bytes) crc = table[(crc ^ b) & 255] ^ (crc >>> 8);
    crc = (crc ^ 0xffffffff) >>> 0;
    const local = new Uint8Array(30 + path.length);
    const v = new DataView(local.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 0x0800, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, f.bytes.length, true);
    v.setUint32(22, f.bytes.length, true);
    v.setUint16(26, path.length, true);
    local.set(path, 30);
    parts.push(local, f.bytes);
    const central = new Uint8Array(46 + path.length);
    const c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, f.bytes.length, true);
    c.setUint32(24, f.bytes.length, true);
    c.setUint16(28, path.length, true);
    c.setUint32(42, offset, true);
    central.set(path, 46);
    directory.push(central);
    offset += local.length + f.bytes.length;
  }
  const size = directory.reduce((n, b) => n + b.length, 0);
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, size, true);
  e.setUint32(16, offset, true);
  const out = new Uint8Array(offset + size + 22);
  let p = 0;
  for (const chunk of [...parts, ...directory, end]) {
    out.set(chunk, p);
    p += chunk.length;
  }
  return out;
}
export function resolveResponseKey(
  items: Item[],
  key: string | null,
): string | null {
  if (!key) return null;
  const normalized = key.replace(/\\/g, "/").replace(/^\.\//, "");
  const exactRecords = items.filter(
    (i) => i.key === normalized || `json/${i.key}` === normalized,
  );
  if (exactRecords.length)
    return exactRecords.length === 1 ? exactRecords[0].key : null;
  const exactImages = items.filter((i) => i.data.image.path === normalized);
  if (exactImages.length)
    return exactImages.length === 1 ? exactImages[0].key : null;
  if (normalized.includes("/")) return null;
  const byStem = items.filter(
    (i) =>
      stem(i.data.image.path) === stem(normalized) ||
      stem(i.key) === stem(normalized),
  );
  return byStem.length === 1 ? byStem[0].key : null;
}
