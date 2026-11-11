/**
 * Design-source converter, stages (g) and (h): the JSX emitter and asset references.
 *
 * Output rules (also enforced by dc-convert-lib after emission): no `style=` attribute or prop, no
 * dangerouslySetInnerHTML, no <script>/<style>. Dynamic styles are classes that read CSS custom
 * properties set from a ref callback (`dcVars`). Bindings use the runtime helpers of
 * src/ds/dc-runtime.ts; handlers are narrowed with `asHandler`, never cast.
 */
import { DcConvertError, parseBindings, parseWholeValue } from "./dc-parse.mjs";

export const DS_NAMESPACE = "MotionTextStudioDesignSystem_f5b901";

const EVENT_ATTRS = new Set(["onClick", "onChange", "onInput", "onKeyDown", "onPointerDown", "onMouseEnter", "onMouseLeave", "onFocus", "onBlur"]);
const BOOL_ATTRS = new Set(["disabled", "checked", "hidden", "readOnly", "required"]);
const PLAIN_ATTRS = new Set([
  "id", "htmlFor", "role", "title", "alt", "href", "type", "name", "placeholder", "rel", "value",
  "d", "x", "y", "cx", "cy", "r", "rx", "width", "height", "fill", "stroke", "viewBox", "preserveAspectRatio",
  "strokeWidth", "strokeLinecap", "strokeLinejoin", "strokeDasharray",
]);
const RENAME = {
  class: "className", for: "htmlFor", tabindex: "tabIndex",
  "stroke-width": "strokeWidth", "stroke-linecap": "strokeLinecap", "stroke-linejoin": "strokeLinejoin", "stroke-dasharray": "strokeDasharray",
};
const ARIA_TRISTATE = new Set(["aria-checked", "aria-pressed"]);
const ARIA_BOOLEANISH = new Set(["aria-hidden", "aria-selected", "aria-busy", "aria-modal", "aria-expanded", "aria-disabled"]);
const ARIA_NUMBER = new Set(["aria-valuenow", "aria-valuemin", "aria-valuemax"]);
const ARIA_STRING = new Set(["aria-label", "aria-labelledby", "aria-describedby", "aria-live"]);

/** x-import prop tables: source attribute -> [prop name, kind]. Kinds are checked against all five files by a test. */
const XI = {
  Button: { "aria-label": ["aria-label", "string"], disabled: ["disabled", "boolean"], icon: ["icon", "string"], "icon-right": ["iconRight", "string"], "on-click": ["onClick", "handler"], size: ["size", "enum"], title: ["title", "string"], variant: ["variant", "enum"] },
  Chip: { pressed: ["pressed", "boolean"], "on-toggle": ["onToggle", "handler"] },
  CodeBlock: { code: ["code", "string"], label: ["label", "string"], language: ["language", "string"] },
  Icon: { "data-variant": ["data-variant", "string"], name: ["name", "requiredString"], label: ["label", "string"], size: ["size", "number"] },
  IconButton: { icon: ["icon", "requiredString"], label: ["label", "requiredString"], "on-click": ["onClick", "handler"], shortcut: ["shortcut", "string"], size: ["size", "enum"], tooltip: ["tooltip", "boolean"] },
  NumberScrub: { "aria-label": ["ariaLabel", "string"], label: ["label", "string"], max: ["max", "number"], min: ["min", "number"], "on-change": ["onChange", "handler"], precision: ["precision", "number"], step: ["step", "number"], unit: ["unit", "string"], value: ["value", "number"] },
  ProgressBar: { detail: ["detail", "string"], label: ["label", "string"], value: ["value", "number"] },
  SegmentedControl: { block: ["block", "boolean"], label: ["label", "requiredString"], "on-change": ["onChange", "handler"], options: ["options", "options"], value: ["value", "string"] },
  Select: { label: ["label", "requiredString"], "on-change": ["onChange", "handler"], options: ["options", "options"], value: ["value", "string"], width: ["width", "string"] },
  Slider: { format: ["format", "handler"], label: ["label", "requiredString"], max: ["max", "number"], min: ["min", "number"], "on-change": ["onChange", "handler"], step: ["step", "number"], value: ["value", "number"] },
  Toast: { action: ["action", "action"], "on-close": ["onClose", "handler"], title: ["title", "requiredString"], variant: ["variant", "enum"] },
  Toggle: { checked: ["checked", "boolean"], label: ["label", "requiredString"], "on-change": ["onChange", "handler"], "show-state": ["showState", "boolean"] },
};
export const DS_COMPONENTS = Object.keys(XI).sort();
/** Components that accept a static `style` converted to `className`. */
const XI_CLASSNAME = new Set(["Button", "Icon", "IconButton"]);

