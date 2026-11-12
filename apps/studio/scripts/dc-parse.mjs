/**
 * Design-source converter, stages (a)-(d): normalisation, strict tokenizer + tree builder,
 * binding parser, and the structure pass. Node >= 20 built-ins only; no dependency.
 *
 * Strict by design: anything outside the supported grammar throws DcConvertError with file and
 * line. It never guesses.
 */

export class DcConvertError extends Error {
  /** @param {string} message @param {string} file @param {number} line */
  constructor(message, file, line) {
    super(`${file}:${line}: ${message}`);
    this.name = "DcConvertError";
    this.file = file;
    this.line = line;
  }
}

export const VOID_ELEMENTS = new Set(["meta", "link", "img", "input", "br", "hr"]);
const RAW_ELEMENTS = new Set(["style", "script"]);
/** HTML boolean attributes that may appear without a value (emitted as `attr={true}`). */
const BOOLEAN_ATTRS = new Set(["disabled", "checked", "readonly", "required", "hidden", "selected", "multiple", "autofocus"]);
export const ALLOWED_ELEMENTS = new Set([
  "html", "head", "body", "x-dc", "helmet", "meta", "title", "link", "style", "script",
  "div", "span", "p", "a", "ul", "ol", "li", "section", "aside", "header", "nav", "main", "footer",
  "figure", "figcaption", "h1", "h2", "h3", "label", "button", "input", "img",
  "svg", "path", "circle", "rect",
  "sc-if", "sc-for", "x-import", "dc-import",
]);

/** Strips a BOM and normalises CRLF/CR to LF. */
export function normalizeText(text) {
  return text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}

const ENTITY = { amp: "&", lt: "<", gt: ">", quot: '"' };

function decodeEntities(s, file, line) {
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[A-Za-z]+);/g, (m, body) => {
    if (body.startsWith("#x")) return String.fromCodePoint(parseInt(body.slice(2), 16));
    if (body.startsWith("#")) return String.fromCodePoint(parseInt(body.slice(1), 10));
    if (Object.prototype.hasOwnProperty.call(ENTITY, body)) return ENTITY[body];
    throw new DcConvertError(`unsupported entity ${m}`, file, line);
  });
}

/**
 * Tokenizes + builds the tree. Nodes: { type: "el", tag, attrs: [{name, value, line}], children, line,
 * raw? } | { type: "text", text, line }.
 */
