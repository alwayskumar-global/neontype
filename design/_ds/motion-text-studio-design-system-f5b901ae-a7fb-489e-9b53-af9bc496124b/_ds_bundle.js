/* @ds-bundle: {"format":4,"namespace":"MotionTextStudioDesignSystem_f5b901","components":[{"name":"Chip","sourcePath":"components/content/Chip.jsx"},{"name":"CodeBlock","sourcePath":"components/content/CodeBlock.jsx"},{"name":"LayerRow","sourcePath":"components/content/LayerRow.jsx"},{"name":"PresetCard","sourcePath":"components/content/PresetCard.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Icon","sourcePath":"components/core/Icon.jsx"},{"name":"ICON_NAMES","sourcePath":"components/core/Icon.jsx"},{"name":"IconButton","sourcePath":"components/core/IconButton.jsx"},{"name":"Tooltip","sourcePath":"components/core/Tooltip.jsx"},{"name":"ICONS","sourcePath":"components/core/iconPaths.js"},{"name":"Modal","sourcePath":"components/feedback/Modal.jsx"},{"name":"ProgressBar","sourcePath":"components/feedback/ProgressBar.jsx"},{"name":"Toast","sourcePath":"components/feedback/Toast.jsx"},{"name":"WarningBanner","sourcePath":"components/feedback/WarningBanner.jsx"},{"name":"ColorPicker","sourcePath":"components/forms/ColorSwatch.jsx"},{"name":"ColorSwatch","sourcePath":"components/forms/ColorSwatch.jsx"},{"name":"Field","sourcePath":"components/forms/Field.jsx"},{"name":"NumberScrub","sourcePath":"components/forms/NumberScrub.jsx"},{"name":"SegmentedControl","sourcePath":"components/forms/SegmentedControl.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"Slider","sourcePath":"components/forms/Slider.jsx"},{"name":"TextArea","sourcePath":"components/forms/TextArea.jsx"},{"name":"Toggle","sourcePath":"components/forms/Toggle.jsx"},{"name":"Tabs","sourcePath":"components/navigation/Tabs.jsx"},{"name":"Checkerboard","sourcePath":"components/timeline/Checkerboard.jsx"},{"name":"EASINGS","sourcePath":"components/timeline/EasingCurve.jsx"},{"name":"EasingCurve","sourcePath":"components/timeline/EasingCurve.jsx"},{"name":"Keyframe","sourcePath":"components/timeline/Keyframe.jsx"},{"name":"Playhead","sourcePath":"components/timeline/Playhead.jsx"},{"name":"TimelineRuler","sourcePath":"components/timeline/TimelineRuler.jsx"}],"sourceHashes":{"components/content/Chip.jsx":"8565afefb108","components/content/CodeBlock.jsx":"ffd9e481003e","components/content/LayerRow.jsx":"ec8cbeca14df","components/content/PresetCard.jsx":"f4f35a385a38","components/core/Button.jsx":"26028e0d809e","components/core/Icon.jsx":"248fd970d09f","components/core/IconButton.jsx":"75edc028ae58","components/core/Tooltip.jsx":"b5316ee87539","components/core/iconPaths.js":"ad19111bdd0d","components/feedback/Modal.jsx":"613927f94c81","components/feedback/ProgressBar.jsx":"57e0f1873df2","components/feedback/Toast.jsx":"c462d02e07ed","components/feedback/WarningBanner.jsx":"522a1d709038","components/forms/ColorSwatch.jsx":"338e5e04f5bd","components/forms/Field.jsx":"5942b735cb6e","components/forms/NumberScrub.jsx":"913ef6c045f6","components/forms/SegmentedControl.jsx":"72354fbf1212","components/forms/Select.jsx":"05ec540035fb","components/forms/Slider.jsx":"c165b4816b7a","components/forms/TextArea.jsx":"0e7fd9416eba","components/forms/Toggle.jsx":"b4249a45a4f4","components/navigation/Tabs.jsx":"d7bcc58ca285","components/timeline/Checkerboard.jsx":"b20e0560f0e3","components/timeline/EasingCurve.jsx":"466e7e4f0f22","components/timeline/Keyframe.jsx":"75bc18c9e6e0","components/timeline/Playhead.jsx":"fa5fbd50cd55","components/timeline/TimelineRuler.jsx":"c37abbb25728"},"inlinedExternals":[],"unexposedExports":[{"name":"formatTimecode","sourcePath":"components/timeline/TimelineRuler.jsx"}]} */

