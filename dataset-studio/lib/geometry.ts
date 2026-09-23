import { clampBox, type Box } from "./dataset.ts";
export type Point = { x: number; y: number };
export type DragState = {
  mode: "draw" | "move" | "resize";
  start: Point;
  original?: Box;
  target: string;
  corner?: "nw" | "ne" | "sw" | "se";
};
export function nativePoint(
  client: Point,
  rect: { left: number; top: number; width: number; height: number },
  width: number,
  height: number,
): Point {
  return {
    x: Math.max(
      0,
      Math.min(width, ((client.x - rect.left) / rect.width) * width),
    ),
    y: Math.max(
      0,
      Math.min(height, ((client.y - rect.top) / rect.height) * height),
    ),
  };
}
export function dragBox(
  drag: DragState,
  p: Point,
  width: number,
  height: number,
): Box {
  const dx = p.x - drag.start.x,
    dy = p.y - drag.start.y;
  if (drag.mode === "draw")
    return {
      box_id: "preview",
      x: Math.min(p.x, drag.start.x),
      y: Math.min(p.y, drag.start.y),
      width: Math.abs(dx),
      height: Math.abs(dy),
    };
  const old = drag.original!;
  if (drag.mode === "move")
    return clampBox({ ...old, x: old.x + dx, y: old.y + dy }, width, height);
  const corner = drag.corner ?? "se";
  const left = corner.includes("w")
    ? Math.max(0, Math.min(old.x + old.width - 1, old.x + dx))
    : old.x;
  const right = corner.includes("e")
    ? Math.min(width, Math.max(old.x + 1, old.x + old.width + dx))
    : old.x + old.width;
  const top = corner.includes("n")
    ? Math.max(0, Math.min(old.y + old.height - 1, old.y + dy))
    : old.y;
  const bottom = corner.includes("s")
    ? Math.min(height, Math.max(old.y + 1, old.y + old.height + dy))
    : old.y + old.height;
  return { ...old, x: left, y: top, width: right - left, height: bottom - top };
}
