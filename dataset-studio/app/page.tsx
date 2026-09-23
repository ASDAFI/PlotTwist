"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import {
  api,
  allItems,
  waitJob,
  type Workspace,
  type Job,
  type ResponsePage,
} from "@/lib/api";
import { useDurableWorkspace } from "@/hooks/use-durable-workspace";
import { ResponseImport } from "@/components/workspace/response-import";
import {
  Scan,
  FolderOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  ArrowRight,
  Check,
  CheckCircle2,
  Image as ImageIcon,
  SquareDashedMousePointer,
  MousePointer2,
  Plus,
  Minus,
  Maximize2,
  Eye,
  EyeOff,
  Undo2,
  Trash2,
  GripVertical,
  ArrowUp,
  ArrowDown,
  Layers,
  MessageSquare,
  Download,
  Settings2,
  FileJson,
  Info,
  Square,
  Target,
  ExternalLink,
  Copy,
  PanelLeftClose,
  Box as BoxIcon,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import {
  Box,
  RecordData,
  Item,
  ResponseRow,
  demoItems,
  demoResponses,
  safePath,
  stem,
  getField,
  parseResponse,
  isRecord,
  validateBox,
  clampBox,
  modelProvider,
  exportRecord,
  zipFiles,
  resolveResponseKey,
  newBoxId,
} from "@/lib/dataset";

type TargetKey = string;
import { nativePoint, dragBox, type DragState as Drag } from "@/lib/geometry";
function owner(id: string | number) {
  return "deception:" + String(id);
}
function Tip({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
function Logo({ name }: { name: string }) {
  const provider = modelProvider(name);
  return (
    <span className="provider-logo">
      {provider ? (
        <img src={`/assets/${provider}.svg`} alt={`${provider} logo`} />
      ) : (
        name.substring(0, 1).toUpperCase()
      )}
    </span>
  );
}
function ChoiceSelect({
  value,
  onChange,
  choices,
  label,
  allowNull = false,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  choices: Record<string, string>;
  label: string;
  allowNull?: boolean;
}) {
  let unset = "__plottwist_unset__";
  while (Object.hasOwn(choices, unset)) unset += "_";
  return (
    <Select
      value={value ?? unset}
      onValueChange={(v) => onChange(v === unset ? null : v)}
    >
      <SelectTrigger aria-label={label}>
        <SelectValue placeholder="Unspecified" />
      </SelectTrigger>
      <SelectContent>
        {(allowNull || value === null) && (
          <SelectItem value={unset}>Unspecified</SelectItem>
        )}
        {Object.entries(choices).map(([key, name]) => (
          <SelectItem key={key} value={key}>
            {key} · {name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function Home() {
  const [items, setItems] = useState<Item[]>(demoItems);
  const durable = useDurableWorkspace(setItems);
  const [apiAvailable, setApiAvailable] = useState(false),
    [apiChecking, setApiChecking] = useState(true);
  const [mountedDataset, setMountedDataset] = useState("."),
    [mountedResponses, setMountedResponses] = useState<string | null>("."),
    [mountedExports, setMountedExports] = useState(".");
  const [serverResponses, setServerResponses] = useState<ResponseRow[]>([]),
    [responseTotal, setResponseTotal] = useState(0),
    [responseReport, setResponseReport] = useState<Job | null>(null),
    [responseLoading, setResponseLoading] = useState(false),
    [responseReload, setResponseReload] = useState(0);
  const [serverExport, setServerExport] = useState<Job | null>(null),
    [excludeList, setExcludeList] = useState(false);
  const [activeKey, setActiveKey] = useState("020.json");
  const [demo, setDemo] = useState(true);
  const [name, setName] = useState("");
  const [openReview, setOpenReview] = useState("");
  const [setup, setSetup] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [step, setStep] = useState(1);
  const [setupError, setSetupError] = useState("");
  const [datasetName, setDatasetName] = useState("Demo dataset");
  const [pendingItems, setPendingItems] = useState<Item[] | null>(null);
  const [localMode, setLocalMode] = useState(false);
  const [responseFiles, setResponseFiles] = useState<File[]>([]);
  const [responseName, setResponseName] = useState("");
  const [localExportName, setLocalExportName] = useState("");
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [responseErrors, setResponseErrors] = useState<string[]>([]);
  const [mappingField, setMappingField] = useState("image.path");
  const [loadedResponses, setLoadedResponses] = useState(false);
  const [compare, setCompare] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportName, setExportName] = useState("plottwist-reviewed");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [target, setTarget] = useState<TargetKey>(owner(3));
  const [tool, setTool] = useState<"select" | "draw">("select");
  const [zoom, setZoom] = useState(1);
  const [showBoxes, setShowBoxes] = useState(true);
  const [selectedBox, setSelectedBox] = useState<string | null>(null);
  const [previewBox, setPreviewBox] = useState<Box | null>(null);
  const [deleteKind, setDeleteKind] = useState<"item" | "deception" | null>(
    null,
  );
  const [switchPending, setSwitchPending] = useState<boolean | null>(null);
  const [revision, setRevision] = useState(0);
  const [imageError, setImageError] = useState(false);
  const [imageMismatch, setImageMismatch] = useState(false);
  const [busy, setBusy] = useState(false);
  const datasetInput = useRef<HTMLInputElement>(null);
  const outputInput = useRef<HTMLInputElement>(null);
  const localExportDirectory = useRef<FileSystemDirectoryHandle | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [fitWidth, setFitWidth] = useState(600);
  const drag = useRef<Drag | null>(null);
  const history = useRef<Item[]>([]);
  const urls = useRef<string[]>([]);
  const active = items.find((x) => x.key === activeKey);
  const current = active && !active.deleted ? active : null;
  const data = current?.data;
  const visible = items.filter((x) => !x.deleted);
  const index = visible.findIndex((x) => x.key === activeKey);
  const changed = items.filter((x) => x.changed || x.deleted).length;
  const selectedDeception = data?.ordered_deceptions.find(
    (x) => owner(x.id) === target,
  );
  const allBoxes = useMemo(
    () =>
      data
        ? [
            ...data.ordered_deceptions.flatMap((d, i) =>
              d.bounding_boxes.map((b) => ({
                box: b,
                target: owner(d.id),
                label: `D${i + 1}`,
                solution: false,
              })),
            ),
            ...data.answer.bounding_boxes.map((b) => ({
              box: b,
              target: "solution",
              label: "Solution",
              solution: true,
            })),
          ]
        : [],
    [data],
  );
  const chosen = allBoxes.find((b) => b.box.box_id === selectedBox);
  const currentResponses = useMemo(() => {
    if (!current) return [];
    if (durable.workspaceId) return serverResponses;
    if (demo) return stem(current.key) === "020" ? demoResponses : [];
    return responses.filter(
      (row) => resolveResponseKey(items, row.matchKey) === current.key,
    );
  }, [current, responses, demo, items, serverResponses, durable.workspaceId]);
  useEffect(() => {
    let ignore = false;
    void api<{ service: string }>("/health")
      .then((result) => {
        if (!ignore) setApiAvailable(result.service === "plottwist");
      })
      .catch(() => {})
      .finally(() => {
        if (!ignore) setApiChecking(false);
      });
    return () => {
      ignore = true;
    };
  }, []);
  useEffect(() => {
    if (!durable.workspaceId || !current?.id || !compare) return;
    let ignore = false;
    setResponseLoading(true);
    setServerResponses([]);
    void api<ResponsePage>(
      `/workspaces/${durable.workspaceId}/responses?item_id=${current.id}&limit=100`,
    )
      .then((p) => {
        if (!ignore) {
          setServerResponses(p.rows);
          setResponseTotal(p.total);
          setResponseReport(p.report);
          setResponseErrors([]);
        }
      })
      .catch((e) => {
        if (!ignore) setResponseErrors([e.message]);
      })
      .finally(() => {
        if (!ignore) setResponseLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [durable.workspaceId, current?.id, compare, responseReload]);
  async function moreResponses() {
    if (!current?.id || !durable.workspaceId) return;
    setResponseLoading(true);
    try {
      const p = await api<ResponsePage>(
        `/workspaces/${durable.workspaceId}/responses?item_id=${current.id}&offset=${serverResponses.length}&limit=100`,
      );
      setServerResponses((rows) => [...rows, ...p.rows]);
    } catch (e) {
      setResponseErrors([(e as Error).message]);
    } finally {
      setResponseLoading(false);
    }
  }
  function actor() {
    return { name: name.trim(), openreview_id: profileId() };
  }
  function replaceItem(item: Item) {
    setItems((prev) => prev.map((x) => (x.key === item.key ? item : x)));
    durable.stage(item, actor());
    setRevision((r) => r + 1);
  }
  async function exportOnServer() {
    if (!durable.workspaceId) return;
    setExporting(true);
    setExportError("");
    setServerExport(null);
    try {
      await durable.flush();
      const started = await api<Job>(
        `/workspaces/${durable.workspaceId}/exports`,
        {
          method: "POST",
          body: JSON.stringify({ parent: mountedExports, name: exportName }),
        },
      );
      setServerExport(started);
      const done = await waitJob(
        durable.workspaceId,
        started.id,
        setServerExport,
      );
      setServerExport(done);
      toast.success(
        `Exported ${String(done.result?.items)} items to ${String(done.result?.destination)}`,
      );
    } catch (e) {
      setExportError((e as Error).message);
    } finally {
      setExporting(false);
    }
  }
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !data) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setFitWidth(
        Math.max(
          100,
          Math.min(
            width - 44,
            ((height - 105) * data.image.width) / data.image.height,
          ),
        ),
      );
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, [!!data, data?.image.width, data?.image.height]);
  useEffect(() => {
    try {
      const p = JSON.parse(
        localStorage.getItem("plottwist-identity") || "null",
      );
      if (p) {
        setName(p.name || "");
        setOpenReview(p.openReview || "");
      }
    } catch {}
    return () => {
      urls.current.forEach(URL.revokeObjectURL);
    };
  }, []);
  useEffect(() => {
    setSelectedBox(null);
    setImageError(false);
    setImageMismatch(false);
    setZoom(1);
    setTool("select");
    setTarget(
      data?.ordered_deceptions[0]
        ? owner(data.ordered_deceptions[0].id)
        : "solution",
    );
  }, [activeKey]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (durable.workspaceId ? durable.pendingCount > 0 : changed > 0) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changed, durable.workspaceId, durable.pendingCount]);
  function edit(fn: (d: RecordData) => void) {
    if (!current) return;
    history.current.push(structuredClone(current));
    if (history.current.length > 40) history.current.shift();
    const next = structuredClone(current.data);
    fn(next);
    replaceItem({ ...current, data: next, changed: true });
  }
  function undo() {
    const old = history.current.pop();
    if (!old) return;
    replaceItem(old);
    setActiveKey(old.key);
    setSelectedBox(null);
    setRevision((r) => r + 1);
    toast("Last edit undone");
  }
  function navigate(delta: number) {
    const next = visible[index + delta];
    if (next) setActiveKey(next.key);
  }
  const latest = useRef({ navigate, undo });
  latest.current = { navigate, undo };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (setup || compare || exportOpen || deleteKind) return;
      const t = e.target as HTMLElement;
      if (
        t.closest(
          "input,textarea,[contenteditable=true],[role=combobox],[role=dialog]",
        )
      )
        return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        latest.current.navigate(1);
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        latest.current.navigate(-1);
      }
      if (e.key.toLowerCase() === "b") setTool("draw");
      if (e.key.toLowerCase() === "v") setTool("select");
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        latest.current.undo();
      }
      if (e.key === "Escape") {
        drag.current = null;
        setPreviewBox(null);
        setTool("select");
        setSelectedBox(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setup, compare, exportOpen, deleteKind]);
  function validateIdentity() {
    if (!name.trim()) return "Enter your name to attribute your edits.";
    if (!/^~[^\s/]+$/.test(openReview.trim())) {
      try {
        const url = new URL(openReview);
        if (
          url.hostname !== "openreview.net" ||
          url.pathname !== "/profile" ||
          !url.searchParams.get("id")?.startsWith("~")
        )
          return "Use an OpenReview profile URL or a profile ID beginning with ~.";
      } catch {
        return "Use an OpenReview profile URL or a profile ID beginning with ~.";
      }
    }
    return "";
  }
  function profileId() {
    return openReview.trim().startsWith("~")
      ? openReview.trim()
      : new URL(openReview).searchParams.get("id")!;
  }
  function nextStep() {
    const err = validateIdentity();
    setSetupError(err);
    if (!err) {
      try {
        localStorage.setItem(
          "plottwist-identity",
          JSON.stringify({ name: name.trim(), openReview: openReview.trim() }),
        );
      } catch {}
      setStep(2);
    }
  }
  async function importDataset(files: File[]) {
    setBusy(true);
    setSetupError("");
    const map = new Map<string, File>();
    const problems: string[] = [];
    try {
      for (const f of files) {
        const rel = (f.webkitRelativePath || f.name)
          .split("/")
          .slice(1)
          .join("/");
        if (rel) map.set(safePath(rel), f);
      }
      const jsonFiles = [...map]
        .filter(([p]) => p.startsWith("json/") && p.endsWith(".json"))
        .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
      if (!jsonFiles.length)
        throw new Error(
          "Select a dataset folder containing images/ and json/ subfolders.",
        );
      const imported: Item[] = [];
      for (const [p, f] of jsonFiles) {
        try {
          const record = JSON.parse(await f.text());
          if (!isRecord(record))
            throw new Error("Unsupported or incomplete record structure");
          safePath(record.image.path);
          const image = map.get(record.image.path);
          if (!image) throw new Error(`Missing ${record.image.path}`);
          const ids = record.ordered_deceptions.map((x) => String(x.id));
          if (ids.length !== new Set(ids).size)
            throw new Error("Duplicate deception IDs");
          const boxes = [
            ...record.ordered_deceptions.flatMap((x) => x.bounding_boxes),
            ...record.answer.bounding_boxes,
          ];
          if (
            boxes.some(
              (b) => !validateBox(b, record.image.width, record.image.height),
            )
          )
            throw new Error("Invalid or out-of-bounds box");
          if (new Set(boxes.map((b) => b.box_id)).size !== boxes.length)
            throw new Error("Duplicate box IDs");
          const imageUrl = URL.createObjectURL(image);
          urls.current.push(imageUrl);
          imported.push({
            key: p.slice(5),
            data: record,
            imageUrl,
            imageFile: image,
            changed: false,
            deleted: false,
          });
        } catch (e) {
          problems.push(`${p}: ${(e as Error).message}`);
        }
      }
      if (problems.length)
        throw new Error(
          problems.slice(0, 4).join(" · ") +
            (problems.length > 4
              ? ` · ${problems.length - 4} more errors`
              : ""),
        );
      setPendingItems(imported);
      setLocalMode(true);
      setDatasetName(files[0]?.webkitRelativePath.split("/")[0] || "Dataset");
      toast(`${imported.length} image / JSON pairs loaded`);
    } catch (e) {
      setSetupError((e as Error).message);
      setPendingItems(null);
    } finally {
      setBusy(false);
    }
  }
  async function parseFiles(files: File[], field: string) {
    const parsed: ResponseRow[] = [];
    const errors: string[] = [];
    for (const file of files) {
      const lines = (await file.text()).split(/\r?\n/);
      lines.forEach((line, i) => {
        if (!line.trim()) return;
        try {
          const raw = JSON.parse(line);
          const text = raw.visible_output;
          if (typeof text !== "string")
            throw new Error("Missing visible_output string");
          const match = getField(raw, field);
          parsed.push({
            model: file.name.replace(/\.jsonl$/i, ""),
            filename: file.name,
            line: i + 1,
            raw,
            text,
            matchKey:
              typeof match === "string" || typeof match === "number"
                ? String(match)
                : null,
            ...parseResponse(text),
          });
        } catch (e) {
          errors.push(`${file.name}:${i + 1} — ${(e as Error).message}`);
        }
      });
    }
    setResponses(parsed);
    setResponseErrors(errors);
    setLoadedResponses(true);
    return parsed;
  }
  async function loadResponseFolder(files: File[]) {
    const candidates = [mappingField, "image.path", "item_id", "sample_id", "image_id"];
    let field = mappingField;
    for (const candidate of candidates) {
      let found = false;
      for (const file of files) {
        const firstLine = (await file.text()).split(/\r?\n/).find((line) => line.trim());
        if (!firstLine) continue;
        try {
          const raw = JSON.parse(firstLine);
          const value = getField(raw, candidate);
          if (typeof value === "string" || typeof value === "number") {
            found = true;
            break;
          }
        } catch {
          // parseFiles reports malformed rows with their file and line number.
        }
      }
      if (found) {
        field = candidate;
        break;
      }
    }
    setMappingField(field);
    await parseFiles(files, field);
    setSetupError("");
  }
  async function enterWorkspace(asDemo = false, confirmed = false) {
    if (initialized && changed && !durable.workspaceId && !confirmed) {
      setSwitchPending(asDemo);
      return;
    }
    const identityError = validateIdentity();
    if (identityError) {
      setSetupError(identityError);
      setStep(1);
      return;
    }
    setBusy(true);
    setSetupError("");
    try {
      await durable.flush();
      if (asDemo) {
        durable.end();
        setItems(demoItems());
        setDemo(true);
        setDatasetName("Demo dataset");
        setActiveKey("020.json");
        setResponses([]);
        setLoadedResponses(false);
      } else if (apiAvailable && !localMode) {
        const ws = await api<Workspace>("/workspaces", {
          method: "POST",
          body: JSON.stringify({
            dataset: mountedDataset,
            responses: mountedResponses,
            actor: actor(),
          }),
        });
        const imported = await allItems(ws.id);
        durable.begin(ws.id, imported);
        setItems(imported);
        setActiveKey(
          imported.find((i) => !i.deleted)?.key ?? imported[0]?.key ?? "",
        );
        setDatasetName(ws.name);
        setDemo(false);
        setResponses([]);
        setServerResponses([]);
        setResponseReport(null);
        setLoadedResponses(false);
        toast.success(
          ws.resumed
            ? "Saved workspace resumed"
            : `${ws.count} image / JSON pairs opened`,
        );
        for (const warning of ws.warnings)
          toast(warning.message, {
            description: `${warning.files.length} files`,
          });
      } else {
        if (!pendingItems?.length) return;
        durable.end();
        setItems(pendingItems);
        setActiveKey(pendingItems[0].key);
        setDemo(false);
        setResponses([]);
        setLoadedResponses(false);
        if (responseFiles.length) await loadResponseFolder(responseFiles);
      }
      setResponseErrors([]);
      history.current = [];
      setRevision((r) => r + 1);
      setInitialized(true);
      setSetup(false);
      setSetupError("");
    } catch (e) {
      const details = (
        e as { details?: { errors?: { file: string; message: string }[] } }
      ).details;
      setSetupError(
        (e as Error).message +
          (details?.errors
            ? " " +
              details.errors
                .slice(0, 8)
                .map((x) => `${x.file}: ${x.message}`)
                .join(" · ")
            : ""),
      );
    } finally {
      setBusy(false);
    }
  }

  function changeDeception(
    id: string,
    fn: (d: RecordData["ordered_deceptions"][number]) => void,
  ) {
    edit((d) => {
      const dec = d.ordered_deceptions.find((x) => String(x.id) === id);
      if (dec) fn(dec);
    });
  }
  function addDeception() {
    if (!data) return;
    let id =
      Math.max(
        0,
        ...data.ordered_deceptions.map((d) =>
          typeof d.id === "number" ? d.id : 0,
        ),
      ) + 1;
    while (data.ordered_deceptions.some((d) => String(d.id) === String(id)))
      id++;
    edit((d) =>
      d.ordered_deceptions.push({
        id,
        intended_option: null,
        deceptive_idea: "",
        bounding_boxes: [],
      }),
    );
    setTarget(owner(id));
    setTool("select");
  }
  function reorder(id: string, direction: number) {
    edit((d) => {
      const i = d.ordered_deceptions.findIndex((x) => String(x.id) === id),
        to = i + direction;
      if (to < 0 || to >= d.ordered_deceptions.length) return;
      [d.ordered_deceptions[i], d.ordered_deceptions[to]] = [
        d.ordered_deceptions[to],
        d.ordered_deceptions[i],
      ];
    });
  }
  function writeBox(box: Box, t: TargetKey) {
    edit((d) => {
      const container =
        t === "solution"
          ? d.answer
          : d.ordered_deceptions.find((x) => owner(x.id) === t);
      if (!container) return;
      const found = container.bounding_boxes.findIndex(
        (b) => b.box_id === box.box_id,
      );
      if (found < 0) container.bounding_boxes.push(box);
      else container.bounding_boxes[found] = box;
    });
  }
  function point(e: React.PointerEvent) {
    return nativePoint(
      { x: e.clientX, y: e.clientY },
      svgRef.current!.getBoundingClientRect(),
      data!.image.width,
      data!.image.height,
    );
  }
  function startDrag(
    e: React.PointerEvent,
    mode: Drag["mode"],
    box?: Box,
    t = target,
    corner?: Drag["corner"],
  ) {
    if (!data || imageMismatch || imageError || e.button !== 0) return;
    if (mode !== "draw" && tool !== "select") return;
    if (mode === "draw" && tool !== "draw") {
      setSelectedBox(null);
      return;
    }
    if (
      mode === "draw" &&
      t !== "solution" &&
      !data.ordered_deceptions.some((d) => owner(d.id) === t)
    ) {
      toast.error("Select a clue before drawing a box");
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    svgRef.current?.setPointerCapture(e.pointerId);
    drag.current = {
      mode,
      start: point(e),
      original: box ? { ...box } : undefined,
      target: t,
      corner,
    };
    setTarget(t);
    setSelectedBox(box?.box_id ?? null);
    setPreviewBox(box ? { ...box } : null);
  }
  function moveDrag(e: React.PointerEvent) {
    if (drag.current && data)
      setPreviewBox(
        dragBox(drag.current, point(e), data.image.width, data.image.height),
      );
  }
  function finishDrag(e: React.PointerEvent) {
    const state = drag.current;
    if (state && data) {
      const preview = dragBox(
        state,
        point(e),
        data.image.width,
        data.image.height,
      );
      if (
        state.mode !== "draw" ||
        (preview.width >= 3 && preview.height >= 3)
      ) {
        const b = {
          ...preview,
          box_id: state.mode === "draw" ? newBoxId() : preview.box_id,
        };
        if (
          state.mode === "draw" ||
          JSON.stringify(b) !== JSON.stringify(state.original)
        ) {
          writeBox(b, state.target);
        }
        setSelectedBox(b.box_id);
        if (state.mode === "draw") setTool("select");
      } else toast("Draw a slightly larger box");
    }
    drag.current = null;
    setPreviewBox(null);
  }

  function removeBox() {
    if (!chosen) return;
    edit((d) => {
      const c =
        chosen.target === "solution"
          ? d.answer
          : d.ordered_deceptions.find((x) => owner(x.id) === chosen.target);
      if (c)
        c.bounding_boxes = c.bounding_boxes.filter(
          (b) => b.box_id !== chosen.box.box_id,
        );
    });
    setSelectedBox(null);
  }
  function performDelete() {
    if (deleteKind === "deception") {
      edit((d) => {
        d.ordered_deceptions = d.ordered_deceptions.filter(
          (x) => owner(x.id) !== target,
        );
      });
      setTarget("solution");
      setSelectedBox(null);
    } else if (current) {
      history.current.push(structuredClone(current));
      replaceItem({ ...current, deleted: true });
      const next = visible[index + 1] || visible[index - 1];
      if (next) setActiveKey(next.key);
      setRevision((r) => r + 1);
      toast("Item excluded from export", {
        action: { label: "Undo", onClick: undo },
      });
    }
    setDeleteKind(null);
  }
  async function exportEntries() {
    if (!visible.length) throw new Error("There are no items to export.");
    const files: { path: string; bytes: Uint8Array }[] = [];
    const images = new Set<string>();
    for (const item of visible) {
      const d = exportRecord(item, name.trim(), profileId());
      if (
        d.answer.option !== null &&
        !Object.hasOwn(d.choices, d.answer.option)
      )
        throw new Error(`${item.key}: answer is not a choice key`);
      const boxes = [
        ...d.ordered_deceptions.flatMap((x) => x.bounding_boxes),
        ...d.answer.bounding_boxes,
      ];
      if (boxes.some((b) => !validateBox(b, d.image.width, d.image.height)))
        throw new Error(`${item.key}: invalid box coordinates`);
      files.push({
        path: `json/${safePath(item.key)}`,
        bytes: new TextEncoder().encode(JSON.stringify(d, null, 2) + "\n"),
      });
      if (!images.has(d.image.path)) {
        const blob =
          item.imageFile || (await (await fetch(item.imageUrl)).blob());
        files.push({
          path: safePath(d.image.path),
          bytes: new Uint8Array(await blob.arrayBuffer()),
        });
        images.add(d.image.path);
      }
    }
    return files;
  }
  async function doExport(directory = false) {
    setExporting(true);
    setExportError("");
    try {
      if (!/^[a-zA-Z0-9][\w.-]*$/.test(exportName))
        throw new Error(
          "Use letters, numbers, hyphens, or underscores for the folder name.",
        );
      const picker = (window as unknown as { showDirectoryPicker?: Function })
        .showDirectoryPicker;
      let root: FileSystemDirectoryHandle | null = null;
      if (directory) {
        if (!picker)
          throw new Error(
            "Folder export is unavailable in this browser. Download the ZIP and extract it into a new directory.",
          );
        root = localExportDirectory.current ?? (await picker({ mode: "readwrite" }));
        for await (const entry of root.values()) {
          if (entry)
            throw new Error(
              "Choose a new, empty output folder. Existing files are never overwritten.",
            );
        }
      }
      const entries = await exportEntries();
      if (root) {
        for (const file of entries) {
          const pieces = file.path.split("/");
          let dir = root;
          for (const piece of pieces.slice(0, -1))
            dir = await dir.getDirectoryHandle(piece, { create: true });
          const handle = await dir.getFileHandle(pieces.at(-1), {
            create: true,
          });
          const writer = await handle.createWritable();
          await writer.write(file.bytes);
          await writer.close();
        }
        toast.success(`Exported ${visible.length} items to ${root.name}`);
      } else {
        const zip = zipFiles(
          entries.map((f) => ({ ...f, path: `${exportName}/${f.path}` })),
        );
        const url = URL.createObjectURL(
          new Blob([zip as BlobPart], { type: "application/zip" }),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = `${exportName}.zip`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        toast.success(`Export ready: ${visible.length} items`);
      }
      setExportOpen(false);
    } catch (e) {
      if ((e as Error).name !== "AbortError")
        setExportError((e as Error).message);
    } finally {
      setExporting(false);
    }
  }
  async function browseLocalExportDirectory() {
    const picker = (window as unknown as { showDirectoryPicker?: Function })
      .showDirectoryPicker;
    if (!picker) {
      setSetupError(
        "Folder selection is unavailable in this browser. You can download the export as a ZIP instead.",
      );
      return;
    }
    try {
      const directory = (await picker({
        mode: "readwrite",
      })) as FileSystemDirectoryHandle;
      localExportDirectory.current = directory;
      setLocalExportName(directory.name);
      setSetupError("");
    } catch (e) {
      if ((e as Error).name !== "AbortError")
        setSetupError((e as Error).message);
    }
  }
  function matchesReference(r: ResponseRow) {
    return !!r.answer && !r.malformed && r.answer === data?.answer.option;
  }
  const toolState = useRef<any>(null);
  toolState.current = { items, current, setup };
  useEffect(() => {
    const mc = (
      document as unknown as { modelContext?: { registerTool: Function } }
    ).modelContext;
    if (!mc?.registerTool) return;
    const controller = new AbortController();
    const toolDef = {
      name: "read_annotation_workspace",
      title: "Read current annotations",
      description:
        "Read the current item and annotation counts. Does not edit or save data.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute(input: unknown) {
        if (
          !input ||
          typeof input !== "object" ||
          Array.isArray(input) ||
          Object.keys(input).length
        )
          throw new Error("Expected an empty object");
        const s = toolState.current;
        if (s.setup) throw new Error("Complete workspace setup first");
        return s.current
          ? {
              file: s.current.key,
              problem: s.current.data.problem,
              answer: s.current.data.answer.option,
              deceptions: s.current.data.ordered_deceptions.map((d: any) => ({
                id: d.id,
                idea: d.deceptive_idea,
                boxCount: d.bounding_boxes.length,
              })),
              itemCount: s.items.filter((i: Item) => !i.deleted).length,
            }
          : { file: null, itemCount: 0 };
      },
    };
    try {
      Promise.resolve(
        mc.registerTool(toolDef, { signal: controller.signal }),
      ).catch(() => {});
    } catch {}
    return () => controller.abort();
  }, []);
  const totalBoxes = allBoxes.length;
  const folderProps = {
    webkitdirectory: "",
    directory: "",
  } as React.InputHTMLAttributes<HTMLInputElement>;
  return (
    <TooltipProvider delayDuration={250}>
      <div className="app">
        <aside className="rail">
          <div className="brand">
            <span className="brandmark">
              <Scan />
            </span>
            <div>
              <strong>PlotTwist</strong>
              <small>DATASET STUDIO</small>
            </div>
          </div>
          <button
            className="dataset-link"
            onClick={() => {
              setStep(2);
              setSetupError("");
              setSetup(true);
            }}
          >
            <FolderOpen size={18} />
            <span>
              {datasetName}
              <small>{visible.length} paired items</small>
            </span>
            <ChevronDown className="chevron" />
          </button>
          <div className="rail-caption">
            DATASET ITEMS{" "}
            <span>{visible.length.toString().padStart(2, "0")}</span>
          </div>
          <div className="items" role="list" aria-label="Dataset images">
            {visible.map((item) => (
              <button
                role="listitem"
                key={item.key}
                className={`item ${item.key === activeKey ? "active" : ""}`}
                onClick={() => setActiveKey(item.key)}
                aria-label={`Open ${item.key}`}
                aria-current={item.key === activeKey ? "true" : undefined}
              >
                <img
                  src={item.thumbnailUrl || item.imageUrl}
                  loading="lazy"
                  className="thumb"
                  alt=""
                />
                <span className="itemtext">
                  <strong>{item.data.image.path.split("/").pop()}</strong>
                  <small>{item.data.problem}</small>
                </span>
                {item.changed ? (
                  <Check size={14} />
                ) : item.key === activeKey ? (
                  <span style={{ color: "#b7d5b9" }}>•</span>
                ) : null}
              </button>
            ))}
          </div>
          {items.some((i) => i.deleted) && (
            <button
              className="btn ghost"
              style={{ color: "#bdd6c7" }}
              onClick={() => setExcludeList(true)}
            >
              Excluded items ({items.filter((i) => i.deleted).length})
            </button>
          )}
          <div className="rail-note">
            {demo ? (
              <>
                <span className="chip">DEMO WORKSPACE</span>
                <br />
                Three sample questions.
                <br />
                One image, for UI exploration.
              </>
            ) : (
              <>
                <span className="chip">LOCAL DATASET</span>
                <br />
                {durable.workspaceId
                  ? "Drafts saved to this workspace."
                  : "Export before closing this page."}
              </>
            )}
          </div>
          <div className="identity">
            <span className="avatar">
              {name
                ? name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()
                : "AN"}
            </span>
            <div>
              <strong>{name || "Annotator"}</strong>
              <small>
                {openReview.startsWith("~")
                  ? openReview
                  : openReview
                    ? "OpenReview profile"
                    : "Set up your profile"}
              </small>
            </div>
            <Tip label="Workspace settings">
              <button
                aria-label="Workspace settings"
                onClick={() => {
                  setStep(1);
                  setSetupError("");
                  setSetup(true);
                }}
              >
                <Settings2 size={15} />
              </button>
            </Tip>
          </div>
        </aside>
        <main className="main">
          <header className="topbar">
            <div className="breadcrumb">
              <button
                className="icon-btn mobile-rail-button"
                aria-label="Workspace settings"
                onClick={() => {
                  setStep(1);
                  setSetup(true);
                }}
              >
                <Scan />
              </button>
              <span className="hide-mobile">Workspace</span>
              <ChevronRight size={13} className="hide-mobile" />
              <b>{datasetName}</b>
              <span className="pill">
                {demo ? "DEMO" : durable.workspaceId ? "LOCAL API" : "BROWSER"}
              </span>
            </div>
            <div className="top-actions">
              <span className="save-state">
                <CheckCircle2 />
                {durable.workspaceId
                  ? durable.status === "saved"
                    ? "All changes saved"
                    : durable.status === "saving"
                      ? "Saving…"
                      : durable.status === "error"
                        ? "Save failed"
                        : "Unsaved changes"
                  : changed
                    ? `${changed} edited in session`
                    : "No edits yet"}
              </span>
              <button className="btn" onClick={() => setCompare(true)}>
                <MessageSquare />
                AI answers
                <span className="logo-stack">
                  {["openai", "gemini", "anthropic"].map((n) => (
                    <Logo key={n} name={n} />
                  ))}
                </span>
              </button>
              <button
                className="btn primary"
                onClick={() => {
                  setExportError("");
                  setServerExport(null);
                  if (durable.workspaceId)
                    setExportName(
                      "review-" +
                        new Date()
                          .toISOString()
                          .replace(/[-:]/g, "")
                          .slice(0, 15),
                    );
                  setExportOpen(true);
                }}
              >
                <Download />
                <span>Export</span>
              </button>
            </div>
          </header>
          {durable.error && (
            <div className="save-error" role="alert">
              <div>
                <b>Edits have not been saved</b>
                <p>{durable.error}</p>
              </div>
              {durable.conflict ? (
                <>
                  <button
                    className="btn"
                    onClick={() =>
                      void durable
                        .resolve(false)
                        .catch((e) => toast.error(e.message))
                    }
                  >
                    Load saved version
                  </button>
                  <button
                    className="btn danger"
                    onClick={() =>
                      void durable
                        .resolve(true)
                        .catch((e) => toast.error(e.message))
                    }
                  >
                    Apply my draft
                  </button>
                </>
              ) : (
                <button
                  className="btn"
                  onClick={() =>
                    void durable.retry().catch((e) => toast.error(e.message))
                  }
                >
                  Retry save
                </button>
              )}
            </div>
          )}
          <div className="workspace-heading">
            <div>
              <div className="eyebrow">Review & refine</div>
              <h1>Annotation workspace</h1>
              <p>Look closer. Separate distractions from decisive evidence.</p>
            </div>
            <div className="heading-right">
              <button
                className="btn"
                onClick={() => navigate(-1)}
                disabled={index <= 0}
                aria-label="Previous image"
              >
                <ChevronLeft />
                <span>Previous</span>
              </button>
              <span className="index">
                <strong>
                  {index >= 0 ? String(index + 1).padStart(2, "0") : "00"}
                </strong>{" "}
                / {String(visible.length).padStart(2, "0")}
              </span>
              <button
                className="btn"
                onClick={() => navigate(1)}
                disabled={index < 0 || index === visible.length - 1}
                aria-label="Next image"
              >
                <span>Next</span>
                <ChevronRight />
              </button>
            </div>
          </div>
          {!data ? (
            <div className="empty-state">
              <Layers size={30} />
              <h2>No items left</h2>
              <p>Undo the deletion or open another dataset.</p>
              <button
                className="btn"
                disabled={!history.current.length}
                onClick={undo}
              >
                Undo deletion
              </button>
              <button className="btn" onClick={() => setExcludeList(true)}>
                Restore excluded items
              </button>
            </div>
          ) : (
            <div className="workarea">
              <section
                className="canvas-column"
                aria-label="Image annotation canvas"
              >
                <div className="canvas-top">
                  <div className="filename">
                    <ImageIcon />
                    {data.image.path.split("/").pop()}
                    <span className="pill">
                      {data.is_ai_generated ? "AI GENERATED" : "CURATED"}
                    </span>
                  </div>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 3 }}
                  >
                    <Tip label="Zoom out">
                      <button
                        className="icon-btn"
                        aria-label="Zoom out"
                        disabled={zoom <= 0.5}
                        onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
                      >
                        <Minus />
                      </button>
                    </Tip>
                    <span
                      className="mono"
                      style={{
                        fontSize: 11,
                        minWidth: 40,
                        textAlign: "center",
                      }}
                    >
                      {Math.round(zoom * 100)}%
                    </span>
                    <Tip label="Zoom in">
                      <button
                        className="icon-btn"
                        aria-label="Zoom in"
                        disabled={zoom >= 3}
                        onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
                      >
                        <Plus />
                      </button>
                    </Tip>
                    <Tip label="Fit image">
                      <button
                        className="icon-btn"
                        aria-label="Fit image"
                        onClick={() => setZoom(1)}
                      >
                        <Maximize2 />
                      </button>
                    </Tip>
                  </div>
                </div>
                <div className="image-frame" ref={frameRef}>
                  <div className="canvas-tools">
                    <Tip label="Select or move a box · V">
                      <button
                        className={`icon-btn ${tool === "select" ? "active" : ""}`}
                        aria-label="Select and move boxes"
                        onClick={() => setTool("select")}
                      >
                        <MousePointer2 />
                      </button>
                    </Tip>
                    <Tip label="Draw a bounding box · B">
                      <button
                        className={`icon-btn ${tool === "draw" ? "active" : ""}`}
                        aria-label="Draw bounding box"
                        onClick={() => {
                          setTool("draw");
                          setShowBoxes(true);
                        }}
                      >
                        <SquareDashedMousePointer />
                      </button>
                    </Tip>
                    <span
                      style={{ width: 1, background: "#e1e6dc", margin: 4 }}
                    />
                    <Tip label={showBoxes ? "Hide boxes" : "Show boxes"}>
                      <button
                        className="icon-btn"
                        aria-label={showBoxes ? "Hide boxes" : "Show boxes"}
                        onClick={() => setShowBoxes((v) => !v)}
                      >
                        {showBoxes ? <Eye /> : <EyeOff />}
                      </button>
                    </Tip>
                    <Tip label="Undo last edit">
                      <button
                        className="icon-btn"
                        aria-label="Undo last edit"
                        disabled={!history.current.length}
                        onClick={undo}
                      >
                        <Undo2 />
                      </button>
                    </Tip>
                  </div>
                  <div
                    className="image-inner"
                    style={{ width: `${Math.max(1, zoom) * 100}%` }}
                  >
                    <div
                      className="image-stage"
                      style={{ width: `${fitWidth * zoom}px` }}
                    >
                      <img
                        src={current!.imageUrl}
                        alt={data.problem}
                        draggable={false}
                        onError={() => setImageError(true)}
                        onLoad={(e) => {
                          const img = e.currentTarget;
                          setImageMismatch(
                            img.naturalWidth !== data.image.width ||
                              img.naturalHeight !== data.image.height,
                          );
                        }}
                      />
                      <svg
                        ref={svgRef}
                        className={tool === "draw" ? "drawing" : ""}
                        viewBox={`0 0 ${data.image.width} ${data.image.height}`}
                        aria-label="Bounding box overlay"
                        onPointerDown={(e) => startDrag(e, "draw")}
                        onPointerMove={moveDrag}
                        onPointerUp={finishDrag}
                        onPointerCancel={() => {
                          drag.current = null;
                          setPreviewBox(null);
                        }}
                      >
                        {showBoxes &&
                          allBoxes.map(
                            ({ box, target: t, label, solution }) => {
                              const b =
                                drag.current?.mode !== "draw" &&
                                previewBox?.box_id === box.box_id
                                  ? previewBox
                                  : box;
                              const color = solution ? "#248a5c" : "#d19b30";
                              const selected = selectedBox === box.box_id;
                              return (
                                <g key={box.box_id}>
                                  <rect
                                    x={b.x}
                                    y={b.y}
                                    width={b.width}
                                    height={b.height}
                                    fill={color}
                                    fillOpacity={selected ? 0.12 : 0.06}
                                    stroke={color}
                                    strokeWidth={selected ? 3 : 2}
                                    vectorEffect="non-scaling-stroke"
                                    onPointerDown={(e) =>
                                      startDrag(e, "move", box, t)
                                    }
                                    style={{
                                      cursor:
                                        tool === "select"
                                          ? "move"
                                          : "crosshair",
                                    }}
                                  />
                                  <rect
                                    x={b.x}
                                    y={Math.max(0, b.y - 26)}
                                    width={solution ? 95 : 39}
                                    height={24}
                                    rx={4}
                                    fill={color}
                                    style={{ pointerEvents: "none" }}
                                  />
                                  <text
                                    x={b.x + 8}
                                    y={Math.max(0, b.y - 26) + 17}
                                    fill="white"
                                    fontSize={14}
                                    fontFamily="system-ui"
                                    style={{ pointerEvents: "none" }}
                                  >
                                    {label}
                                  </text>
                                  {selected &&
                                    (["nw", "ne", "sw", "se"] as const).map(
                                      (corner) => (
                                        <rect
                                          key={corner}
                                          x={
                                            (corner.includes("w")
                                              ? b.x
                                              : b.x + b.width) - 7
                                          }
                                          y={
                                            (corner.includes("n")
                                              ? b.y
                                              : b.y + b.height) - 7
                                          }
                                          width={14}
                                          height={14}
                                          fill="white"
                                          stroke={color}
                                          strokeWidth={2}
                                          onPointerDown={(e) =>
                                            startDrag(
                                              e,
                                              "resize",
                                              box,
                                              t,
                                              corner,
                                            )
                                          }
                                          style={{
                                            cursor:
                                              corner === "nw" || corner === "se"
                                                ? "nwse-resize"
                                                : "nesw-resize",
                                          }}
                                        />
                                      ),
                                    )}
                                </g>
                              );
                            },
                          )}
                        {drag.current?.mode === "draw" && previewBox && (
                          <rect
                            x={previewBox.x}
                            y={previewBox.y}
                            width={previewBox.width}
                            height={previewBox.height}
                            fill={target === "solution" ? "#248a5c" : "#d19b30"}
                            fillOpacity={0.1}
                            stroke={
                              target === "solution" ? "#248a5c" : "#d19b30"
                            }
                            strokeWidth={2}
                            strokeDasharray="6 3"
                          />
                        )}
                      </svg>
                    </div>
                  </div>
                  <div className="image-hint">
                    {imageError
                      ? "Image could not be loaded."
                      : imageMismatch
                        ? "Image size differs from the JSON. Drawing is disabled."
                        : tool === "draw"
                          ? `Drag to draw a box for ${target === "solution" ? "the solution" : `deception ${data.ordered_deceptions.findIndex((x) => owner(x.id) === target) + 1}`}`
                          : "Select a clue on the right, then draw its evidence."}
                  </div>
                </div>
                <div className="canvas-bottom">
                  <div className="legend">
                    <span>
                      <i />
                      Deception
                    </span>
                    <span>
                      <i className="green" />
                      Solution
                    </span>
                    <span className="mono">
                      {data.image.width} × {data.image.height} px
                    </span>
                  </div>
                  {demo && (
                    <a
                      href={String(
                        (data.source as { url?: string })?.url || "#",
                      )}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Brightside / Jagran Josh
                      <ExternalLink />
                    </a>
                  )}
                </div>
                <div className="selection-bar">
                  <Target />
                  <div>
                    <p>
                      {target === "solution"
                        ? "Solution evidence"
                        : selectedDeception
                          ? `Deception ${data.ordered_deceptions.findIndex((d) => owner(d.id) === target) + 1} selected`
                          : "Choose an annotation"}
                    </p>
                    <small>
                      {target === "solution"
                        ? "Mark the detail that supports the answer."
                        : "Mark the visual cue that invites the wrong answer."}
                    </small>
                  </div>
                  <button
                    className="btn"
                    onClick={() => {
                      setTool("draw");
                      setShowBoxes(true);
                    }}
                  >
                    <Plus />
                    Add box
                  </button>
                </div>
              </section>
              <aside className="inspector" aria-label="Annotation editor">
                <Tabs defaultValue="annotations">
                  <TabsList className="inspector-tabs">
                    <TabsTrigger value="annotations">
                      Annotations
                      <span className="count">
                        {data.ordered_deceptions.length + 1}
                      </span>
                    </TabsTrigger>
                    <TabsTrigger value="details">Details</TabsTrigger>
                  </TabsList>
                  <TabsContent value="annotations">
                    <div className="inspector-body">
                      <div className="section-head">
                        <MessageSquare />
                        Question
                      </div>
                      <textarea
                        aria-label="Question"
                        className="text-input question-input"
                        value={data.problem}
                        onChange={(e) =>
                          edit((d) => {
                            d.problem = e.target.value;
                          })
                        }
                      />
                      <div className="choices">
                        {Object.entries(data.choices).map(([key, val]) => (
                          <label className="choice" key={key}>
                            <span>{key}</span>
                            <input
                              aria-label={`Choice ${key}`}
                              value={val}
                              onChange={(e) =>
                                edit((d) => {
                                  d.choices[key] = e.target.value;
                                })
                              }
                            />
                          </label>
                        ))}
                      </div>
                      <div className="section-head">
                        <Layers />
                        Deceptions
                        <span className="count">
                          {data.ordered_deceptions.length}
                        </span>
                        <span className="help">ORDER MATTERS</span>
                      </div>
                      {data.ordered_deceptions.map((dec, i) => (
                        <div
                          className={`deception-card ${target === owner(dec.id) ? "selected" : ""}`}
                          key={String(dec.id)}
                        >
                          <div
                            className="card-head"
                            onClick={() => {
                              setTarget(owner(dec.id));
                              setSelectedBox(null);
                            }}
                          >
                            <GripVertical
                              size={13}
                              style={{ color: "#b4b9aa" }}
                            />
                            <span className="rank">{i + 1}</span>
                            <strong>Deception {i + 1}</strong>
                            <div className="card-actions">
                              <Tip label="Move earlier">
                                <button
                                  className="icon-btn"
                                  aria-label={`Move deception ${i + 1} earlier`}
                                  disabled={i === 0}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    reorder(String(dec.id), -1);
                                  }}
                                >
                                  <ArrowUp />
                                </button>
                              </Tip>
                              <Tip label="Move later">
                                <button
                                  className="icon-btn"
                                  aria-label={`Move deception ${i + 1} later`}
                                  disabled={
                                    i === data.ordered_deceptions.length - 1
                                  }
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    reorder(String(dec.id), 1);
                                  }}
                                >
                                  <ArrowDown />
                                </button>
                              </Tip>
                              <Tip label="Delete deception">
                                <button
                                  className="icon-btn"
                                  aria-label={`Delete deception ${i + 1}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setTarget(owner(dec.id));
                                    setDeleteKind("deception");
                                  }}
                                >
                                  <Trash2 />
                                </button>
                              </Tip>
                            </div>
                          </div>
                          <textarea
                            className="card-description"
                            aria-label={`Deception ${i + 1} idea`}
                            value={dec.deceptive_idea}
                            rows={2}
                            placeholder="Describe the misleading visual clue…"
                            onFocus={() => setTarget(owner(dec.id))}
                            onChange={(e) =>
                              changeDeception(String(dec.id), (d) => {
                                d.deceptive_idea = e.target.value;
                              })
                            }
                          />
                          <div className="card-footer">
                            <button
                              onClick={() => {
                                setTarget(owner(dec.id));
                                setTool("draw");
                                setShowBoxes(true);
                              }}
                            >
                              <Square />
                              {dec.bounding_boxes.length}{" "}
                              {dec.bounding_boxes.length === 1
                                ? "box"
                                : "boxes"}
                              <Plus size={11} />
                            </button>
                            <div className="intent-select">
                              <ChoiceSelect
                                label={`Intended option for deception ${i + 1}`}
                                value={dec.intended_option}
                                choices={data.choices}
                                allowNull
                                onChange={(v) =>
                                  changeDeception(String(dec.id), (d) => {
                                    d.intended_option = v;
                                  })
                                }
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                      <button
                        className="btn add-deception"
                        onClick={addDeception}
                      >
                        <Plus />
                        Add deception
                      </button>
                      <hr className="divider" />
                      <div className="section-head">
                        <CheckCircle2 />
                        Solution<span className="help">REFERENCE ANSWER</span>
                      </div>
                      <div
                        className="solution-card"
                        style={
                          target === "solution"
                            ? { borderColor: "#76a67e" }
                            : {}
                        }
                      >
                        <div className="solution-head">
                          <CheckCircle2 />
                          <span>Correct answer</span>
                          <div style={{ marginLeft: "auto" }}>
                            <ChoiceSelect
                              label="Correct answer"
                              value={data.answer.option}
                              choices={data.choices}
                              onChange={(v) =>
                                edit((d) => {
                                  d.answer.option = v;
                                })
                              }
                            />
                          </div>
                        </div>
                        <textarea
                          aria-label="Solution explanation"
                          rows={2}
                          value={data.answer.idea}
                          onFocus={() => setTarget("solution")}
                          onChange={(e) =>
                            edit((d) => {
                              d.answer.idea = e.target.value;
                            })
                          }
                        />
                        <div className="card-footer">
                          <span className="box-count">
                            {data.answer.bounding_boxes.length} diagnostic{" "}
                            {data.answer.bounding_boxes.length === 1
                              ? "box"
                              : "boxes"}
                          </span>
                          <button
                            onClick={() => {
                              setTarget("solution");
                              setTool("draw");
                              setShowBoxes(true);
                            }}
                          >
                            <Plus />
                            Add box
                          </button>
                        </div>
                      </div>
                      {chosen && (
                        <div className="box-properties">
                          <p>
                            Selected box{" "}
                            <span className="muted">· original pixels</span>
                          </p>
                          <div className="coord-grid">
                            {(["x", "y", "width", "height"] as const).map(
                              (k) => (
                                <label key={k}>
                                  {k}
                                  <input
                                    aria-label={`Box ${k}`}
                                    type="number"
                                    step="0.1"
                                    value={
                                      Math.round(chosen.box[k] * 100) / 100
                                    }
                                    onChange={(e) => {
                                      const n = Number(e.target.value);
                                      if (Number.isFinite(n))
                                        writeBox(
                                          clampBox(
                                            { ...chosen.box, [k]: n },
                                            data.image.width,
                                            data.image.height,
                                          ),
                                          chosen.target,
                                        );
                                    }}
                                  />
                                </label>
                              ),
                            )}
                          </div>
                          <button className="danger-link" onClick={removeBox}>
                            <Trash2 />
                            Delete box
                          </button>
                        </div>
                      )}
                      <div className="inspector-footer">
                        <span>
                          {totalBoxes} {totalBoxes === 1 ? "region" : "regions"}{" "}
                          annotated
                        </span>
                        <button
                          className="danger-link"
                          onClick={() => setDeleteKind("item")}
                        >
                          <Trash2 />
                          Delete item
                        </button>
                      </div>
                    </div>
                  </TabsContent>
                  <TabsContent value="details">
                    <div className="inspector-body metadata-grid">
                      <div className="section-head">
                        <Info />
                        Item details
                      </div>
                      <p>
                        Original contributor
                        <br />
                        <b>{data.contributor.name || "Not specified"}</b>
                      </p>
                      <p>
                        Filename
                        <br />
                        <span className="mono">json/{current!.key}</span>
                      </p>
                      <p>
                        Image
                        <br />
                        <span className="mono">{data.image.path}</span>
                      </p>
                      <p>
                        Category
                        <br />
                        {String(data.category ?? "Not specified")}
                      </p>
                      <p>
                        Difficulty
                        <br />
                        {String(data.difficulty ?? "Not specified")}
                      </p>
                      <p>
                        Source
                        <br />
                        {typeof (data.source as any)?.url === "string" &&
                        /^https?:\/\//.test((data.source as any).url) ? (
                          <a
                            href={(data.source as any).url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open original source ↗
                          </a>
                        ) : (
                          "Not specified"
                        )}
                      </p>
                      <p>
                        Your edits will be attributed to{" "}
                        <b>{name || "your profile"}</b> on export. Unedited
                        records retain their contributor.
                      </p>
                      <details>
                        <summary style={{ fontSize: 12, cursor: "pointer" }}>
                          View JSON
                        </summary>
                        <pre className="raw-answer">
                          {JSON.stringify(data, null, 2)}
                        </pre>
                      </details>
                    </div>
                  </TabsContent>
                </Tabs>
              </aside>
            </div>
          )}
          <footer className="footerbar">
            <span>
              <kbd>←</kbd>
              <kbd>→</kbd> Navigate <kbd>B</kbd> Draw box <kbd>V</kbd> Select
            </span>
            <span>
              {demo
                ? "Sample data · illustrative model answers"
                : durable.workspaceId
                  ? "Persistent drafts · source files stay untouched"
                  : "Browser session · export to keep your changes"}
            </span>
          </footer>
        </main>
      </div>
      <Dialog
        open={setup}
        onOpenChange={(v) => {
          if (!v && initialized) {
            const error = validateIdentity();
            if (error) setSetupError(error);
            else setSetup(false);
          }
        }}
      >
        <DialogContent
          className="setup-dialog"
          showCloseButton={initialized}
          onInteractOutside={(e) => {
            // The mounted-folder picker is a nested dialog. Keep the setup
            // dialog modal, but allow pointer/focus interaction with the
            // nested browser rendered in its portal.
            const target = e.target as HTMLElement | null;
            if (!initialized && !target?.closest('[data-slot="dialog-content"]'))
              e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (!initialized) e.preventDefault();
          }}
        >
          <div className="setup-layout">
            <div className="setup-aside">
              <div className="brand">
                <span className="brandmark">
                  <Scan />
                </span>
                <div>
                  <strong>PlotTwist</strong>
                  <small>DATASET STUDIO</small>
                </div>
              </div>
              <h2>
                A closer look.
                <br />
                <em>A better dataset.</em>
              </h2>
              <p>
                Your workspace for visual riddles, misleading clues, and
                evidence that matters.
              </p>
              <div className="setup-steps">
                <span className={step === 1 ? "active" : ""}>
                  <b>{step > 1 ? <Check size={13} /> : "1"}</b>Your annotator
                  profile
                </span>
                <span className={step === 2 ? "active" : ""}>
                  <b>2</b>Connect your folders
                </span>
              </div>
              <small>Built for careful, human review.</small>
            </div>
            <div className="setup-main">
              <span className="step-label">STEP {step} OF 2</span>
              <DialogTitle>
                {step === 1 ? "Make your mark." : "Open your workspace."}
              </DialogTitle>
              <DialogDescription className="intro">
                {step === 1
                  ? "Add your name and OpenReview profile so your contributions stay connected to you."
                  : apiAvailable
                    ? "Select the dataset, model outputs, and export destination on your computer."
                    : "Select the dataset and model-response folders on your computer."}
              </DialogDescription>
              {step === 1 ? (
                <>
                  <label className="field">
                    <span>Your name</span>
                    <input
                      autoComplete="name"
                      aria-label="Your name"
                      className="text-input"
                      placeholder="e.g. Ali Sadafi"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>OpenReview profile</span>
                    <input
                      aria-label="OpenReview profile"
                      className="text-input"
                      placeholder="https://openreview.net/profile?id=~Your_Name1"
                      value={openReview}
                      onChange={(e) => setOpenReview(e.target.value)}
                    />
                  </label>
                  <p className="micro">
                    A profile link or an ID such as ~Your_Name1 works.
                    <br />
                    This identifies your edits; it is not an account sign-in.
                  </p>
                </>
              ) : apiAvailable ? (
                <>
                  <input
                    ref={datasetInput}
                    type="file"
                    {...folderProps}
                    multiple
                    hidden
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      if (files.length) void importDataset(files);
                      e.target.value = "";
                    }}
                  />
                  <input
                    ref={outputInput}
                    type="file"
                    {...folderProps}
                    multiple
                    hidden
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []).filter(
                        (f) => f.name.toLowerCase().endsWith(".jsonl"),
                      );
                      setResponseFiles(files);
                      if (files.length) void loadResponseFolder(files);
                      setResponseName(
                        files[0]?.webkitRelativePath.split("/")[0] || "",
                      );
                      if (!files.length)
                        setSetupError("No JSONL files were found in that folder.");
                      e.target.value = "";
                    }}
                  />
                  <button
                    className="folder-picker local-folder-picker"
                    onClick={() => datasetInput.current?.click()}
                    disabled={busy}
                  >
                    <FolderOpen />
                    <span>
                      <strong>Browse local dataset folder</strong>
                      <small>Any folder with images/ and json/ · browser session only</small>
                    </span>
                    <span className="folder-browse-action">Browse</span>
                  </button>
                  <button
                    className="folder-picker local-folder-picker"
                    aria-label="Browse local model outputs"
                    onClick={() => outputInput.current?.click()}
                    disabled={busy}
                  >
                    <MessageSquare />
                    <span>
                      <strong>
                        {responseName || "Browse local model outputs"}
                      </strong>
                      <small>
                        {responseFiles.length
                          ? `${responseFiles.length} model JSONL files · browser session only`
                          : "One or more .jsonl files · browser session only"}
                      </small>
                    </span>
                    <span className="folder-browse-action">Browse</span>
                    {responseFiles.length > 0 && (
                      <CheckCircle2 className="folder-check" />
                    )}
                  </button>
                  <button
                    className="folder-picker local-folder-picker"
                    aria-label="Browse local export destination"
                    onClick={() => void browseLocalExportDirectory()}
                    disabled={busy}
                  >
                    <FolderOpen />
                    <span>
                      <strong>
                        {localExportName || "Browse local export destination"}
                      </strong>
                      <small>
                        {localExportName
                          ? "Selected for direct folder export"
                          : "Optional · choose a new, empty folder"}
                      </small>
                    </span>
                    <span className="folder-browse-action">Browse</span>
                    {localExportName && (
                      <CheckCircle2 className="folder-check" />
                    )}
                  </button>
                  {responseFiles.length > 0 && (
                    <label className="field">
                      <span>JSONL field identifying the image</span>
                      <input
                        className="text-input mono"
                        aria-label="Response matching field"
                        value={mappingField}
                        onChange={(e) => setMappingField(e.target.value)}
                        placeholder="image.path"
                      />
                      <small className="micro">
                        Use a field such as image.path, image_id, or item_id.
                        Row order is never used.
                      </small>
                    </label>
                  )}
                  {pendingItems && localMode && (
                    <p className="micro">
                      {pendingItems.length} local pairs loaded. These edits stay
                      in this browser session and are not durable Docker drafts.
                    </p>
                  )}
                  <div className="or">or try the demo</div>
                  <button
                    className="btn light"
                    onClick={() => void enterWorkspace(true)}
                    disabled={busy}
                  >
                    <Scan />
                    Explore demo dataset
                    <ArrowRight />
                  </button>
                </>
              ) : (
                <>
                  <input
                    ref={datasetInput}
                    type="file"
                    {...folderProps}
                    multiple
                    hidden
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      if (files.length) void importDataset(files);
                      e.target.value = "";
                    }}
                  />
                  <input
                    ref={outputInput}
                    type="file"
                    {...folderProps}
                    multiple
                    hidden
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []).filter(
                        (f) => f.name.toLowerCase().endsWith(".jsonl"),
                      );
                      setResponseFiles(files);
                      if (!demo && files.length) void loadResponseFolder(files);
                      setResponseName(
                        files[0]?.webkitRelativePath.split("/")[0] || "",
                      );
                      if (!files.length)
                        setSetupError(
                          "No JSONL files were found in that folder.",
                        );
                      e.target.value = "";
                    }}
                  />
                  <button
                    className="folder-picker"
                    onClick={() => datasetInput.current?.click()}
                    disabled={busy}
                  >
                    <FolderOpen />
                    <span>
                      <strong>
                        {pendingItems ? datasetName : "Select dataset folder"}
                      </strong>
                      <small>
                        {pendingItems
                          ? `${pendingItems.length} validated image / JSON pairs`
                          : "Contains images/ and json/"}
                      </small>
                    </span>
                    {pendingItems && <CheckCircle2 className="folder-check" />}
                  </button>
                  <button
                    className="folder-picker"
                    aria-label="Browse for model output folder"
                    onClick={() => outputInput.current?.click()}
                    disabled={busy}
                  >
                    <MessageSquare />
                    <span>
                      <strong>
                        {responseName || "Browse local model outputs"}
                      </strong>
                      <small>
                        {responseFiles.length
                          ? `${responseFiles.length} model JSONL files`
                          : "Optional · one .jsonl file per model"}
                      </small>
                    </span>
                    <span className="folder-browse-action">Browse</span>
                    {responseFiles.length > 0 && (
                      <CheckCircle2 className="folder-check" />
                    )}
                  </button>
                  <button
                    className="folder-picker"
                    aria-label="Browse for export destination folder"
                    onClick={() => void browseLocalExportDirectory()}
                    disabled={busy}
                  >
                    <FolderOpen />
                    <span>
                      <strong>
                        {localExportName || "Browse local export destination"}
                      </strong>
                      <small>
                        {localExportName
                          ? "Selected for direct folder export"
                          : "Optional · choose a new, empty folder"}
                      </small>
                    </span>
                    <span className="folder-browse-action">Browse</span>
                    {localExportName && (
                      <CheckCircle2 className="folder-check" />
                    )}
                  </button>
                  {responseFiles.length > 0 && (
                    <label className="field">
                      <span>JSONL field identifying the image</span>
                      <input
                        className="text-input mono"
                        aria-label="Response matching field"
                        value={mappingField}
                        onChange={(e) => setMappingField(e.target.value)}
                        placeholder="image.path"
                      />
                      <small className="micro">
                        Use a field such as image.path, image_id, or item_id.
                        Row order is never used.
                      </small>
                    </label>
                  )}
                  <p className="micro">
                    Files stay in this browser session. Export your edits to a
                    new folder or ZIP when you’re ready.
                  </p>
                  <div className="or">or try it first</div>
                  <button
                    className="btn light"
                    onClick={() => void enterWorkspace(true)}
                    disabled={busy}
                  >
                    <Scan />
                    Explore demo dataset
                    <ArrowRight />
                  </button>
                </>
              )}
              {setupError && (
                <p className="error" role="alert">
                  {setupError}
                </p>
              )}
              <div className="setup-next">
                {step === 2 && (
                  <button
                    className="btn ghost"
                    onClick={() => {
                      setStep(1);
                      setSetupError("");
                    }}
                  >
                    <ChevronLeft />
                    Back
                  </button>
                )}
                <button
                  className="btn primary"
                  disabled={
                    busy ||
                    apiChecking ||
                    (step === 2 && !apiAvailable && !pendingItems)
                  }
                  onClick={() =>
                    step === 1 ? nextStep() : void enterWorkspace()
                  }
                >
                  {busy
                    ? "Reading files…"
                    : step === 1
                      ? "Continue"
                      : apiAvailable
                        ? "Open mounted dataset"
                        : "Open dataset"}
                  <ArrowRight />
                </button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Sheet open={compare} onOpenChange={setCompare}>
        <SheetContent className="comparison-drawer">
          <SheetHeader>
            <span className="eyebrow">MODEL RESPONSE REVIEW</span>
            <SheetTitle>Different models. Same riddle.</SheetTitle>
            <SheetDescription>
              {data?.problem} · {data?.image.path.split("/").pop()}
            </SheetDescription>
          </SheetHeader>
          <div className="answer-summary">
            <span>
              Reference answer <b>{data?.answer.option ?? "—"}</b>
            </span>
            <span>
              {currentResponses.filter(matchesReference).length} /{" "}
              {currentResponses.length} match exactly
            </span>
          </div>
          {demo ? (
            <p className="compare-note">
              Illustrative responses for UI demonstration. These are not
              benchmark results.
            </p>
          ) : durable.workspaceId ? (
            <>
              <ResponseImport
                workspaceId={durable.workspaceId}
                onAccepted={() => setResponseReload((r) => r + 1)}
              />
              {responseReport?.result && (
                <p className="compare-note">
                  Accepted import: {String(responseReport.result.matched)}{" "}
                  matched · {String(responseReport.result.unmatched)} unmatched
                  · {String(responseReport.result.ambiguous)} ambiguous.
                  Repeated trials are kept.
                </p>
              )}
              {current?.originalProblem !== data?.problem && (
                <p className="error">
                  The question has been edited since the source dataset. These
                  responses belong to the original question:{" "}
                  {current?.originalProblem}
                </p>
              )}
              {responseLoading && <p className="micro">Loading responses…</p>}
              {responseErrors.map((error, i) => (
                <p key={i} className="error">
                  {error}
                </p>
              ))}
            </>
          ) : (
            <>
              <label className="field">
                <span>Image matching field in your JSONL</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    className="text-input mono"
                    aria-label="Compare matching field"
                    value={mappingField}
                    onChange={(e) => setMappingField(e.target.value)}
                  />
                  <button
                    className="btn"
                    onClick={() => void parseFiles(responseFiles, mappingField)}
                  >
                    Apply
                  </button>
                </div>
              </label>
              {loadedResponses && (
                <p className="compare-note">
                  {responses.length} parsed rows ·{" "}
                  {
                    responses.filter(
                      (r) => !resolveResponseKey(items, r.matchKey),
                    ).length
                  }{" "}
                  unmatched or ambiguous · {responseErrors.length} invalid rows.
                  Repeated responses are shown separately.
                </p>
              )}
              {responseErrors.length > 0 && (
                <details className="error">
                  <summary>Import issues</summary>
                  {responseErrors.map((e, i) => (
                    <p key={i}>{e}</p>
                  ))}
                </details>
              )}
            </>
          )}
          {currentResponses.length === 0 && (
            <div className="empty-state" style={{ height: 180 }}>
              <MessageSquare size={28} />
              <p>No matched model responses for this item.</p>
              <small>
                {demo
                  ? "The demo responses belong to 020.jpg."
                  : durable.workspaceId
                    ? "Use the import panel above to preview and accept a response mapping."
                    : "Choose output files in workspace settings and check the matching field."}
              </small>
            </div>
          )}
          {currentResponses.map((response, i) => (
            <article
              className="model-card"
              key={`${response.filename}-${response.line}-${i}`}
            >
              <div className="model-header">
                <Logo name={response.model + response.filename} />
                <div>
                  <strong>{response.model}</strong>
                  <small>
                    {demo
                      ? response.filename
                      : `${response.filename} · line ${response.line}`}
                  </small>
                </div>
                <span
                  className={`answer-badge ${matchesReference(response) ? "correct" : ""}`}
                >
                  {matchesReference(response) ? (
                    <Check size={12} />
                  ) : response.answer ? (
                    <X size={12} />
                  ) : (
                    <Info size={12} />
                  )}{" "}
                  {response.answer || "Unparsed"}
                </span>
              </div>
              <p className="model-reason">
                {response.reasoning ||
                  "No single reasoning block was found. Review the raw response below."}
              </p>
              {response.parseStatus === "out_of_choices" && (
                <p className="error">
                  The supplied answer is not an exact choice key.
                </p>
              )}
              {response.malformed && (
                <p className="error">
                  Expected one complete &lt;answer&gt; block. No answer was
                  inferred.
                </p>
              )}
              <details>
                <summary>View raw response</summary>
                <pre className="raw-answer">{response.text}</pre>
              </details>
            </article>
          ))}
          {durable.workspaceId && responseTotal > serverResponses.length && (
            <button
              className="btn"
              disabled={responseLoading}
              onClick={() => void moreResponses()}
            >
              Load more responses ({serverResponses.length} / {responseTotal})
            </button>
          )}
          <p className="compare-note">
            Answers are compared with the exact choice key. Model text is
            displayed as supplied and is never used to overwrite annotations.
          </p>
        </SheetContent>
      </Sheet>
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="export-dialog">
          <DialogTitle>Export your reviewed dataset</DialogTitle>
          <DialogDescription>
            Keep the same JSON structure and original image files in a separate
            directory.
          </DialogDescription>
          <label className="field">
            <span>Export folder name</span>
            <input
              className="text-input"
              value={exportName}
              onChange={(e) => setExportName(e.target.value)}
              aria-label="Export folder name"
            />
          </label>
          <div className="export-info">
            <b>{visible.length} items</b> included ·{" "}
            {items.filter((i) => i.deleted).length} excluded
            <br />
            <span className="mono">
              {exportName}/images/
              <br />
              {exportName}/json/
            </span>
            <br />
            {changed} edited or excluded in this session. Edited records use the
            contributor who last edited them.
          </div>
          {durable.workspaceId ? (
            <p className="compare-note">
              A complete dataset is written to{" "}
              <code>
                {mountedExports === "." ? "exports/" : mountedExports + "/"}
              </code>
              . Source files remain read-only. The final directory appears only
              after all files pass validation.
            </p>
          ) : (
            <p className="compare-note">
              ZIP is supported across browsers. Direct folder export requires a
              supported browser and a new, empty folder. Your source files stay
              untouched.
            </p>
          )}
          {exportError && (
            <p className="error" role="alert">
              {exportError}
            </p>
          )}
          {durable.workspaceId ? (
            <div className="export-actions">
              {serverExport && (
                <p className="micro">
                  {serverExport.progress} / {serverExport.total} items ·{" "}
                  {serverExport.status}
                </p>
              )}
              {serverExport?.status === "succeeded" ? (
                <>
                  <p className="connection-note">
                    <CheckCircle2 size={16} /> Export complete:{" "}
                    {String(serverExport.result?.destination)}
                  </p>
                  <a
                    className="btn primary"
                    href={`/api/workspaces/${durable.workspaceId}/exports/${serverExport.id}/download`}
                  >
                    <Download />
                    Download exported dataset ZIP
                  </a>
                </>
              ) : (
                <>
                  <button
                    className="btn primary"
                    disabled={exporting || !visible.length || !!durable.error}
                    onClick={() => void exportOnServer()}
                  >
                    <FolderOpen />
                    {exporting ? "Exporting…" : "Export to mounted folder"}
                  </button>
                  {exporting &&
                    serverExport &&
                    serverExport.status !== "publishing" && (
                      <button
                        className="btn"
                        onClick={() =>
                          void api(
                            `/workspaces/${durable.workspaceId}/jobs/${serverExport.id}/cancel`,
                            { method: "POST" },
                          ).catch((e) => toast.error(e.message))
                        }
                      >
                        Cancel export
                      </button>
                    )}
                </>
              )}
            </div>
          ) : (
            <div className="export-actions">
              <button
                className="btn primary"
                disabled={exporting || !visible.length}
                onClick={() => void doExport()}
              >
                <Download />
                {exporting ? "Preparing export…" : "Download dataset ZIP"}
              </button>
              <button
                className="btn"
                disabled={exporting || !visible.length}
                onClick={() => void doExport(true)}
              >
                <FolderOpen />
                Write to an empty folder
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={excludeList} onOpenChange={setExcludeList}>
        <DialogContent>
          <DialogTitle>Excluded items</DialogTitle>
          <DialogDescription>
            Restore an item to include it in the next export.
          </DialogDescription>
          {items
            .filter((i) => i.deleted)
            .map((item) => (
              <div key={item.key} className="folder-picker">
                <span>
                  <strong>{item.key}</strong>
                  <small>{item.data.problem}</small>
                </span>
                <button
                  className="btn"
                  style={{ marginLeft: "auto" }}
                  onClick={() => {
                    history.current.push(structuredClone(item));
                    replaceItem({ ...item, deleted: false });
                    setActiveKey(item.key);
                  }}
                >
                  Restore
                </button>
              </div>
            ))}
          {!items.some((i) => i.deleted) && (
            <p className="micro">No excluded items.</p>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={switchPending !== null}
        onOpenChange={(v) => {
          if (!v) setSwitchPending(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace this editing session?</AlertDialogTitle>
            <AlertDialogDescription>
              Your current session has edits. Export them first if you want to
              keep them. Opening another dataset or restarting the demo clears
              these session edits.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const value = switchPending;
                setSwitchPending(null);
                if (value !== null) void enterWorkspace(value, true);
              }}
            >
              Replace session
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={!!deleteKind}
        onOpenChange={(v) => {
          if (!v) setDeleteKind(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteKind === "item"
                ? "Exclude this item from the dataset?"
                : "Delete this deception?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteKind === "item"
                ? "The image and its JSON will be omitted from your export. Your source files are kept. You can undo this during the session."
                : "This removes the deception and all of its bounding boxes. The single reference solution is kept. You can undo this during the session."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={performDelete}>
              {deleteKind === "item" ? "Exclude item" : "Delete deception"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Toaster position="bottom-center" />
    </TooltipProvider>
  );
}