(() => {

const __ds_ns = (window.MotionTextStudioDesignSystem_f5b901 = window.MotionTextStudioDesignSystem_f5b901 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Tooltip.jsx
try { (() => {
const cx = (...a) => a.filter(Boolean).join(' ');
function Tooltip({
  label,
  shortcut,
  placement = 'above',
  open,
  children
}) {
  const tip = /*#__PURE__*/React.createElement("span", {
    className: "ui-tip",
    role: "tooltip"
  }, label, shortcut && /*#__PURE__*/React.createElement("kbd", null, shortcut));
  if (open && !children) return tip;
  return /*#__PURE__*/React.createElement("span", {
    className: cx('ui-has-tip', placement === 'below' && 'ui-has-tip--below')
  }, children, tip);
}
Object.assign(__ds_scope, { Tooltip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Tooltip.jsx", error: String((e && e.message) || e) }); }

// components/core/iconPaths.js
try { (() => {
// Original icon set. 20×20 grid, 1.5px stroke, round caps + joins, currentColor. Inner markup only.
const ICONS = {
  play: '<path d="M6.5 4.6v10.8a.6.6 0 0 0 .9.5l8.6-5.4a.6.6 0 0 0 0-1L7.4 4.1a.6.6 0 0 0-.9.5z"/>',
  pause: '<rect x="5.5" y="4.5" width="3" height="11" rx="1"/><rect x="11.5" y="4.5" width="3" height="11" rx="1"/>',
  stop: '<rect x="5" y="5" width="10" height="10" rx="1.5"/>',
  "skip-back": '<path d="M5 4.5v11"/><path d="M15 5.1v9.8a.6.6 0 0 1-.9.5L8 10.5a.6.6 0 0 1 0-1l6.1-4.9a.6.6 0 0 1 .9.5z"/>',
  "skip-forward": '<path d="M15 4.5v11"/><path d="M5 5.1v9.8a.6.6 0 0 0 .9.5L12 10.5a.6.6 0 0 0 0-1L5.9 4.6a.6.6 0 0 0-.9.5z"/>',
  loop: '<path d="M3.5 9.5V8A3 3 0 0 1 6.5 5h9"/><path d="M13 2.5 15.5 5 13 7.5"/><path d="M16.5 10.5V12a3 3 0 0 1-3 3h-9"/><path d="M7 17.5 4.5 15 7 12.5"/>',
  keyframe: '<path d="M10 3.5 16.5 10 10 16.5 3.5 10z"/>',
  "keyframe-add": '<path d="M8 4.5 13.5 10 8 15.5 2.5 10z"/><path d="M16 3v5M13.5 5.5h5"/>',
  layers: '<path d="M10 3 17 6.75 10 10.5 3 6.75z"/><path d="M3 10.25 10 14l7-3.75"/><path d="M3 13.75 10 17.5l7-3.75"/>',
  text: '<path d="M4.5 6V4h11v2"/><path d="M10 4v12"/><path d="M7.5 16h5"/>',
  effect: '<path d="M9 2.5c.5 3.3 1.7 4.5 5 5-3.3.5-4.5 1.7-5 5-.5-3.3-1.7-4.5-5-5 3.3-.5 4.5-1.7 5-5z"/><path d="M15 12v5M12.5 14.5h5"/>',
  export: '<path d="M10 12.5v-9"/><path d="M6.5 7 10 3.5 13.5 7"/><path d="M4 11.5V15a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 16 15v-3.5"/>',
  download: '<path d="M10 3.5v9"/><path d="M6.5 9 10 12.5 13.5 9"/><path d="M4 14.5V15a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 16 15v-.5"/>',
  undo: '<path d="M7 4.5 3.5 8 7 11.5"/><path d="M3.5 8h8.75a4.25 4.25 0 0 1 0 8.5H8"/>',
  redo: '<path d="M13 4.5 16.5 8 13 11.5"/><path d="M16.5 8H7.75a4.25 4.25 0 0 0 0 8.5H12"/>',
  "zoom-in": '<circle cx="8.5" cy="8.5" r="5"/><path d="m12.25 12.25 4.25 4.25"/><path d="M8.5 6.5v4M6.5 8.5h4"/>',
  "zoom-out": '<circle cx="8.5" cy="8.5" r="5"/><path d="m12.25 12.25 4.25 4.25"/><path d="M6.5 8.5h4"/>',
  search: '<circle cx="8.5" cy="8.5" r="5"/><path d="m12.25 12.25 4.25 4.25"/>',
  eye: '<path d="M2.5 10S5.25 5 10 5s7.5 5 7.5 5-2.75 5-7.5 5-7.5-5-7.5-5z"/><circle cx="10" cy="10" r="2.25"/>',
  "eye-off": '<path d="M8.3 5.2A7 7 0 0 1 10 5c4.75 0 7.5 5 7.5 5a13 13 0 0 1-1.9 2.5"/><path d="M11.6 11.6a2.25 2.25 0 0 1-3.2-3.2"/><path d="M5.4 6.4C3.5 7.7 2.5 10 2.5 10s2.75 5 7.5 5a7 7 0 0 0 3.6-1"/><path d="m3.5 3.5 13 13"/>',
  lock: '<rect x="4.5" y="9" width="11" height="8" rx="1.5"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9"/>',
  unlock: '<rect x="4.5" y="9" width="11" height="8" rx="1.5"/><path d="M7 9V6.5a3 3 0 0 1 5.8-1.1"/>',
  trash: '<path d="M3.5 5.5h13"/><path d="M8 5.5V4h4v1.5"/><path d="m5 5.5.8 10.1a1.5 1.5 0 0 0 1.5 1.4h5.4a1.5 1.5 0 0 0 1.5-1.4L15 5.5"/><path d="M8.5 8.5v5M11.5 8.5v5"/>',
  plus: '<path d="M10 4v12M4 10h12"/>',
  minus: '<path d="M4 10h12"/>',
  check: '<path d="m4.5 10.5 3.5 3.5 7.5-8"/>',
  close: '<path d="m5 5 10 10M15 5 5 15"/>',
  "chevron-down": '<path d="m5.5 8 4.5 4.5L14.5 8"/>',
  "chevron-up": '<path d="m5.5 12 4.5-4.5 4.5 4.5"/>',
  "chevron-left": '<path d="M12 5.5 7.5 10l4.5 4.5"/>',
  "chevron-right": '<path d="M8 5.5l4.5 4.5L8 14.5"/>',
  warning: '<path d="M8.7 4.2a1.5 1.5 0 0 1 2.6 0l5.9 10.3a1.5 1.5 0 0 1-1.3 2.25H4.1a1.5 1.5 0 0 1-1.3-2.25z"/><path d="M10 8.5v3"/><path d="M10 14.25h.01"/>',
  info: '<circle cx="10" cy="10" r="7"/><path d="M10 9.25v4.25"/><path d="M10 6.5h.01"/>',
  error: '<circle cx="10" cy="10" r="7"/><path d="m7.75 7.75 4.5 4.5M12.25 7.75l-4.5 4.5"/>',
  success: '<circle cx="10" cy="10" r="7"/><path d="m7 10.25 2 2 4-4.25"/>',
  copy: '<rect x="7" y="7" width="9.5" height="9.5" rx="1.5"/><path d="M13 7V5a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 5v6.5A1.5 1.5 0 0 0 5 13h2"/>',
  settings: '<path d="M3.5 6h6M13.5 6h3M3.5 14h3M10.5 14h6"/><circle cx="11.5" cy="6" r="2"/><circle cx="8.5" cy="14" r="2"/>',
  more: '<path d="M5 10h.01M10 10h.01M15 10h.01" stroke-width="2.25"/>',
  grip: '<path d="M7.5 5h.01M12.5 5h.01M7.5 10h.01M12.5 10h.01M7.5 15h.01M12.5 15h.01" stroke-width="2"/>',
  easing: '<path d="M4 16c6 0 6-12 12-12"/><circle cx="4" cy="16" r="1.25"/><circle cx="16" cy="4" r="1.25"/>',
  image: '<rect x="3" y="4" width="14" height="12" rx="1.5"/><circle cx="7.5" cy="8" r="1.25"/><path d="m3.5 14.5 4-4 3 3 2-2 4 4"/>',
  code: '<path d="M7 6 3 10l4 4M13 6l4 4-4 4"/>',
  grid: '<rect x="3.5" y="3.5" width="13" height="13" rx="1.5"/><path d="M3.5 10h13M10 3.5v13"/>',
  droplet: '<path d="M10 3s5 5.2 5 8.5a5 5 0 0 1-10 0C5 8.2 10 3 10 3z"/>',
  fit: '<path d="M3.5 7.5v-4h4M12.5 3.5h4v4M16.5 12.5v4h-4M7.5 16.5h-4v-4"/>',
  link: '<path d="M8.5 11.5a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2l-.8.8"/><path d="M11.5 8.5a3 3 0 0 0-4.2 0l-2.6 2.6a3 3 0 0 0 4.2 4.2l.8-.8"/>',
  "align-center": '<path d="M4 5h12M6.5 10h7M4 15h12"/>',
  clock: '<circle cx="10" cy="10" r="7"/><path d="M10 6v4l2.5 2"/>',
  magnet: '<path d="M5 3.5v6.5a5 5 0 0 0 10 0V3.5h-3.5V10a1.5 1.5 0 0 1-3 0V3.5z"/><path d="M5 7h3.5M11.5 7H15"/>',
  help: '<circle cx="10" cy="10" r="7"/><path d="M8 8a2 2 0 1 1 2.75 1.85c-.45.2-.75.6-.75 1.1v.3"/><path d="M10 13.75h.01"/>'
};
Object.assign(__ds_scope, { ICONS });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/iconPaths.js", error: String((e && e.message) || e) }); }

// components/core/Icon.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Icon({
  name,
  size,
  label,
  className,
  ...rest
}) {
  const s = size || 20;
  return /*#__PURE__*/React.createElement("svg", _extends({
    className: 'ui-icon' + (className ? ' ' + className : ''),
    width: s,
    height: s,
    viewBox: "0 0 20 20",
    focusable: "false",
    role: label ? 'img' : undefined,
    "aria-label": label,
    "aria-hidden": label ? undefined : true,
    dangerouslySetInnerHTML: {
      __html: __ds_scope.ICONS[name] || ''
    }
  }, rest));
}
const ICON_NAMES = Object.keys(__ds_scope.ICONS);
Object.assign(__ds_scope, { Icon, ICON_NAMES });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Icon.jsx", error: String((e && e.message) || e) }); }

// components/content/Chip.jsx
try { (() => {
const cx = (...a) => a.filter(Boolean).join(' ');
function Chip({
  children,
  pressed,
  onToggle,
  icon,
  removable,
  onRemove,
  isStatic,
  error,
  disabled,
  state
}) {
  const cls = cx('ui-chip', isStatic && 'ui-chip--static', error && 'is-error', state && 'is-' + state);
  if (isStatic) return /*#__PURE__*/React.createElement("span", {
    className: cls
  }, error && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "warning"
  }), icon && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon
  }), children, removable && /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "ui-chip__remove",
    "aria-label": 'Remove ' + children,
    onClick: onRemove
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "close"
  })));
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: cls,
    "aria-pressed": pressed === undefined ? undefined : pressed,
    disabled: disabled,
    onClick: () => onToggle && onToggle(!pressed)
  }, pressed !== undefined && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "check",
    className: "ui-chip__check"
  }), error && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "warning"
  }), icon && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon
  }), children);
}
Object.assign(__ds_scope, { Chip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/content/Chip.jsx", error: String((e && e.message) || e) }); }

// components/content/CodeBlock.jsx
try { (() => {
function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function highlight(code) {
  return esc(code).replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="t-com">$1</span>').replace(/(&lt;\/?)([a-z][\w-]*)/g, '$1<span class="t-tag">$2</span>').replace(/\s([a-z-]+)=(&quot;|")([^"]*)"/g, ' <span class="t-attr">$1</span>=<span class="t-str">"$3"</span>');
}
function CodeBlock({
  code = '',
  language = 'HTML',
  label,
  highlight: hl = true
}) {
  const [copied, setCopied] = React.useState(false);
  const copy = () => {
    (navigator.clipboard ? navigator.clipboard.writeText(code) : Promise.reject()).catch(() => {}).finally(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "ui-code"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ui-code__head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "ui-caption"
  }, label || language), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: 'ui-btn ui-btn--ghost ui-btn--sm ui-code__copy' + (copied ? ' is-copied' : ''),
    onClick: copy,
    "aria-live": "polite"
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: copied ? 'check' : 'copy'
  }), copied ? 'Copied' : 'Copy')), /*#__PURE__*/React.createElement("pre", {
    tabIndex: 0,
    "aria-label": (label || language) + ' code'
  }, hl ? /*#__PURE__*/React.createElement("code", {
    dangerouslySetInnerHTML: {
      __html: highlight(code)
    }
  }) : /*#__PURE__*/React.createElement("code", null, code)));
}
Object.assign(__ds_scope, { CodeBlock });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/content/CodeBlock.jsx", error: String((e && e.message) || e) }); }

