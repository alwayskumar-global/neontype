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

import { builtinRegistry, ProjectSchema, type Project, type TextLayer } from "@studio/engine";

import type { Action } from "./actions.js";
import { deepEqualJson } from "./json-equal.js";
import { makeDefaultLayer, nextLayerId, defaultEffectInstance } from "./project.js";

/**
 * Validates `candidate` and decides which reference to return:
 *  - invalid                      -> the original `project` (unchanged);
 *  - result equals `project`      -> the original `project` (a no-op keeps the SAME
 *                                    reference, so history adds no step);
 *  - otherwise                    -> `candidate` itself, so untouched subtrees stay
 *                                    shared with `project` (structural sharing,
 *                                    Requirement 16.7), UNLESS parsing changed it
 *                                    (e.g. a filled default), in which case the
 *                                    parsed copy is returned so defaults are never
 *                                    silently dropped.
 * Exported for tests only.
 */
export function commit(project: Project, candidate: Project): Project {
  const result = ProjectSchema.safeParse(candidate);
  if (!result.success) return project;
  const next = deepEqualJson(result.data, candidate) ? candidate : result.data;
  return deepEqualJson(next, project) ? project : next;
}

/**
 * Why a param edit is not acceptable (Requirement 4.5), or null when it is. The edited key must already exist on the
 * instance, and the effect's own param schema (the engine's `paramSchema`, through the public registry) must not
 * report an issue caused by the edit: one on the edited key, or a whole-object issue when the params were valid
 * before. An issue on ANOTHER key, which the edit did not cause, does not block it. An effect the registry does not
 * know is not checked here (the engine reports it at render time). The message names the key and carries the schema's
 * own text.
 */
export function paramEditIssue(effectId: string, prev: Record<string, unknown>, key: string, value: unknown): string | null {
  if (!Object.hasOwn(prev, key)) return `${key}: this effect has no such parameter`;
  const def = builtinRegistry.get(effectId);
  if (!def) return null;
  const result = def.paramSchema.safeParse({ ...prev, [key]: value });
  if (result.success) return null;
  const prevOk = def.paramSchema.safeParse(prev).success;
  const issue = result.error.issues.find((i) => (i.path.length === 0 ? prevOk : i.path[0] === key));
  return issue === undefined ? null : `${key}: ${issue.message}`;
}
/** Whether a param edit is acceptable (see `paramEditIssue`). Exported for tests only. */
export function paramEditAllowed(effectId: string, prev: Record<string, unknown>, key: string, value: unknown): boolean {
  return paramEditIssue(effectId, prev, key, value) === null;
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
    case "set-effect-param": {
      const inst = project.layers.find((l) => l.id === action.layerId)?.effectInstances[action.index];
      // A rejected edit returns the SAME reference, like a project-schema rejection, so history is untouched.
      if (inst && !paramEditAllowed(inst.effectId, inst.params, action.key, action.value)) return project;
      return commit(project, mapLayer(project, action.layerId, (l) => ({
        ...l,
        effectInstances: l.effectInstances.map((e, i) =>
          i === action.index ? { ...e, params: { ...e.params, [action.key]: action.value } } : e,
        ),
      })));
    }
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
