/**
 * Pure model transitions (Requirement 10). `applyAction(project, action)` returns
 * a NEW `ProjectSchema`-valid project, or the UNCHANGED input when the action
 * would produce an invalid project (callers surface an inline error via UI
 * state). No DOM, no clock, no randomness.
 *
 * Every candidate result is re-validated with `ProjectSchema.safeParse` so the
 * invariant "a valid project in yields a valid project out, or no change" holds
 * for any action (Property 1).
 */

import { ProjectSchema, type Project, type TextLayer } from "@studio/engine";

import type { Action } from "./actions.js";
import { makeDefaultLayer, nextLayerId, defaultEffectInstance } from "./project.js";

/** Returns `candidate` if it is schema-valid, else the original `project`. */
function commit(project: Project, candidate: Project): Project {
  const result = ProjectSchema.safeParse(candidate);
  return result.success ? result.data : project;
}

/** Replaces the layer with `id` via `fn`; no-op if the id is absent. */
function mapLayer(project: Project, id: string, fn: (l: TextLayer) => TextLayer): Project {
  let found = false;
  const layers = project.layers.map((l) => {
    if (l.id !== id) return l;
    found = true;
    return fn(l);
  });
  if (!found) return project;
  return { ...project, layers };
}

/** Applies one action, returning a valid project or the unchanged input. */
export function applyAction(project: Project, action: Action): Project {
  switch (action.type) {
    case "set-canvas-size":
      return commit(project, { ...project, canvas: { ...project.canvas, width: action.width, height: action.height } });
    case "set-fps":
      return commit(project, { ...project, canvas: { ...project.canvas, fps: action.fps } });
    case "set-duration":
      return commit(project, { ...project, canvas: { ...project.canvas, durationSeconds: action.durationSeconds } });
    case "set-background":
      return commit(project, { ...project, background: action.background });
    case "set-transparent":
      return commit(project, { ...project, background: action.transparent ? "transparent" : "#000000" });

    case "add-layer": {
      const id = nextLayerId(project);
      const layer = makeDefaultLayer(id, project.canvas.durationSeconds);
      return commit(project, { ...project, layers: [...project.layers, layer] });
    }
    case "delete-layer":
      return commit(project, { ...project, layers: project.layers.filter((l) => l.id !== action.id) });
    case "reorder-layer": {
      const from = project.layers.findIndex((l) => l.id === action.id);
      if (from < 0) return project;
      const to = Math.max(0, Math.min(project.layers.length - 1, action.toIndex));
      if (to === from) return project;
      const layers = [...project.layers];
      const [moved] = layers.splice(from, 1);
      layers.splice(to, 0, moved);
      return commit(project, { ...project, layers });
    }
    case "set-text":
      return commit(project, mapLayer(project, action.id, (l) => ({ ...l, text: action.text })));
    case "set-font-family":
      return commit(project, mapLayer(project, action.id, (l) => ({ ...l, fontFamily: action.fontFamily })));
    case "set-font-size":
      return commit(project, mapLayer(project, action.id, (l) => ({ ...l, fontSize: action.fontSize })));
    case "set-font-weight":
      return commit(project, mapLayer(project, action.id, (l) => ({ ...l, fontWeight: action.fontWeight })));
    case "set-fill":
      return commit(project, mapLayer(project, action.id, (l) => ({ ...l, fill: action.fill })));
    case "set-align":
      return commit(project, mapLayer(project, action.id, (l) => ({ ...l, align: action.align })));
    case "set-anchor": {
      // Same reference when nothing changes, so "unchanged" is detectable with !== and
      // a no-op gesture or key press adds no undo step (Requirement 16.15).
      const cur = project.layers.find((l) => l.id === action.id);
      if (cur && cur.anchor.x === action.x && cur.anchor.y === action.y) return project;
      return commit(project, mapLayer(project, action.id, (l) => ({ ...l, anchor: { x: action.x, y: action.y } })));
    }
    case "set-layer-timing": {
      const cur = project.layers.find((l) => l.id === action.id);
      if (cur && cur.startSeconds === action.startSeconds && cur.endSeconds === action.endSeconds) return project;
      return commit(project, mapLayer(project, action.id, (l) => ({ ...l, startSeconds: action.startSeconds, endSeconds: action.endSeconds })));
    }

    case "add-effect":
      return commit(project, mapLayer(project, action.layerId, (l) => ({
        ...l,
        effectInstances: [...l.effectInstances, safeEffect(action.effectId)].filter(Boolean) as TextLayer["effectInstances"],
      })));
    case "set-effect-granularity":
      return commit(project, mapLayer(project, action.layerId, (l) => ({
        ...l,
        effectInstances: l.effectInstances.map((e, i) => (i === action.index ? { ...e, granularity: action.granularity } : e)),
      })));
    case "set-effect-param":
      return commit(project, mapLayer(project, action.layerId, (l) => ({
        ...l,
        effectInstances: l.effectInstances.map((e, i) =>
          i === action.index ? { ...e, params: { ...e.params, [action.key]: action.value } } : e,
        ),
      })));
    case "remove-effect":
      return commit(project, mapLayer(project, action.layerId, (l) => ({
        ...l,
        effectInstances: l.effectInstances.filter((_, i) => i !== action.index),
      })));

    default: {
      // Exhaustiveness: a new action type must be handled above.
      const _never: never = action;
      void _never;
      return project;
    }
  }
}

/** Builds a default effect instance, or null if the id is unknown (rejected). */
function safeEffect(effectId: string): TextLayer["effectInstances"][number] | null {
  try {
    return defaultEffectInstance(effectId);
  } catch {
    return null;
  }
}