// components/content/LayerRow.jsx
try { (() => {
const cx = (...a) => a.filter(Boolean).join(' ');
const TYPE = {
  text: 'text',
  image: 'image',
  group: 'layers',
  effect: 'effect'
};
function LayerRow({
  name,
  type = 'text',
  meta,
  selected,
  hidden,
  locked,
  error,
  disabled,
  state,
  onSelect,
  onToggleVisible,
  onToggleLock
}) {
  const stop = fn => e => {
    e.stopPropagation();
    fn && fn();
  };
  return /*#__PURE__*/React.createElement("div", {
    role: "option",
    "aria-selected": !!selected,
    "aria-disabled": disabled || undefined,
    tabIndex: disabled ? -1 : 0,
    className: cx('ui-layer', hidden && 'is-hidden', locked && 'is-locked', error && 'is-error', disabled && 'is-disabled', state && 'is-' + state),
    onClick: () => !disabled && onSelect && onSelect(),
    onKeyDown: e => {
      if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
        e.preventDefault();
        onSelect && onSelect();
      }
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "grip",
    className: "ui-layer__grip ui-icon--sm"
  }), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: error ? 'warning' : TYPE[type],
    className: "ui-layer__type ui-icon--sm",
    label: error ? 'Warning' : undefined
  }), /*#__PURE__*/React.createElement("span", {
    className: "ui-layer__name"
  }, name), meta && /*#__PURE__*/React.createElement("span", {
    className: "ui-layer__meta"
  }, meta), /*#__PURE__*/React.createElement("span", {
    className: "ui-layer__actions"
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm",
    "aria-label": (hidden ? 'Show ' : 'Hide ') + name,
    "aria-pressed": !!hidden,
    disabled: disabled,
    onClick: stop(onToggleVisible)
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: hidden ? 'eye-off' : 'eye'
  })), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm",
    "aria-label": (locked ? 'Unlock ' : 'Lock ') + name,
    "aria-pressed": !!locked,
    disabled: disabled,
    onClick: stop(onToggleLock)
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: locked ? 'lock' : 'unlock'
  }))));
}
Object.assign(__ds_scope, { LayerRow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/content/LayerRow.jsx", error: String((e && e.message) || e) }); }

// components/content/PresetCard.jsx
try { (() => {
const cx = (...a) => a.filter(Boolean).join(' ');
const LABEL = {
  char: 'Char',
  word: 'Word',
  line: 'Line'
};
function split(text, by) {
  if (by === 'line') return [text];
  if (by === 'word') return text.split(/(\s+)/);
  return Array.from(text);
}
function PresetCard({
  name,
  sample = 'Hello',
  effect = 'rise',
  granularity = ['char', 'word', 'line'],
  activeGranularity,
  selected,
  transparent,
  playing,
  disabled,
  error,
  state,
  onSelect
}) {
  const g = activeGranularity || granularity[0];
  const parts = split(sample, g);
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: cx('ui-preset', error && 'is-error', state && 'is-' + state),
    "aria-pressed": !!selected,
    disabled: disabled,
    onClick: onSelect,
    "aria-label": name + (error ? ', unavailable' : '') + ', splits by ' + granularity.map(x => LABEL[x]).join(', ')
  }, /*#__PURE__*/React.createElement("span", {
    className: "ui-preset__thumb"
  }, transparent && /*#__PURE__*/React.createElement("span", {
    className: "ui-checker"
  }), error ? /*#__PURE__*/React.createElement("span", {
    className: "ui-preset__warn"
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "warning"
  }), "Unavailable") : /*#__PURE__*/React.createElement("span", {
    className: cx('ui-preset__sample', 'fx', 'fx--' + effect, playing && 'is-playing'),
    "aria-hidden": "true"
  }, parts.map((p, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    style: {
      '--i': i,
      whiteSpace: 'pre'
    }
  }, p))), selected && /*#__PURE__*/React.createElement("span", {
    className: "ui-preset__badge"
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "check"
  }))), /*#__PURE__*/React.createElement("span", {
    className: "ui-preset__head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "ui-preset__name"
  }, name)), /*#__PURE__*/React.createElement("span", {
    className: "ui-preset__chips",
    "aria-hidden": "true"
  }, granularity.map(x => /*#__PURE__*/React.createElement("span", {
    key: x,
    className: cx('ui-chip', 'ui-chip--static'),
    style: x === g ? {
      borderColor: 'var(--color-border-control-hover)',
      color: 'var(--color-text-primary)'
    } : undefined
  }, LABEL[x]))));
}
Object.assign(__ds_scope, { PresetCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/content/PresetCard.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const cx = (...a) => a.filter(Boolean).join(' ');
function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  iconRight,
  state,
  className,
  children,
  type = 'button',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("button", _extends({
    type: type,
    className: cx('ui-btn', 'ui-btn--' + variant, size !== 'md' && 'ui-btn--' + size, state && 'is-' + state, className)
  }, rest), icon && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon
  }), children, iconRight && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: iconRight
  }));
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/IconButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const cx = (...a) => a.filter(Boolean).join(' ');
function IconButton({
  icon,
  label,
  shortcut,
  variant = 'ghost',
  size = 'md',
  pressed,
  state,
  tooltip = true,
  tooltipPlacement,
  className,
  ...rest
}) {
  const btn = /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    "aria-label": label,
    "aria-pressed": pressed === undefined ? undefined : pressed,
    className: cx('ui-btn', 'ui-btn--icon', 'ui-btn--' + variant, size !== 'md' && 'ui-btn--' + size, state && 'is-' + state, className)
  }, rest), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon
  }));
  return tooltip ? /*#__PURE__*/React.createElement(__ds_scope.Tooltip, {
    label: label,
    shortcut: shortcut,
    placement: tooltipPlacement
  }, btn) : btn;
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Modal.jsx
try { (() => {
const cx = (...a) => a.filter(Boolean).join(' ');
function Modal({
  open = true,
  title,
  onClose,
  footer,
  footerMeta,
  size = 'md',
  children
}) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const k = e => {
      if (e.key === 'Escape' && onClose) onClose();
    };
    window.addEventListener('keydown', k);
    const f = ref.current && ref.current.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    f && f.focus({
      preventScroll: true
    });
    return () => window.removeEventListener('keydown', k);
  }, [open]);
  if (!open) return null;
  const tid = 'modal-title-' + String(title).replace(/\W+/g, '-').toLowerCase();
  return /*#__PURE__*/React.createElement("div", {
    className: "ui-scrim",
    onPointerDown: e => {
      if (e.target === e.currentTarget && onClose) onClose();
    }
  }, /*#__PURE__*/React.createElement("div", {
    ref: ref,
    className: cx('ui-modal', size !== 'md' && 'ui-modal--' + size),
    role: "dialog",
    "aria-modal": "true",
    "aria-labelledby": tid
  }, /*#__PURE__*/React.createElement("div", {
    className: "ui-modal__head"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "ui-modal__title",
    id: tid
  }, title), onClose && /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "ui-btn ui-btn--ghost ui-btn--icon",
    "aria-label": "Close dialog",
    onClick: onClose
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "close"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "ui-modal__body"
  }, children), footer && /*#__PURE__*/React.createElement("div", {
    className: "ui-modal__foot"
  }, footerMeta && /*#__PURE__*/React.createElement("span", {
    className: "ui-modal__foot-meta"
  }, footerMeta), footer)));
}
Object.assign(__ds_scope, { Modal });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Modal.jsx", error: String((e && e.message) || e) }); }