export function parseHtml(text, file) {
  let i = 0;
  let line = 1;
  const root = { type: "el", tag: "#root", attrs: [], children: [], line: 1 };
  const stack = [root];
  const top = () => stack[stack.length - 1];
  const fail = (msg, ln = line) => {
    throw new DcConvertError(msg, file, ln);
  };
  const advance = (n) => {
    for (let k = 0; k < n; k++) {
      if (text[i] === "\n") line++;
      i++;
    }
  };

  while (i < text.length) {
    if (text.startsWith("<!--", i)) {
      const end = text.indexOf("-->", i + 4);
      if (end < 0) fail("unterminated comment");
      advance(end + 3 - i);
      continue;
    }
    if (text.startsWith("<!", i)) {
      if (!/^<!doctype html>/i.test(text.slice(i, i + 15)) || stack.length !== 1) fail("unsupported <! construct");
      advance(text.indexOf(">", i) + 1 - i);
      continue;
    }
    if (text[i] === "<" && text[i + 1] === "/") {
      const m = /^<\/([A-Za-z][A-Za-z0-9-]*)\s*>/.exec(text.slice(i, i + 200));
      if (!m) fail("malformed end tag");
      const open = top();
      if (stack.length === 1 || open.tag !== m[1]) {
        fail(`unexpected </${m[1]}>` + (stack.length > 1 ? ` (open <${open.tag}> from line ${open.line})` : ""));
      }
      stack.pop();
      advance(m[0].length);
      continue;
    }
    if (text[i] === "<" && /[A-Za-z]/.test(text[i + 1] ?? "")) {
      const startLine = line;
      advance(1);
      const nameM = /^[A-Za-z][A-Za-z0-9-]*/.exec(text.slice(i, i + 100));
      const tag = nameM[0];
      if (!ALLOWED_ELEMENTS.has(tag)) fail(`unsupported element <${tag}>`);
      advance(tag.length);
      const attrs = [];
      for (;;) {
        const ws = /^\s*/.exec(text.slice(i))[0];
        advance(ws.length);
        if (i >= text.length) fail(`unterminated <${tag}> tag`, startLine);
        if (text[i] === ">") {
          advance(1);
          break;
        }
        if (text[i] === "/") fail(`self-closing syntax is not supported on <${tag}>`);
        const an = /^[A-Za-z_:][A-Za-z0-9_:.-]*/.exec(text.slice(i, i + 200));
        if (!an) fail(`malformed attribute in <${tag}>`);
        const attrLine = line;
        advance(an[0].length);
        if (text[i] !== "=") {
          // Valueless attributes exist only on the design tool's data <script> (dropped, never emitted).
          if (tag === "script") {
            attrs.push({ name: an[0], value: "", line: attrLine });
            continue;
          }
          // Standard HTML boolean attributes may be written without a value; they mean "true". Anything else fails closed.
          if (BOOLEAN_ATTRS.has(an[0].toLowerCase())) {
            attrs.push({ name: an[0].toLowerCase(), value: "true", line: attrLine });
            continue;
          }
          fail(`attribute "${an[0]}" has no value (valueless attributes are not supported, except the HTML booleans ${[...BOOLEAN_ATTRS].join(", ")})`, attrLine);
        }
        advance(1);
        // The design tool writes the data <script>'s metadata (data-props) with single quotes. That tag is skipped, so it
        // is the one place a single-quoted value is read; everywhere else it still fails closed.
        const quote = text[i] === "'" && tag === "script" ? "'" : '"';
        if (text[i] !== quote) fail(`attribute "${an[0]}" must use a double-quoted value`, attrLine);
        advance(1);
        const end = text.indexOf(quote, i);
        if (end < 0) fail(`unterminated value of attribute "${an[0]}"`, attrLine);
        const raw = text.slice(i, end);
        advance(end + 1 - i);
        attrs.push({ name: an[0], value: decodeEntities(raw, file, attrLine), line: attrLine });
      }
      const el = { type: "el", tag, attrs, children: [], line: startLine };
      top().children.push(el);
      if (RAW_ELEMENTS.has(tag)) {
        const m = new RegExp(`</${tag}`, "i").exec(text.slice(i));
        if (!m) fail(`unterminated <${tag}>`, startLine);
        el.raw = text.slice(i, i + m.index);
        advance(m.index);
        const endTag = new RegExp(`^</${tag}\\s*>`, "i").exec(text.slice(i, i + 40));
        if (!endTag) fail(`malformed </${tag}>`);
        advance(endTag[0].length);
      } else if (!VOID_ELEMENTS.has(tag)) {
        stack.push(el);
      }
      continue;
    }
    // Text run up to the next "<".
    let end = text.indexOf("<", i);
    if (end < 0) end = text.length;
    if (end === i) fail("stray '<'");
    const raw = text.slice(i, end);
    const tLine = line;
    advance(end - i);
    top().children.push({ type: "text", text: decodeEntities(raw, file, tLine), line: tLine });
  }
  if (stack.length !== 1) fail(`unclosed <${top().tag}>`, top().line);
  return root;
}

// ----------------------------------------------------------------------------------------------
// (d) bindings
// ----------------------------------------------------------------------------------------------

const PATH_RE = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;

/** Parses one expression into { kind: "path"|"literal"|"index", ... }. */
export function parseExpression(expr, file, line) {
  const e = expr.trim();
  if (e === "$index") return { kind: "index", path: "$index" };
  if (e === "true") return { kind: "literal", value: true, text: "true" };
  if (e === "false") return { kind: "literal", value: false, text: "false" };
  if (e === "null") return { kind: "literal", value: null, text: "null" };
  if (/^-?\d+(\.\d+)?$/.test(e)) return { kind: "literal", value: Number(e), text: e };
  if (PATH_RE.test(e)) return { kind: "path", path: e };
  throw new DcConvertError(`unsupported binding expression "{{ ${e} }}" (only dotted paths, numbers, true/false/null and $index)`, file, line);
}

/** Splits a string into [{ static: string } | { binding }] segments. */
export function parseBindings(str, file, line) {
  const out = [];
  let i = 0;
  while (i < str.length) {
    const open = str.indexOf("{{", i);
    if (open < 0) {
      out.push({ static: str.slice(i) });
      break;
    }
    if (open > i) out.push({ static: str.slice(i, open) });
    const close = str.indexOf("}}", open + 2);
    if (close < 0) throw new DcConvertError("unterminated {{", file, line);
    const inner = str.slice(open + 2, close);
    if (inner.includes("{{")) throw new DcConvertError("nested {{", file, line);
    out.push({ binding: parseExpression(inner, file, line) });
    i = close + 2;
  }
  return out;
}