const jsonStr = (s) => JSON.stringify(s).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
const esc = (s) => s;

/** A JSX attribute string value: plain quotes when safe, else an expression container. */
function attrString(value) {
  return /^[^"&\\\n\r\u2028\u2029{}<>]*$/.test(value) ? `"${value}"` : `{${jsonStr(value)}}`;
}

const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

export function pascalCase(name) {
  return name.split(/[^A-Za-z0-9]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join("");
}
export function slugOf(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
const imageIdent = (base) => {
  const id = camel(base.replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9-]/g, "-"));
  return /^[A-Za-z_]/.test(id) ? id : `img${id}`;
};

/**
 * Emits the component. Returns { jsx, usedRuntime, usedDs, usedFragment, imports, bindings, backdropUsed,
 * notForwarded, notApplied }.
 */
export function emitJsx(root, { file, slug, styles, assets }) {
  const usedRuntime = new Set();
  const usedDs = new Set();
  const bindings = new Set();
  const imports = new Map(); // ident -> relative path
  const notForwarded = new Set();
  const notApplied = new Set();
  let usedFragment = false;
  let backdropUsed = false;

  const fail = (msg, line) => {
    throw new DcConvertError(msg, file, line);
  };
  const rt = (name) => {
    usedRuntime.add(name);
    return name;
  };

  const getExpr = (b, ctx) => {
    if (b.kind === "index") return `${rt("get")}(${ctx.scope}, "$index")`;
    // Record ROOT names only (a loop variable is not a data binding).
    const first = b.path.split(".")[0];
    if (!ctx.loopVars.has(first)) bindings.add(first);
    return `${rt("get")}(${ctx.scope}, ${jsonStr(b.path)})`;
  };

  // ---------------------------------------------------------------- attribute values
  const stringValue = (whole, ctx, required, line, attr) => {
    if (whole.static !== undefined) return attrString(whole.static);
    const b = whole.binding;
    if (b.kind === "literal") return `{${jsonStr(String(b.value))}}`;
    return `{${rt(required ? "asString" : "asText")}(${getExpr(b, ctx)})}`;
  };
  const numberValue = (whole, ctx, line, attr) => {
    if (whole.static !== undefined) {
      if (!/^-?\d+(\.\d+)?$/.test(whole.static)) fail(`attribute "${attr}" must be a number, got "${whole.static}"`, line);
      return `{${whole.static}}`;
    }
    const b = whole.binding;
    if (b.kind === "literal") {
      if (typeof b.value !== "number") fail(`attribute "${attr}" must be a number`, line);
      return `{${b.text}}`;
    }
    return `{${rt("asNumber")}(${getExpr(b, ctx)})}`;
  };
  const boolValue = (whole, ctx, line, attr) => {
    if (whole.static !== undefined) {
      if (whole.static !== "true" && whole.static !== "false") fail(`attribute "${attr}" must be true or false, got "${whole.static}"`, line);
      return `{${whole.static}}`;
    }
    const b = whole.binding;
    if (b.kind === "literal") {
      if (typeof b.value !== "boolean") fail(`attribute "${attr}" must be a boolean`, line);
      return `{${b.text}}`;
    }
    return `{${rt("asBool")}(${getExpr(b, ctx)})}`;
  };
  const handlerValue = (whole, ctx, line, attr, withNoop) => {
    if (whole.static !== undefined) fail(`attribute "${attr}" must be a binding to a function`, line);
    const b = whole.binding;
    if (b.kind !== "path") fail(`attribute "${attr}" must bind a path`, line);
    const e = `${rt("asHandler")}(${getExpr(b, ctx)})`;
    return withNoop ? `{${e} ?? ${rt("noop")}}` : `{${e}}`;
  };
  const pathOnly = (whole, line, attr) => {
    if (whole.static !== undefined || whole.binding.kind !== "path") fail(`attribute "${attr}" must be a single binding to a path`, line);
    return whole.binding;
  };

  // ---------------------------------------------------------------- style / class
  const styleParts = (el, ctx) => {
    const get1 = (n) => el.attrs.find((a) => a.name === n);
    const style = get1("style"), hover = get1("style-hover"), focus = get1("style-focus"), active = get1("style-active");
    if (!style && !hover && !focus && !active) return null;
    return styles.add({
      style: style?.value, hover: hover?.value, focus: focus?.value, active: active?.value,
      file, line: (style ?? hover ?? focus ?? active).line,
    });
  };
  const varsExpr = (vars, ctx) =>
    `${rt("dcVars")}({ ${vars.map((v) => `${jsonStr(v.name)}: ${getExpr({ kind: "path", path: v.path }, ctx)}`).join(", ")} })`;

  // ---------------------------------------------------------------- native elements
  const nativeAttrs = (el, ctx) => {
    const props = [];
    const classParts = []; // JSX-ready pieces: string literals or expressions
    let refExpr = null;
    const sp = styleParts(el, ctx);
    if (sp) classParts.push({ lit: sp.className });
    const hasOnChange = el.attrs.some((a) => a.name === "onChange");
    const isInput = el.tag === "input";
    for (const a of el.attrs) {
      const name = a.name;
      if (name.startsWith("hint-") || name === "style" || name === "style-hover" || name === "style-focus" || name === "style-active") continue;
      if (name === "dc-props") continue;
      const line = a.line;
      if (name === "class") {
        const whole = parseWholeValue(a.value, file, line, name);
        if (whole.static !== undefined) classParts.push({ lit: whole.static });
        else classParts.push({ expr: `${rt("asString")}(${getExpr(pathOnly(whole, line, name), ctx)})` });
        continue;
      }
      if (name === "ref") {
        refExpr = `${rt("asRef")}(${getExpr(pathOnly(parseWholeValue(a.value, file, line, name), line, name), ctx)})`;
        continue;
      }
      if (name === "src" && el.tag === "img") {
        const whole = parseWholeValue(a.value, file, line, name);
        if (whole.static === undefined) fail('<img src> must be a static path', line);
        const ident = assets.reference(whole.static, file, line);
        imports.set(ident.ident, ident.path);
        props.push(`src={${ident.ident}}`);
        continue;
      }
      if (EVENT_ATTRS.has(name)) {
        props.push(`${name}=${handlerValue(parseWholeValue(a.value, file, line, name), ctx, line, name, isInput && name === "onChange")}`);
        continue;
      }
      const out = RENAME[name] ?? name;
      if (name === "value" && isInput) {
        const whole = parseWholeValue(a.value, file, line, name);
        props.push(`value=${stringValue(whole, ctx, true, line, name)}`);
        if (!hasOnChange) props.push("readOnly");
        continue;
      }
      if (BOOL_ATTRS.has(out)) {
        props.push(`${out}=${boolValue(parseWholeValue(a.value, file, line, name), ctx, line, name)}`);
        continue;
      }
      if (out === "tabIndex") {
        props.push(`tabIndex=${numberValue(parseWholeValue(a.value, file, line, name), ctx, line, name)}`);
        continue;
      }
      if (name.startsWith("aria-")) {
        const whole = parseWholeValue(a.value, file, line, name);
        if (ARIA_NUMBER.has(name)) props.push(`${name}=${numberValue(whole, ctx, line, name)}`);
        else if (ARIA_TRISTATE.has(name) || ARIA_BOOLEANISH.has(name) || name === "aria-current") {
          if (whole.static !== undefined) props.push(`${name}=${attrString(whole.static)}`);
          else {
            const fn = ARIA_TRISTATE.has(name) ? "asTristate" : name === "aria-current" ? "asCurrent" : "asBooleanish";
            props.push(`${name}={${rt(fn)}(${getExpr(pathOnly(whole, line, name), ctx)})}`);
          }
        } else if (ARIA_STRING.has(name)) props.push(`${name}=${stringValue(whole, ctx, false, line, name)}`);
        else fail(`unsupported attribute "${name}"`, line);
        continue;
      }
      if (name.startsWith("data-")) {
        props.push(`${name}=${stringValue(parseWholeValue(a.value, file, line, name), ctx, false, line, name)}`);
        continue;
      }
      if (PLAIN_ATTRS.has(out)) {
        props.push(`${out}=${stringValue(parseWholeValue(a.value, file, line, name), ctx, false, line, name)}`);
        continue;
      }
      fail(`unsupported attribute "${name}" on <${el.tag}>`, line);
    }
    // className
    if (classParts.length) {
      if (classParts.every((p) => p.lit !== undefined)) props.unshift(`className=${attrString(classParts.map((p) => p.lit).join(" "))}`);
      else props.unshift("className={" + "`" + classParts.map((p) => (p.lit !== undefined ? p.lit : "${" + p.expr + "}")).join(" ") + "`}");
    }
    // ref (user ref merged with the style custom properties)
    const varsRef = sp && sp.vars.length ? varsExpr(sp.vars, ctx) : null;
    if (refExpr && varsRef) props.push(`ref={${rt("mergeRefs")}(${refExpr}, ${varsRef})}`);
    else if (refExpr) props.push(`ref={${refExpr}}`);
    else if (varsRef) props.push(`ref={${varsRef}}`);
    return props;
  };

  // ---------------------------------------------------------------- x-import
  const xImport = (el, ctx, ind) => {
    const ns = el.attrs.find((a) => a.name === "component-from-global-scope");
    if (!ns) fail("<x-import> without component-from-global-scope", el.line);
    const m = /^([A-Za-z0-9_]+)\.([A-Za-z]+)$/.exec(ns.value);
    if (!m || m[1] !== DS_NAMESPACE) fail(`unsupported component namespace "${ns.value}"`, el.line);
    const comp = m[2];
    const table = XI[comp];
    if (!table) fail(`unsupported design-system component "${comp}"`, el.line);
    usedDs.add(comp);
    const props = [];
    const classes = [];
    for (const a of el.attrs) {
      const n = a.name;
      if (n === "component-from-global-scope" || n.startsWith("hint-")) continue;
      if (n === "dc-props") {
        notApplied.add("dc-props");
        continue;
      }
      if (n === "style") {
        if (!XI_CLASSNAME.has(comp)) fail(`a style on <x-import ${comp}> is not supported`, a.line);
        const r = styles.add({ style: a.value, file, line: a.line });
        if (r.vars.length) fail("a dynamic style on <x-import> is not supported", a.line);
        classes.push(r.className);
        continue;
      }
      const spec = table[n];
      if (!spec) fail(`unsupported prop "${n}" on ${comp}`, a.line);
      const [prop, kind] = spec;
      const whole = parseWholeValue(a.value, file, a.line, n);
      let v;
      switch (kind) {
        case "string": v = stringValue(whole, ctx, false, a.line, n); break;
        case "requiredString": v = stringValue(whole, ctx, true, a.line, n); break;
        case "number": v = numberValue(whole, ctx, a.line, n); break;
        case "boolean": v = boolValue(whole, ctx, a.line, n); break;
        case "handler": v = handlerValue(whole, ctx, a.line, n, false); break;
        case "enum":
          if (whole.static === undefined) fail(`prop "${n}" on ${comp} must be a static value`, a.line);
          v = attrString(whole.static);
          break;
        case "options":
        case "action": {
          const b = pathOnly(whole, a.line, n);
          v = `{${rt(kind === "options" ? "asOptions" : "asAction")}(${getExpr(b, ctx)})}`;
          break;
        }
        default: fail(`internal: unknown prop kind ${kind}`, a.line);
      }
      props.push(`${prop}=${v}`);
    }
    if (classes.length) props.push(`className=${attrString(classes.join(" "))}`);
    return element(comp, props, el.children, ctx, ind);
  };

  // ---------------------------------------------------------------- text and children
  const textChildren = (node, ctx) => {
    const out = [];
    for (const seg of parseBindings(node.text, file, node.line)) {
      if (seg.static !== undefined) {
        const raw = seg.static;
        if (raw === "") continue;
        const startsNl = /^\s*\n/.test(raw);
        const endsNl = /\n\s*$/.test(raw);
        let s = raw.replace(/\s+/g, " ");
        if (startsNl) s = s.replace(/^ /, "");
        if (endsNl) s = s.replace(/ $/, "");
        if (s === "") {
          if (!raw.includes("\n") && raw !== "") out.push(`{" "}`);
          continue;
        }
        out.push(/^[^{}<>&\\\n\r\u2028\u2029 ](?:[^{}<>&\\\n\r\u2028\u2029]*[^{}<>&\\\n\r\u2028\u2029 ])?$/.test(s) ? s : `{${jsonStr(s)}}`);
      } else {
        const b = seg.binding;
        if (b.kind === "literal") {
          if (typeof b.value === "number") out.push(`{${b.text}}`);
        } else out.push(`{${rt("asNode")}(${getExpr(b, ctx)})}`);
      }
    }
    return out;
  };

  const children = (kids, ctx, ind) => {
    const out = [];
    for (const k of kids) {
      if (k.type === "text") out.push(...textChildren(k, ctx));
      else out.push(...node(k, ctx, ind));
    }
    return out;
  };

  const element = (tag, props, kids, ctx, ind) => {
    const open = props.length ? `<${tag} ${props.join(" ")}` : `<${tag}`;
    const inner = children(kids, ctx, ind + 1);
    if (inner.length === 0) return [`${open} />`];
    const pad = "  ".repeat(ind + 1);
    return [`${open}>\n${inner.map((c) => pad + c.replace(/\n/g, "\n")).join("\n")}\n${"  ".repeat(ind)}</${tag}>`];
  };

  // ---------------------------------------------------------------- directives
  const wrapMany = (inner, ind) => {
    if (inner.length === 1 && inner[0].startsWith("<") && !inner[0].startsWith("<Fragment")) return inner[0];
    usedFragment = true;
    const pad = "  ".repeat(ind + 1);
    return `<Fragment>\n${inner.map((c) => pad + c).join("\n")}\n${"  ".repeat(ind)}</Fragment>`;
  };

  const node = (el, ctx, ind) => {
    switch (el.tag) {
      case "sc-if": {
        const v = el.attrs.find((a) => a.name === "value");
        if (!v) fail("<sc-if> without value", el.line);
        const b = pathOnly(parseWholeValue(v.value, file, v.line, "value"), v.line, "value");
        const inner = children(el.children, ctx, ind + 1);
        if (inner.length === 0) return [];
        const pad = "  ".repeat(ind + 1);
        return [`{${rt("truthy")}(${getExpr(b, ctx)}) ? (\n${pad}${wrapMany(inner, ind + 1)}\n${"  ".repeat(ind)}) : null}`];
      }
      case "sc-for": {
        const l = el.attrs.find((a) => a.name === "list");
        const asAttr = el.attrs.find((a) => a.name === "as");
        if (!l || !asAttr) fail("<sc-for> needs list and as", el.line);
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(asAttr.value) || asAttr.value === "$index") fail(`invalid sc-for variable "${asAttr.value}"`, asAttr.line);
        const b = pathOnly(parseWholeValue(l.value, file, l.line, "list"), l.line, "list");
        const d = ctx.depth + 1;
        const inner = ctx.depth + 1;
        const child = { scope: `s${d}`, depth: d, loopVars: new Set([...ctx.loopVars, asAttr.value]) };
        const body = children(el.children, child, ind + 3);
        if (body.length === 0) return [];
        usedFragment = true;
        rt("asList"); rt("childScope");
        const p1 = "  ".repeat(ind + 1), p2 = "  ".repeat(ind + 2), p3 = "  ".repeat(ind + 3);
        return [
          `{${"asList"}(${getExpr(b, ctx)}).map((item${d}, i${d}) => {\n` +
          `${p1}const s${d} = childScope(${ctx.scope}, { ${jsonStr(asAttr.value)}: item${d}, "$index": i${d} });\n` +
          `${p1}return (\n${p2}<Fragment key={i${d}}>\n${body.map((c) => p3 + c).join("\n")}\n${p2}</Fragment>\n${p1});\n${"  ".repeat(ind)}})}`,
        ];
      }
      case "dc-import": {
        backdropUsed = true;
        for (const a of el.attrs) if (a.name !== "name" && !a.name.startsWith("hint-")) notForwarded.add(a.name);
        return ["{backdrop}"];
      }
      case "x-import":
        return xImport(el, ctx, ind);
      case "html": case "head": case "body": case "x-dc": case "helmet": case "meta": case "title": case "link": case "style": case "script":
        return fail(`<${el.tag}> is not allowed inside the screen root`, el.line);
      default:
        return element(el.tag, nativeAttrs(el, ctx), el.children, ctx, ind);
    }
  };

  if (["sc-if", "sc-for", "x-import", "dc-import"].includes(root.tag)) {
    fail(`the screen root must be a plain element, not <${root.tag}>`, root.line);
  }
  const ctx0 = { scope: "scope", depth: 0, loopVars: new Set() };
  const rootProps = nativeAttrs(root, ctx0);
  // Merge the root class with the required root classes.
  const rootClassIdx = rootProps.findIndex((p) => p.startsWith("className="));
  const rootExtra = `ds-root dc-${slug}`;
  if (rootClassIdx >= 0) {
    const cur = rootProps[rootClassIdx];
    if (cur.startsWith('className="')) rootProps[rootClassIdx] = `className="${rootExtra} ${cur.slice(11, -1)}"`;
    else rootProps[rootClassIdx] = "className={`" + rootExtra + " " + cur.slice("className={`".length);
  } else rootProps.unshift(`className="${rootExtra}"`);
  const rootEl = element(root.tag, rootProps, root.children, ctx0, 2)[0];

  return {
    jsx: rootEl,
    usedRuntime, usedDs, usedFragment, imports, bindings, backdropUsed, notForwarded, notApplied,
  };
}

// ----------------------------------------------------------------------------------------------
// (h) assets
// ----------------------------------------------------------------------------------------------

/**
 * Creates the per-screen asset registry. `available` maps relative paths to bytes. A reference must
 * be a relative path with no "..", no leading "/", no scheme.
 */
export function createAssetRegistry(available) {
  const used = new Map(); // base name -> { source, bytes }
  return {
    reference(src, file, line) {
      if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(src) || src.startsWith("/") || src.split("/").includes("..")) {
        throw new DcConvertError(`unsupported asset path "${src}"`, file, line);
      }
      const bytes = available[src];
      if (!bytes) throw new DcConvertError(`asset "${src}" was not provided to the converter`, file, line);
      const base = src.split("/").pop();
      const prior = used.get(base);
      if (prior && prior.source !== src) throw new DcConvertError(`two different assets share the file name "${base}"`, file, line);
      used.set(base, { source: src, bytes });
      return { ident: imageIdent(base), path: `./assets/${base}` };
    },
    list() {
      return [...used.keys()].sort().map((base) => ({ base, bytes: used.get(base).bytes }));
    },
  };
}