// components/feedback/ProgressBar.jsx
try { (() => {
const cx = (...a) => a.filter(Boolean).join(' ');
function ProgressBar({
  value = 0,
  indeterminate,
  label,
  detail,
  status = 'default'
}) {
  const pct = Math.round(Math.min(100, Math.max(0, value)));
  return /*#__PURE__*/React.createElement("div", {
    className: cx('ui-progress', indeterminate && 'ui-progress--indeterminate', status !== 'default' && 'is-' + status)
  }, (label || detail) && /*#__PURE__*/React.createElement("div", {
    className: "ui-progress__meta"
  }, /*#__PURE__*/React.createElement("span", null, label), /*#__PURE__*/React.createElement("span", {
    className: "ui-mono"
  }, detail ?? (indeterminate ? '' : pct + '%'))), /*#__PURE__*/React.createElement("div", {
    className: "ui-progress__track",
    role: "progressbar",
    "aria-label": label || 'Progress',
    "aria-valuemin": 0,
    "aria-valuemax": 100,
    "aria-valuenow": indeterminate ? undefined : pct,
    "aria-valuetext": indeterminate ? 'Working' : status === 'paused' ? 'Paused at ' + pct + '%' : undefined
  }, /*#__PURE__*/React.createElement("div", {
    className: "ui-progress__fill",
    style: {
      '--value': pct + '%'
    }
  })));
}
Object.assign(__ds_scope, { ProgressBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/ProgressBar.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Toast.jsx
try { (() => {
const ICON = {
  success: 'success',
  error: 'error',
  warning: 'warning',
  info: 'info'
};
function Toast({
  variant = 'info',
  title,
  children,
  action,
  onClose
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: 'ui-toast ui-toast--' + variant,
    role: variant === 'error' ? 'alert' : 'status'
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: ICON[variant],
    className: "ui-toast__icon",
    label: variant
  }), /*#__PURE__*/React.createElement("div", {
    className: "ui-toast__body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ui-toast__title"
  }, title), children && /*#__PURE__*/React.createElement("div", {
    className: "ui-toast__text"
  }, children), action && /*#__PURE__*/React.createElement("div", {
    className: "ui-toast__actions"
  }, /*#__PURE__*/React.createElement(__ds_scope.Button, {
    size: "sm",
    variant: "secondary",
    onClick: action.onClick
  }, action.label))), onClose && /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm",
    "aria-label": "Dismiss notification",
    onClick: onClose
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "close"
  })));
}
Object.assign(__ds_scope, { Toast });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Toast.jsx", error: String((e && e.message) || e) }); }

// components/feedback/WarningBanner.jsx
try { (() => {
const ICON = {
  warning: 'warning',
  error: 'error',
  info: 'info'
};
function WarningBanner({
  variant = 'warning',
  title,
  children,
  actions,
  onDismiss
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: 'ui-banner' + (variant !== 'warning' ? ' ui-banner--' + variant : ''),
    role: variant === 'info' ? 'status' : 'alert'
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: ICON[variant],
    label: variant
  }), /*#__PURE__*/React.createElement("div", {
    className: "ui-banner__body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ui-banner__title"
  }, title), children && /*#__PURE__*/React.createElement("div", {
    className: "ui-banner__text"
  }, children)), (actions || onDismiss) && /*#__PURE__*/React.createElement("div", {
    className: "ui-banner__actions"
  }, actions, onDismiss && /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm",
    "aria-label": "Dismiss",
    onClick: onDismiss
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "close"
  }))));
}
Object.assign(__ds_scope, { WarningBanner });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/WarningBanner.jsx", error: String((e && e.message) || e) }); }