/** The whole attribute value must be exactly one binding (or fully static); returns it. */
export function parseWholeValue(value, file, line, attrName) {
  const segs = parseBindings(value, file, line);
  const bindings = segs.filter((s) => s.binding);
  if (bindings.length === 0) return { static: value };
  if (segs.length !== 1) {
    throw new DcConvertError(`attribute "${attrName}" mixes static text with a binding (the whole value must be one binding)`, file, line);
  }
  return { binding: bindings[0].binding };
}

// ----------------------------------------------------------------------------------------------
// (c) structure pass
// ----------------------------------------------------------------------------------------------

const DROPPED_SRC = new Set(["support.js", "_ds_bundle.js"]);
const baseName = (p) => p.split("/").pop() ?? p;

/** Drops <script> elements anywhere in the tree (validating each); records what was dropped. */
function dropScripts(node, file, dropped) {
  node.children = node.children.filter((c) => {
    if (c.type !== "el" || c.tag !== "script") return true;
    const src = c.attrs.find((a) => a.name === "src");
    const type = c.attrs.find((a) => a.name === "type");
    if (src) {
      if (!DROPPED_SRC.has(baseName(src.value))) {
        throw new DcConvertError(`unsupported <script src="${src.value}"> (only the vendor runtime and the design-system bundle are dropped)`, file, c.line);
      }
      dropped.push(baseName(src.value));
    } else if (type && type.value === "text/x-dc") {
      dropped.push("data script");
    } else {
      throw new DcConvertError("unsupported inline <script> (only the type=text/x-dc data script is dropped)", file, c.line);
    }
    return false;
  });
  for (const c of node.children) if (c.type === "el") dropScripts(c, file, dropped);
}

function findAll(node, tag, out = []) {
  for (const c of node.children) {
    if (c.type !== "el") continue;
    if (c.tag === tag) out.push(c);
    findAll(c, tag, out);
  }
  return out;
}

const textOf = (n) => n.children.map((c) => (c.type === "text" ? c.text : textOf(c))).join("");

/** Matches an omitIf rule against an element (see Config semantics). */
function matchesOmit(el, rule) {
  if (rule.tag !== undefined && el.tag !== rule.tag) return false;
  if (rule.attr) {
    for (const [k, v] of Object.entries(rule.attr)) {
      const a = el.attrs.find((x) => x.name === k);
      if (!a || a.value !== v) return false;
    }
  }
  if (rule.text !== undefined && !textOf(el).includes(rule.text)) return false;
  return true;
}

function applyOmit(node, rule, counter) {
  node.children = node.children.filter((c) => {
    if (c.type === "el" && matchesOmit(c, rule)) {
      counter.n++;
      return false;
    }
    return true;
  });
  for (const c of node.children) if (c.type === "el") applyOmit(c, rule, counter);
}

/** Stage (c). Returns { helmetCss, root, dropped }. */
export function structurePass(tree, file, omitIf = []) {
  const dropped = [];
  dropScripts(tree, file, dropped);
  const xdcs = findAll(tree, "x-dc");
  if (xdcs.length !== 1) throw new DcConvertError(`expected exactly one <x-dc>, found ${xdcs.length}`, file, 1);
  const xdc = xdcs[0];
  for (const c of xdc.children) {
    if (c.type === "text" && c.text.trim() !== "") throw new DcConvertError("unexpected text directly inside <x-dc>", file, c.line);
  }
  const elementChildren = xdc.children.filter((c) => c.type === "el");
  const helmet = elementChildren[0];
  if (!helmet || helmet.tag !== "helmet") throw new DcConvertError("<helmet> must be the first element inside <x-dc>", file, xdc.line);
  for (const c of helmet.children) {
    if (c.type === "text") continue;
    if (!["meta", "title", "link", "style"].includes(c.tag)) {
      throw new DcConvertError(`unsupported <${c.tag}> inside <helmet>`, file, c.line);
    }
  }
  const helmetCss = helmet.children.filter((c) => c.type === "el" && c.tag === "style").map((c) => c.raw ?? "").join("\n");
  const rest = elementChildren.slice(1);
  if (rest.length !== 1) throw new DcConvertError(`expected exactly one screen root after <helmet>, found ${rest.length}`, file, xdc.line);
  const root = rest[0];
  for (const rule of omitIf) {
    const counter = { n: 0 };
    applyOmit({ children: [root] }, rule, counter);
    if (counter.n === 0) throw new DcConvertError(`omitIf rule ${JSON.stringify(rule)} matched nothing (stale rule)`, file, 1);
  }
  return { helmetCss, root, dropped };
}
