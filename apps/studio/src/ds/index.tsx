/**
 * Design-system port (Requirement 18): ONLY the 12 components the mockups use. Markup and `ui-*`
 * class names match the design-system export's bundle (read as reference text, never loaded).
 *
 * Differences from the bundle, all driven by the CSP (Requirement 11.2) or by accessibility:
 *  - no `dangerouslySetInnerHTML` (Icon renders typed shape data; CodeBlock renders tokens);
 *  - no React `style` prop: `--value`, `--p` and `--ds-w` are set through `setCssVars` from ref
 *    callbacks (`dcVars`), and the `ds-w` class reads `--ds-w`;
 *  - accessible names are required where the bundle made them optional.
 *
 * Importing this module loads `ds.css` (scoped under `.ds-root`; see its header).
 */
import { useEffect, useRef, useState } from "react";
import type { ComponentPropsWithoutRef, KeyboardEvent, ReactNode } from "react";
import "./ds.css";
import { ICONS, isIconName } from "./icons.js";
import { clampRound, stepNumber, tokenizeCode } from "./helpers.js";
import { dcVars } from "./dc-runtime.js";

const cx = (...parts: readonly (string | false | null | undefined)[]): string => parts.filter(Boolean).join(" ");

// ---------------------------------------------------------------------------------------------
// Icon
// ---------------------------------------------------------------------------------------------

export interface IconProps {
  name: string;
  size?: number;
  label?: string;
  className?: string;
  /** Forwarded to the svg root (generated screens select a colour per variant with CSS). */
  "data-variant"?: string;
}