// components/forms/ColorSwatch.jsx
try { (() => {
const cx = (...a) => a.filter(Boolean).join(' ');
const PRESETS = ['#FFFFFF', '#0C0E12', '#F23DC8', '#2DD3F0', '#45D98F', '#FFBC47', '#FF6B78', '#6AABFF'];
function hsvToHex(h, s, v) {
  const f = n => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(Math.min(k, 4 - k, 1), 0);
  };
  return '#' + [f(5), f(3), f(1)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}
function hexToHsv(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b),
    mn = Math.min(r, g, b),
    d = mx - mn;
  let h = 0;
  if (d) {
    h = mx === r ? (g - b) / d % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, mx ? d / mx : 0, mx];
}
function ColorPicker({
  value,
  onChange,
  presets = PRESETS
}) {
  const [hsv, setHsv] = React.useState(() => hexToHsv(value));
  const [hexDraft, setHexDraft] = React.useState(null);
  const emit = n => {
    setHsv(n);
    onChange && onChange(hsvToHex(...n));
  };
  const sv = React.useRef(null);
  const drag = e => {
    const r = sv.current.getBoundingClientRect();
    const s = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const v = 1 - Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    emit([hsv[0], s, v]);
  };
  const onDown = e => {
    drag(e);
    const mv = ev => drag(ev);
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };
  const svKey = e => {
    const d = e.shiftKey ? 0.1 : 0.02;
    const [h, s, v] = hsv;
    const m = {
      ArrowLeft: [h, s - d, v],
      ArrowRight: [h, s + d, v],
      ArrowUp: [h, s, v + d],
      ArrowDown: [h, s, v - d]
    }[e.key];
    if (m) {
      e.preventDefault();
      emit([m[0], Math.min(1, Math.max(0, m[1])), Math.min(1, Math.max(0, m[2]))]);
    }
  };
  const hex = hsvToHex(...hsv);
  return /*#__PURE__*/React.createElement("div", {
    className: "ui-popover",
    role: "dialog",
    "aria-label": "Color picker",
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    ref: sv,
    className: "ui-picker__sv",
    style: {
      '--h': hsv[0]
    },
    onPointerDown: onDown,
    tabIndex: 0,
    role: "slider",
    "aria-label": "Saturation and brightness",
    "aria-valuetext": 'Saturation ' + Math.round(hsv[1] * 100) + '%, brightness ' + Math.round(hsv[2] * 100) + '%',
    onKeyDown: svKey
  }, /*#__PURE__*/React.createElement("span", {
    className: "ui-picker__thumb",
    style: {
      left: hsv[1] * 100 + '%',
      top: (1 - hsv[2]) * 100 + '%',
      background: hex
    }
  })), /*#__PURE__*/React.createElement("input", {
    className: "ui-picker__hue",
    type: "range",
    min: "0",
    max: "360",
    value: Math.round(hsv[0]),
    "aria-label": "Hue",
    onChange: e => emit([Number(e.target.value), hsv[1], hsv[2]])
  }), /*#__PURE__*/React.createElement("div", {
    className: "ui-picker__row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ui-field",
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "ui-num__unit"
  }, "HEX"), /*#__PURE__*/React.createElement("input", {
    className: "ui-mono",
    "aria-label": "Hex value",
    value: hexDraft ?? hex,
    onChange: e => setHexDraft(e.target.value),
    onBlur: () => {
      if (/^#?[0-9a-f]{6}$/i.test(hexDraft || '')) emit(hexToHsv('#' + hexDraft.replace('#', '')));
      setHexDraft(null);
    }
  }))), /*#__PURE__*/React.createElement("div", {
    className: "ui-picker__presets",
    role: "group",
    "aria-label": "Preset colors"
  }, presets.map(p => /*#__PURE__*/React.createElement("button", {
    key: p,
    type: "button",
    className: "ui-picker__preset",
    style: {
      '--swatch': p
    },
    "aria-label": p,
    "aria-pressed": p === hex,
    onClick: () => emit(hexToHsv(p))
  }))));
}
function ColorSwatch({
  value,
  defaultValue = '#F23DC8',
  onChange,
  label = 'Color',
  disabled,
  error,
  state,
  open: openProp
}) {
  const [inner, setInner] = React.useState(defaultValue);
  const [open, setOpen] = React.useState(!!openProp);
  const c = value ?? inner;
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const k = e => {
      if (e.key === 'Escape') setOpen(false);
    };
    const d = e => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener('keydown', k);
    window.addEventListener('pointerdown', d);
    return () => {
      window.removeEventListener('keydown', k);
      window.removeEventListener('pointerdown', d);
    };
  }, [open]);
  return /*#__PURE__*/React.createElement("span", {
    ref: ref,
    style: {
      position: 'relative',
      display: 'inline-block'
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: cx('ui-swatch', error && 'is-error', state && 'is-' + state),
    "aria-label": label + ': ' + c,
    "aria-haspopup": "dialog",
    "aria-expanded": open,
    disabled: disabled,
    onClick: () => setOpen(!open)
  }, /*#__PURE__*/React.createElement("span", {
    className: "ui-swatch__chip",
    style: {
      '--swatch': c
    }
  }), c), open && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 'calc(100% + 6px)',
      left: 0,
      zIndex: 'var(--z-popover)'
    }
  }, /*#__PURE__*/React.createElement(ColorPicker, {
    value: c,
    onChange: n => {
      setInner(n);
      onChange && onChange(n);
    }
  })));
}
Object.assign(__ds_scope, { ColorPicker, ColorSwatch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/ColorSwatch.jsx", error: String((e && e.message) || e) }); }

// components/forms/Field.jsx
try { (() => {
function Field({
  label,
  htmlFor,
  help,
  error,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "ui-formrow"
  }, label && /*#__PURE__*/React.createElement("label", {
    className: "ui-label",
    htmlFor: htmlFor
  }, label), children, error ? /*#__PURE__*/React.createElement("span", {
    className: "ui-help ui-help--error",
    role: "alert"
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "error"
  }), error) : help ? /*#__PURE__*/React.createElement("span", {
    className: "ui-help"
  }, help) : null);
}
Object.assign(__ds_scope, { Field });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Field.jsx", error: String((e && e.message) || e) }); }

// components/forms/NumberScrub.jsx
try { (() => {
const cx = (...a) => a.filter(Boolean).join(' ');
function NumberScrub({
  label,
  ariaLabel,
  value,
  defaultValue = 0,
  onChange,
  step = 1,
  min = -Infinity,
  max = Infinity,
  precision = 0,
  unit,
  disabled,
  error,
  state,
  width,
  id
}) {
  const [inner, setInner] = React.useState(defaultValue);
  const [draft, setDraft] = React.useState(null);
  const [scrub, setScrub] = React.useState(false);
  const v = value ?? inner;
  const set = n => {
    n = Math.min(max, Math.max(min, Number(Number(n).toFixed(precision))));
    setInner(n);
    onChange && onChange(n);
  };
  const onDown = e => {
    if (disabled) return;
    e.preventDefault();
    const x0 = e.clientX,
      v0 = v;
    setScrub(true);
    const move = ev => {
      const k = ev.shiftKey ? 10 : ev.altKey ? 0.1 : 1;
      set(v0 + Math.round((ev.clientX - x0) / 2) * step * k);
    };
    const up = () => {
      setScrub(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const onKey = e => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const k = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
      set(v + (e.key === 'ArrowUp' ? 1 : -1) * step * k);
    }
    if (e.key === 'Enter') e.currentTarget.blur();
    if (e.key === 'Escape') {
      setDraft(null);
      e.currentTarget.blur();
    }
  };
  const commit = () => {
    if (draft != null) {
      const n = parseFloat(draft);
      if (!isNaN(n)) set(n);
      setDraft(null);
    }
  };
  return /*#__PURE__*/React.createElement("div", {
    className: cx('ui-field', 'ui-num', scrub && 'is-scrubbing', error && 'is-error', disabled && 'is-disabled', state && 'is-' + state),
    style: width ? {
      width
    } : undefined
  }, label && /*#__PURE__*/React.createElement("span", {
    className: "ui-num__label",
    onPointerDown: onDown,
    title: "Drag to scrub \xB7 Shift \xD710 \xB7 Alt \xD70.1",
    "aria-hidden": "true"
  }, label), /*#__PURE__*/React.createElement("input", {
    id: id,
    type: "text",
    inputMode: "decimal",
    role: "spinbutton",
    "aria-label": ariaLabel || label,
    "aria-valuenow": v,
    "aria-invalid": error ? true : undefined,
    disabled: disabled,
    value: draft ?? Number(v).toFixed(precision),
    onChange: e => setDraft(e.target.value),
    onBlur: commit,
    onKeyDown: onKey,
    onFocus: e => e.target.select()
  }), unit && /*#__PURE__*/React.createElement("span", {
    className: "ui-num__unit",
    "aria-hidden": "true"
  }, unit));
}
Object.assign(__ds_scope, { NumberScrub });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/NumberScrub.jsx", error: String((e && e.message) || e) }); }

// components/forms/SegmentedControl.jsx
try { (() => {
const cx = (...a) => a.filter(Boolean).join(' ');
function SegmentedControl({
  options = [],
  value,
  defaultValue,
  onChange,
  label,
  block
}) {
  const [inner, setInner] = React.useState(defaultValue ?? (options[0] && options[0].value));
  const v = value ?? inner;
  const refs = React.useRef([]);
  const pick = o => {
    setInner(o.value);
    onChange && onChange(o.value);
  };
  const onKey = (e, i) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    let j = i;
    for (let n = 0; n < options.length; n++) {
      j = (j + d + options.length) % options.length;
      if (!options[j].disabled) break;
    }
    pick(options[j]);
    refs.current[j] && refs.current[j].focus();
  };
  return /*#__PURE__*/React.createElement("div", {
    role: "radiogroup",
    "aria-label": label,
    className: cx('ui-seg', block && 'ui-seg--block')
  }, options.map((o, i) => /*#__PURE__*/React.createElement("button", {
    key: o.value,
    ref: el => refs.current[i] = el,
    type: "button",
    role: "radio",
    "aria-checked": v === o.value,
    tabIndex: v === o.value ? 0 : -1,
    disabled: o.disabled,
    "aria-label": o.iconOnly ? o.label : undefined,
    className: cx('ui-seg__opt', o.state && 'is-' + o.state),
    onClick: () => pick(o),
    onKeyDown: e => onKey(e, i)
  }, o.icon && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: o.icon
  }), !o.iconOnly && o.label)));
}
Object.assign(__ds_scope, { SegmentedControl });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/SegmentedControl.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
const cx = (...a) => a.filter(Boolean).join(' ');
function Select({
  options = [],
  value,
  defaultValue,
  onChange,
  label,
  disabled,
  error,
  state,
  id,
  width
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: cx('ui-field', 'ui-select', error && 'is-error', disabled && 'is-disabled', state && 'is-' + state),
    style: width ? {
      width
    } : undefined
  }, /*#__PURE__*/React.createElement("select", {
    id: id,
    "aria-label": label,
    value: value,
    defaultValue: defaultValue,
    disabled: disabled,
    "aria-invalid": error ? true : undefined,
    onChange: e => onChange && onChange(e.target.value)
  }, options.map(o => {
    const opt = typeof o === 'string' ? {
      value: o,
      label: o
    } : o;
    return /*#__PURE__*/React.createElement("option", {
      key: opt.value,
      value: opt.value,
      disabled: opt.disabled
    }, opt.label);
  })), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "chevron-down"
  }));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/forms/Slider.jsx
try { (() => {
const cx = (...a) => a.filter(Boolean).join(' ');
function Slider({
  label,
  value,
  defaultValue = 50,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  showValue = true,
  format,
  disabled,
  state,
  id
}) {
  const [inner, setInner] = React.useState(defaultValue);
  const v = value ?? inner;
  const p = (v - min) / (max - min) * 100;
  const fmt = format || (n => String(n));
  return /*#__PURE__*/React.createElement("div", {
    className: cx('ui-slider', disabled && 'is-disabled', state && 'is-' + state)
  }, /*#__PURE__*/React.createElement("input", {
    id: id,
    type: "range",
    "aria-label": label,
    min: min,
    max: max,
    step: step,
    value: v,
    disabled: disabled,
    style: {
      '--p': p + '%'
    },
    onChange: e => {
      const n = Number(e.target.value);
      setInner(n);
      onChange && onChange(n);
    },
    "aria-valuetext": fmt(v)
  }), showValue && /*#__PURE__*/React.createElement("output", {
    className: "ui-slider__value",
    "aria-hidden": "true"
  }, fmt(v)));
}
Object.assign(__ds_scope, { Slider });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Slider.jsx", error: String((e && e.message) || e) }); }

// components/forms/TextArea.jsx
try { (() => {
const cx = (...a) => a.filter(Boolean).join(' ');
function TextArea({
  value,
  defaultValue = '',
  onChange,
  label,
  placeholder,
  rows = 3,
  maxLength,
  stage,
  disabled,
  error,
  state,
  id
}) {
  const [inner, setInner] = React.useState(defaultValue);
  const v = value ?? inner;
  return /*#__PURE__*/React.createElement("div", {
    className: "ui-formrow"
  }, /*#__PURE__*/React.createElement("div", {
    className: cx('ui-field', 'ui-textarea', stage && 'ui-textarea--stage', error && 'is-error', disabled && 'is-disabled', state && 'is-' + state)
  }, /*#__PURE__*/React.createElement("textarea", {
    id: id,
    "aria-label": label,
    rows: rows,
    placeholder: placeholder,
    maxLength: maxLength,
    disabled: disabled,
    "aria-invalid": error ? true : undefined,
    value: v,
    onChange: e => {
      setInner(e.target.value);
      onChange && onChange(e.target.value);
    }
  })), maxLength && /*#__PURE__*/React.createElement("span", {
    className: "ui-help ui-mono",
    style: {
      justifyContent: 'flex-end'
    }
  }, v.length, "/", maxLength));
}
Object.assign(__ds_scope, { TextArea });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/TextArea.jsx", error: String((e && e.message) || e) }); }

// components/forms/Toggle.jsx
try { (() => {
const cx = (...a) => a.filter(Boolean).join(' ');
function Toggle({
  checked,
  defaultChecked = false,
  onChange,
  label,
  showState,
  disabled,
  state
}) {
  const [inner, setInner] = React.useState(defaultChecked);
  const on = checked ?? inner;
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    role: "switch",
    "aria-checked": on,
    disabled: disabled,
    className: cx('ui-toggle', state && 'is-' + state),
    onClick: () => {
      setInner(!on);
      onChange && onChange(!on);
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "ui-toggle__track"
  }, /*#__PURE__*/React.createElement("span", {
    className: "ui-toggle__thumb"
  })), showState && /*#__PURE__*/React.createElement("span", {
    className: "ui-toggle__state",
    "aria-hidden": "true"
  }, on ? 'On' : 'Off'), label);
}
Object.assign(__ds_scope, { Toggle });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Toggle.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Tabs.jsx
try { (() => {
const cx = (...a) => a.filter(Boolean).join(' ');
function Tabs({
  tabs = [],
  value,
  defaultValue,
  onChange,
  label,
  idPrefix = 'tabs'
}) {
  const [inner, setInner] = React.useState(defaultValue ?? (tabs[0] && tabs[0].id));
  const v = value ?? inner;
  const refs = React.useRef([]);
  const pick = id => {
    setInner(id);
    onChange && onChange(id);
  };
  const onKey = (e, i) => {
    const map = {
      ArrowRight: 1,
      ArrowLeft: -1
    };
    let j = i;
    if (e.key === 'Home') j = 0;else if (e.key === 'End') j = tabs.length - 1;else if (map[e.key]) {
      do {
        j = (j + map[e.key] + tabs.length) % tabs.length;
      } while (tabs[j].disabled && j !== i);
    } else return;
    e.preventDefault();
    pick(tabs[j].id);
    refs.current[j] && refs.current[j].focus();
  };
  const active = tabs.find(t => t.id === v);
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    role: "tablist",
    "aria-label": label,
    className: "ui-tabs"
  }, tabs.map((t, i) => /*#__PURE__*/React.createElement("button", {
    key: t.id,
    ref: el => refs.current[i] = el,
    role: "tab",
    type: "button",
    id: idPrefix + '-tab-' + t.id,
    "aria-controls": idPrefix + '-panel-' + t.id,
    "aria-selected": v === t.id,
    tabIndex: v === t.id ? 0 : -1,
    disabled: t.disabled,
    className: cx('ui-tab', t.state && 'is-' + t.state),
    onClick: () => pick(t.id),
    onKeyDown: e => onKey(e, i)
  }, t.label, t.count != null && /*#__PURE__*/React.createElement("span", {
    className: "ui-tab__count"
  }, t.count)))), active && active.content != null && /*#__PURE__*/React.createElement("div", {
    role: "tabpanel",
    className: "ui-tabpanel",
    id: idPrefix + '-panel-' + active.id,
    "aria-labelledby": idPrefix + '-tab-' + active.id,
    tabIndex: 0
  }, active.content));
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Tabs.jsx", error: String((e && e.message) || e) }); }

// components/timeline/Checkerboard.jsx
try { (() => {
function Checkerboard({
  size = 16,
  style,
  className,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: 'ui-checker' + (className ? ' ' + className : ''),
    style: {
      '--checker-size': size + 'px',
      ...style
    }
  }, children);
}
Object.assign(__ds_scope, { Checkerboard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/timeline/Checkerboard.jsx", error: String((e && e.message) || e) }); }

// components/timeline/EasingCurve.jsx
try { (() => {
const cx = (...a) => a.filter(Boolean).join(' ');
const EASINGS = {
  linear: [0, 0, 1, 1],
  easeIn: [0.42, 0, 1, 1],
  easeOut: [0, 0, 0.58, 1],
  easeInOut: [0.42, 0, 0.58, 1]
};
function EasingCurve({
  easing = 'easeInOut',
  bezier,
  size = 88,
  showLane = true,
  showName = true,
  selected
}) {
  const b = bezier || EASINGS[easing] || EASINGS.linear;
  const P = (x, y) => [x * 100, 100 - y * 100];
  const [p1, p2] = [P(b[0], b[1]), P(b[2], b[3])];
  const fn = 'cubic-bezier(' + b.join(',') + ')';
  return /*#__PURE__*/React.createElement("div", {
    className: cx('ui-ease', selected && 'is-selected'),
    style: {
      '--ease-size': size + 'px',
      '--ease-fn': fn
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "ui-ease__plot",
    role: "img",
    "aria-label": (bezier ? 'Custom' : easing) + ' easing curve, ' + fn
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 100 100",
    preserveAspectRatio: "none"
  }, /*#__PURE__*/React.createElement("line", {
    className: "ui-ease__handle",
    x1: "0",
    y1: "100",
    x2: p1[0],
    y2: p1[1],
    vectorEffect: "non-scaling-stroke"
  }), /*#__PURE__*/React.createElement("line", {
    className: "ui-ease__handle",
    x1: "100",
    y1: "0",
    x2: p2[0],
    y2: p2[1],
    vectorEffect: "non-scaling-stroke"
  }), /*#__PURE__*/React.createElement("path", {
    className: "ui-ease__curve",
    d: 'M0 100C' + p1.join(' ') + ' ' + p2.join(' ') + ' 100 0',
    vectorEffect: "non-scaling-stroke"
  }))), showLane && /*#__PURE__*/React.createElement("div", {
    className: "ui-ease__lane",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("span", {
    className: "ui-ease__dot"
  })), showName && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "ui-ease__name"
  }, bezier ? 'custom' : easing), /*#__PURE__*/React.createElement("div", {
    className: "ui-ease__val"
  }, b.join(', '))));
}
Object.assign(__ds_scope, { EASINGS, EasingCurve });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/timeline/EasingCurve.jsx", error: String((e && e.message) || e) }); }

// components/timeline/Keyframe.jsx
try { (() => {
const cx = (...a) => a.filter(Boolean).join(' ');
function Keyframe({
  selected,
  easing = 'ease',
  time,
  property,
  disabled,
  state,
  onSelect
}) {
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: cx('ui-kf', easing !== 'linear' && 'ui-kf--' + easing, state && 'is-' + state),
    "aria-pressed": !!selected,
    disabled: disabled,
    onClick: onSelect,
    "aria-label": 'Keyframe' + (property ? ' ' + property : '') + (time != null ? ' at ' + time : '') + ', ' + easing
  });
}
Object.assign(__ds_scope, { Keyframe });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/timeline/Keyframe.jsx", error: String((e && e.message) || e) }); }

// components/timeline/TimelineRuler.jsx
try { (() => {
function formatTimecode(t, fps = 30) {
  const s = Math.floor(t);
  const f = Math.round((t - s) * fps);
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0') + ':' + String(f).padStart(2, '0');
}
function TimelineRuler({
  duration = 6,
  pxPerSecond = 120,
  fps = 30,
  inPoint,
  outPoint,
  onSeek,
  children
}) {
  const minor = pxPerSecond >= 160 ? pxPerSecond / 10 : pxPerSecond / 5;
  const step = pxPerSecond < 60 ? 2 : pxPerSecond >= 240 ? 0.5 : 1;
  const marks = [];
  for (let t = 0; t <= duration + 1e-6; t += step) marks.push(t);
  return /*#__PURE__*/React.createElement("div", {
    className: "ui-ruler",
    style: {
      '--tick': minor + 'px',
      width: duration * pxPerSecond + 1
    },
    onPointerDown: e => {
      if (!onSeek) return;
      const r = e.currentTarget.getBoundingClientRect();
      onSeek(Math.max(0, Math.min(duration, (e.clientX - r.left) / pxPerSecond)));
    },
    "aria-hidden": "true"
  }, inPoint != null && /*#__PURE__*/React.createElement("span", {
    className: "ui-ruler__range",
    style: {
      left: inPoint * pxPerSecond,
      width: ((outPoint ?? duration) - inPoint) * pxPerSecond
    }
  }), marks.map(t => /*#__PURE__*/React.createElement("span", {
    key: t,
    className: "ui-ruler__mark",
    style: {
      left: t * pxPerSecond
    }
  }, /*#__PURE__*/React.createElement("span", null, formatTimecode(t, fps).slice(3)))), children);
}
Object.assign(__ds_scope, { formatTimecode, TimelineRuler });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/timeline/TimelineRuler.jsx", error: String((e && e.message) || e) }); }

// components/timeline/Playhead.jsx
try { (() => {
const cx = (...a) => a.filter(Boolean).join(' ');
function Playhead({
  time = 0,
  pxPerSecond = 120,
  fps = 30,
  duration = 6,
  onScrub,
  showTime = true,
  state
}) {
  const [scrub, setScrub] = React.useState(false);
  const onDown = e => {
    e.preventDefault();
    setScrub(true);
    const x0 = e.clientX,
      t0 = time;
    const mv = ev => onScrub && onScrub(Math.max(0, Math.min(duration, t0 + (ev.clientX - x0) / pxPerSecond)));
    const up = () => {
      setScrub(false);
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };
  const onKey = e => {
    const f = 1 / fps;
    const d = {
      ArrowRight: f,
      ArrowLeft: -f
    }[e.key];
    if (d != null) {
      e.preventDefault();
      onScrub && onScrub(Math.max(0, Math.min(duration, time + d * (e.shiftKey ? 10 : 1))));
    }
    if (e.key === 'Home') onScrub && onScrub(0);
    if (e.key === 'End') onScrub && onScrub(duration);
  };
  const tc = __ds_scope.formatTimecode(time, fps);
  return /*#__PURE__*/React.createElement("div", {
    className: cx('ui-playhead', scrub && 'is-scrubbing', state && 'is-' + state),
    style: {
      '--x': time * pxPerSecond + 'px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "ui-playhead__line"
  }), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "ui-playhead__head",
    role: "slider",
    "aria-label": "Playhead",
    "aria-valuemin": 0,
    "aria-valuemax": duration,
    "aria-valuenow": Number(time.toFixed(2)),
    "aria-valuetext": tc,
    onPointerDown: onDown,
    onKeyDown: onKey
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 14 18",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M1 0h12a1 1 0 0 1 1 1v9.6a1 1 0 0 1-.4.8L7.6 17.7a1 1 0 0 1-1.2 0L.4 11.4a1 1 0 0 1-.4-.8V1a1 1 0 0 1 1-1z"
  }))), showTime && /*#__PURE__*/React.createElement("span", {
    className: "ui-playhead__time"
  }, tc));
}
Object.assign(__ds_scope, { Playhead });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/timeline/Playhead.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Chip = __ds_scope.Chip;

__ds_ns.CodeBlock = __ds_scope.CodeBlock;

__ds_ns.LayerRow = __ds_scope.LayerRow;

__ds_ns.PresetCard = __ds_scope.PresetCard;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Icon = __ds_scope.Icon;

__ds_ns.ICON_NAMES = __ds_scope.ICON_NAMES;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.Tooltip = __ds_scope.Tooltip;

__ds_ns.ICONS = __ds_scope.ICONS;

__ds_ns.Modal = __ds_scope.Modal;

__ds_ns.ProgressBar = __ds_scope.ProgressBar;

__ds_ns.Toast = __ds_scope.Toast;

__ds_ns.WarningBanner = __ds_scope.WarningBanner;

__ds_ns.ColorPicker = __ds_scope.ColorPicker;

__ds_ns.ColorSwatch = __ds_scope.ColorSwatch;

__ds_ns.Field = __ds_scope.Field;

__ds_ns.NumberScrub = __ds_scope.NumberScrub;

__ds_ns.SegmentedControl = __ds_scope.SegmentedControl;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Slider = __ds_scope.Slider;

__ds_ns.TextArea = __ds_scope.TextArea;

__ds_ns.Toggle = __ds_scope.Toggle;

__ds_ns.Tabs = __ds_scope.Tabs;

__ds_ns.Checkerboard = __ds_scope.Checkerboard;

__ds_ns.EASINGS = __ds_scope.EASINGS;

__ds_ns.EasingCurve = __ds_scope.EasingCurve;

__ds_ns.Keyframe = __ds_scope.Keyframe;

__ds_ns.Playhead = __ds_scope.Playhead;

__ds_ns.TimelineRuler = __ds_scope.TimelineRuler;

})();