export function Icon({ name, size, label, className, "data-variant": variant }: IconProps) {
  const s = size ?? 20;
  const shapes = isIconName(name) ? ICONS[name] : [];
  return (
    <svg
      className={cx("ui-icon", className)}
      width={s}
      height={s}
      viewBox="0 0 20 20"
      focusable="false"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-variant={variant}
    >
      {shapes.map((shape, i) => {
        switch (shape.tag) {
          case "path":
            return <path key={i} d={shape.d} />;
          case "rect":
            return <rect key={i} x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx={shape.rx} />;
          case "circle":
            return <circle key={i} cx={shape.cx} cy={shape.cy} r={shape.r} />;
        }
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------------------------
// Button / IconButton (+ private Tooltip)
// ---------------------------------------------------------------------------------------------

type ButtonNativeProps = Omit<ComponentPropsWithoutRef<"button">, "className" | "style" | "children">;
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ControlSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonNativeProps {
  variant?: ButtonVariant;
  size?: ControlSize;
  icon?: string;
  iconRight?: string;
  state?: string;
  className?: string;
  children?: ReactNode;
}

export function Button({ variant = "secondary", size = "md", icon, iconRight, state, className, children, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx("ui-btn", `ui-btn--${variant}`, size !== "md" && `ui-btn--${size}`, state && `is-${state}`, className)}
      {...rest}
    >
      {icon ? <Icon name={icon} /> : null}
      {children}
      {iconRight ? <Icon name={iconRight} /> : null}
    </button>
  );
}

function Tooltip({ label, shortcut, placement = "above", children }: { label: string; shortcut?: string; placement?: "above" | "below"; children: ReactNode }) {
  return (
    <span className={cx("ui-has-tip", placement === "below" && "ui-has-tip--below")}>
      {children}
      <span className="ui-tip" role="tooltip">
        {label}
        {shortcut ? <kbd>{shortcut}</kbd> : null}
      </span>
    </span>
  );
}

export interface IconButtonProps extends ButtonNativeProps {
  icon: string;
  label: string;
  shortcut?: string;
  variant?: ButtonVariant;
  size?: ControlSize;
  pressed?: boolean;
  state?: string;
  tooltip?: boolean;
  tooltipPlacement?: "above" | "below";
  className?: string;
}

export function IconButton({ icon, label, shortcut, variant = "ghost", size = "md", pressed, state, tooltip = true, tooltipPlacement, className, ...rest }: IconButtonProps) {
  const btn = (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed === undefined ? undefined : pressed}
      className={cx("ui-btn", "ui-btn--icon", `ui-btn--${variant}`, size !== "md" && `ui-btn--${size}`, state && `is-${state}`, className)}
      {...rest}
    >
      <Icon name={icon} />
    </button>
  );
  return tooltip ? (
    <Tooltip label={label} shortcut={shortcut} placement={tooltipPlacement}>
      {btn}
    </Tooltip>
  ) : (
    btn
  );
}

// ---------------------------------------------------------------------------------------------
// Chip
// ---------------------------------------------------------------------------------------------

export interface ChipProps {
  children: ReactNode;
  pressed?: boolean;
  onToggle?: (next: boolean) => void;
  icon?: string;
  removable?: boolean;
  onRemove?: () => void;
  isStatic?: boolean;
  error?: boolean;
  disabled?: boolean;
  state?: string;
}

export function Chip({ children, pressed, onToggle, icon, removable, onRemove, isStatic, error, disabled, state }: ChipProps) {
  const cls = cx("ui-chip", isStatic && "ui-chip--static", error && "is-error", state && `is-${state}`);
  if (isStatic) {
    return (
      <span className={cls}>
        {error ? <Icon name="warning" /> : null}
        {icon ? <Icon name={icon} /> : null}
        {children}
        {removable ? (
          <button type="button" className="ui-chip__remove" aria-label={`Remove ${typeof children === "string" ? children : "item"}`} onClick={onRemove}>
            <Icon name="close" />
          </button>
        ) : null}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={cls}
      aria-pressed={pressed === undefined ? undefined : pressed}
      disabled={disabled}
      onClick={() => onToggle?.(!pressed)}
    >
      {pressed !== undefined ? <Icon name="check" className="ui-chip__check" /> : null}
      {error ? <Icon name="warning" /> : null}
      {icon ? <Icon name={icon} /> : null}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------------------------
// CodeBlock
// ---------------------------------------------------------------------------------------------

export interface CodeBlockProps {
  code?: string;
  language?: string;
  label?: string;
  highlight?: boolean;
}

export function CodeBlock({ code = "", language = "HTML", label, highlight = true }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );
  const copy = (): void => {
    const done = (): void => {
      setCopied(true);
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    };
    const write = navigator.clipboard ? navigator.clipboard.writeText(code) : Promise.reject(new Error("no clipboard"));
    write.then(done, done);
  };
  const name = label ?? language;
  return (
    <div className="ui-code">
      <div className="ui-code__head">
        <span className="ui-caption">{name}</span>
        <button type="button" className={cx("ui-btn", "ui-btn--ghost", "ui-btn--sm", "ui-code__copy", copied && "is-copied")} onClick={copy} aria-live="polite">
          <Icon name={copied ? "check" : "copy"} />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre tabIndex={0} aria-label={`${name} code`}>
        <code>
          {highlight
            ? tokenizeCode(code).map((t, i) => (t.kind === "text" ? t.text : <span key={i} className={`t-${t.kind}`}>{t.text}</span>))
            : code}
        </code>
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// NumberScrub
// ---------------------------------------------------------------------------------------------

export type NumberScrubProps = {
  value?: number;
  defaultValue?: number;
  onChange?: (next: number) => void;
  step?: number;
  min?: number;
  max?: number;
  precision?: number;
  unit?: string;
  disabled?: boolean;
  error?: boolean;
  state?: string;
  width?: string;
  id?: string;
} & ({ label: string; ariaLabel?: string } | { label?: string; ariaLabel: string });

export function NumberScrub(props: NumberScrubProps) {
  const { label, ariaLabel, value, defaultValue = 0, onChange, step = 1, min = -Infinity, max = Infinity, precision = 0, unit, disabled, error, state, width, id } = props;
  const [inner, setInner] = useState(defaultValue);
  const [draft, setDraft] = useState<string | null>(null);
  const [scrub, setScrub] = useState(false);
  const v = value ?? inner;
  const vRef = useRef(v);
  vRef.current = v;
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), []);

  const set = (n: number): void => {
    const next = clampRound(n, min, max, precision);
    setInner(next);
    onChange?.(next);
  };

  const onDown = (e: React.PointerEvent<HTMLSpanElement>): void => {
    if (disabled) return;
    e.preventDefault();
    const x0 = e.clientX;
    const v0 = vRef.current;
    setScrub(true);
    const move = (ev: PointerEvent): void => {
      const k = ev.shiftKey ? 10 : ev.altKey ? 0.1 : 1;
      set(v0 + Math.round((ev.clientX - x0) / 2) * step * k);
    };
    const stop = (): void => {
      setScrub(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      cleanup.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    cleanup.current = stop;
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const next = stepNumber(v, e.key === "ArrowUp" ? 1 : -1, step, { shift: e.shiftKey, alt: e.altKey }, min, max, precision);
      setInner(next);
      onChange?.(next);
    }
    if (e.key === "Enter") e.currentTarget.blur();
    if (e.key === "Escape") {
      setDraft(null);
      e.currentTarget.blur();
    }
  };

  const commit = (): void => {
    if (draft !== null) {
      const n = parseFloat(draft);
      if (!Number.isNaN(n)) set(n);
      setDraft(null);
    }
  };

  return (
    <div
      className={cx("ui-field", "ui-num", scrub && "is-scrubbing", error && "is-error", disabled && "is-disabled", state && `is-${state}`, width && "ds-w")}
      ref={width ? dcVars({ "--ds-w": width }) : undefined}
    >
      {label ? (
        <span className="ui-num__label" onPointerDown={onDown} title={"Drag to scrub \u00B7 Shift \u00D710 \u00B7 Alt \u00D70.1"} aria-hidden="true">
          {label}
        </span>
      ) : null}
      <input
        id={id}
        type="text"
        inputMode="decimal"
        role="spinbutton"
        aria-label={ariaLabel ?? label}
        aria-valuenow={v}
        aria-valuemin={Number.isFinite(min) ? min : undefined}
        aria-valuemax={Number.isFinite(max) ? max : undefined}
        aria-invalid={error ? true : undefined}
        disabled={disabled}
        value={draft ?? Number(v).toFixed(precision)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKey}
        onFocus={(e) => e.target.select()}
      />
      {unit ? (
        <span className="ui-num__unit" aria-hidden="true">
          {unit}
        </span>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// ProgressBar
// ---------------------------------------------------------------------------------------------

export interface ProgressBarProps {
  value?: number;
  indeterminate?: boolean;
  label?: string;
  detail?: string;
  status?: "default" | "paused" | "error" | "success";
}

export function ProgressBar({ value = 0, indeterminate, label, detail, status = "default" }: ProgressBarProps) {
  const pct = Math.round(Math.min(100, Math.max(0, value)));
  return (
    <div className={cx("ui-progress", indeterminate && "ui-progress--indeterminate", status !== "default" && `is-${status}`)}>
      {label || detail ? (
        <div className="ui-progress__meta">
          <span>{label}</span>
          <span className="ui-mono">{detail ?? (indeterminate ? "" : `${pct}%`)}</span>
        </div>
      ) : null}
      <div
        className="ui-progress__track"
        role="progressbar"
        aria-label={label || "Progress"}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={indeterminate ? undefined : pct}
        aria-valuetext={indeterminate ? "Working" : status === "paused" ? `Paused at ${pct}%` : undefined}
      >
        <div className="ui-progress__fill" ref={dcVars({ "--value": `${pct}%` })} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// SegmentedControl
// ---------------------------------------------------------------------------------------------

export interface SegmentOption {
  value: string;
  label: string;
  icon?: string;
  iconOnly?: boolean;
  disabled?: boolean;
  state?: string;
}

export interface SegmentedControlProps {
  options: readonly SegmentOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (next: string) => void;
  label: string;
  block?: boolean;
}

export function SegmentedControl({ options, value, defaultValue, onChange, label, block }: SegmentedControlProps) {
  const [inner, setInner] = useState<string | undefined>(defaultValue ?? options[0]?.value);
  const v = value ?? inner;
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const pick = (o: SegmentOption): void => {
    setInner(o.value);
    onChange?.(o.value);
  };
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number): void => {
    const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (d === 0) return;
    e.preventDefault();
    let j = i;
    for (let n = 0; n < options.length; n++) {
      j = (j + d + options.length) % options.length;
      if (!options[j]?.disabled) break;
    }
    const target = options[j];
    if (target) pick(target);
    refs.current[j]?.focus();
  };
  // Roving tabindex: the checked option; when none matches, the first enabled option (the bundle
  // left every option at -1 in that case, making the group unreachable by keyboard).
  const checkedIndex = options.findIndex((o) => o.value === v);
  const tabbable = checkedIndex >= 0 ? checkedIndex : options.findIndex((o) => !o.disabled);
  return (
    <div role="radiogroup" aria-label={label} className={cx("ui-seg", block && "ui-seg--block")}>
      {options.map((o, i) => (
        <button
          key={o.value}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={v === o.value}
          tabIndex={i === tabbable ? 0 : -1}
          disabled={o.disabled}
          aria-label={o.iconOnly ? o.label : undefined}
          className={cx("ui-seg__opt", o.state && `is-${o.state}`)}
          onClick={() => pick(o)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {o.icon ? <Icon name={o.icon} /> : null}
          {o.iconOnly ? null : o.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Select
// ---------------------------------------------------------------------------------------------

export interface SelectProps {
  options: readonly (string | { value: string; label: string; disabled?: boolean })[];
  value?: string;
  defaultValue?: string;
  onChange?: (next: string) => void;
  label: string;
  disabled?: boolean;
  error?: boolean;
  state?: string;
  id?: string;
  width?: string;
}

export function Select({ options, value, defaultValue, onChange, label, disabled, error, state, id, width }: SelectProps) {
  const controlled = value !== undefined ? { value } : { defaultValue };
  return (
    <div
      className={cx("ui-field", "ui-select", error && "is-error", disabled && "is-disabled", state && `is-${state}`, width && "ds-w")}
      ref={width ? dcVars({ "--ds-w": width }) : undefined}
    >
      <select id={id} aria-label={label} disabled={disabled} aria-invalid={error ? true : undefined} onChange={(e) => onChange?.(e.target.value)} {...controlled}>
        {options.map((o) => {
          const opt = typeof o === "string" ? { value: o, label: o } : o;
          return (
            <option key={opt.value} value={opt.value} disabled={"disabled" in opt ? opt.disabled : undefined}>
              {opt.label}
            </option>
          );
        })}
      </select>
      <Icon name="chevron-down" />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Slider
// ---------------------------------------------------------------------------------------------

export interface SliderProps {
  label: string;
  value?: number;
  defaultValue?: number;
  min?: number;
  max?: number;
  step?: number;
  onChange?: (next: number) => void;
  showValue?: boolean;
  format?: (n: number) => unknown;
  disabled?: boolean;
  state?: string;
  id?: string;
}

export function Slider({ label, value, defaultValue = 50, min = 0, max = 100, step = 1, onChange, showValue = true, format, disabled, state, id }: SliderProps) {
  const [inner, setInner] = useState(defaultValue);
  const v = value ?? inner;
  const p = max === min ? 0 : Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100));
  const fmt = (n: number): string => String(format ? format(n) : n);
  return (
    <div className={cx("ui-slider", disabled && "is-disabled", state && `is-${state}`)}>
      <input
        id={id}
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={v}
        disabled={disabled}
        ref={dcVars({ "--p": `${p}%` })}
        onChange={(e) => {
          const n = Number(e.target.value);
          setInner(n);
          onChange?.(n);
        }}
        aria-valuetext={fmt(v)}
      />
      {showValue ? (
        <output className="ui-slider__value" aria-hidden="true">
          {fmt(v)}
        </output>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------------------------

export interface ToastProps {
  variant?: "success" | "error" | "warning" | "info";
  title: string;
  children?: ReactNode;
  action?: { label: string; onClick?: () => void };
  onClose?: () => void;
}

export function Toast({ variant = "info", title, children, action, onClose }: ToastProps) {
  return (
    <div className={`ui-toast ui-toast--${variant}`} role={variant === "error" ? "alert" : "status"}>
      <Icon name={variant} className="ui-toast__icon" label={variant} />
      <div className="ui-toast__body">
        <div className="ui-toast__title">{title}</div>
        {children ? <div className="ui-toast__text">{children}</div> : null}
        {action ? (
          <div className="ui-toast__actions">
            <Button size="sm" variant="secondary" onClick={action.onClick}>
              {action.label}
            </Button>
          </div>
        ) : null}
      </div>
      {onClose ? (
        <button type="button" className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm" aria-label="Dismiss notification" onClick={onClose}>
          <Icon name="close" />
        </button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Toggle
// ---------------------------------------------------------------------------------------------

export interface ToggleProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (next: boolean) => void;
  label: string;
  showState?: boolean;
  disabled?: boolean;
  state?: string;
}

export function Toggle({ checked, defaultChecked = false, onChange, label, showState, disabled, state }: ToggleProps) {
  const [inner, setInner] = useState(defaultChecked);
  const on = checked ?? inner;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      className={cx("ui-toggle", state && `is-${state}`)}
      onClick={() => {
        setInner(!on);
        onChange?.(!on);
      }}
    >
      <span className="ui-toggle__track">
        <span className="ui-toggle__thumb" />
      </span>
      {showState ? (
        <span className="ui-toggle__state" aria-hidden="true">
          {on ? "On" : "Off"}
        </span>
      ) : null}
      {label}
    </button>
  );
}
