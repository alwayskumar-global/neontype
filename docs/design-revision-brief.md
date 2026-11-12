# Design revision brief: Studio Editor, Export Flow, Effects Library

Paste this into Claude Design. It lists what to change so the screens can be wired to the real app with no dead controls. Landing Page and Error States are not part of this round. Gap IDs (D-1 to D-10) point to the project's design gap table.

**Rules.** (1) Every control that stays gets the exact binding name below; a name is a handler (a click or change), a value (text, number, list), or a visibility flag (true or false). (2) Names marked ★ are new in this brief; use them exactly. (3) Anything not listed under "Keep" or "Add" comes out. (4) No control may exist without a binding, and no binding without a control.

## 1. Studio Editor

**Add**

| What | Bindings | Gap |
| --- | --- | --- |
| Stage: an empty named region that hosts the live preview; its aspect ratio follows the project (any ratio, not 1:1) | slot `stage`★, value `stageAspect`★ (e.g. "16 / 9") | D-1 |
| Timeline: an empty named region for the live timeline (it owns the ruler, bars, handles and playhead) | slot `timeline`★ | D-1 |
| Top bar: New, Load demo, Save, Open, Export | handlers `onNew`★, `onLoadDemo`★, `onSave`★, `onOpen`★, `onExport`★ | D-2 |
| Undo (no Redo) | handler `undo`★, visibility `canUndo`★ (disabled when false) | D-2 |
| Project panel: size preset, width, height, fps, duration, background colour, transparent toggle, one inline error line | `canvasPreset`★, `canvasPresetOpts`★, `onCanvasPreset`★, `canvasWidth`★, `onCanvasWidth`★, `canvasHeight`★, `onCanvasHeight`★, `fps`★, `onFps`★, `duration`★, `onDuration`★, `background`★, `onBackground`★, `transparent`★, `onTransparent`★, `settingsError`★, `hasSettingsError`★ | D-2 |
| Layers list with Add layer | list `layers`★ (row: `name`, `selected`, `select`, `moveUp`, `moveDown`, `canMoveUp`, `canMoveDown`, `remove`), handler `addLayer`★ | D-2 |
| Inspector for the selected layer (shown only when a layer is selected) | visibility `hasLayer`★; text `layerText`★ `onLayerText`★; font `font`★ `fontOpts`★ `onFont`★; weight `weight`★ `weightOpts`★ `onWeight`★; `size`★ `onSize`★; colour `fill`★ `onFill`★; align `alignOpts`★ (row: `label`, `on`, `pick`); `anchorX`★ `onAnchorX`★ `anchorY`★ `onAnchorY`★; `layerStart`★ `onLayerStart`★ `layerDuration`★ `onLayerDuration`★ | D-2 |
| Effects on this layer, plus an Add effect button that opens the Effects Library | list `effects`★ (row: `name`, `split`, `splitOpts`, `onSplit`, `params` rows with `label`, `min`, `max`, `step`, `val`, `fmt`, `set`, `remove`), handler `addEffect`★ | D-2 |

**Remove**

| What | Why / gap |
| --- | --- |
| Redo button | not in v1 (D-2) |
| Keyframe diamonds, easing popover and curve, keyframe markers: `kfOpen`, `toggleKf`, `kfPos`, `kfOp`, `kfScale`, `posEase`, `easeOpts`, `curve`, `bezText` | no keyframe editing (D-2) |
| Blur, opacity, scale and rotation sliders: `opacity`, `opacityPct`, `scale`, `posY` | layers have none of these (D-2) |
| Zoom buttons: `zoomIn`, `zoomOut`, `zoomLabel` | no zoom in v1 (D-2) |
| Project-name input: `projectName`, `onName` (a read-only title is fine; then keep only `projectName`) | projects have no name (D-3) |
| The fake text in the stage and the mock selection box: `l1Chars`, `l2Words`, `l2dy`, `l2op`, `l2s`, `l3op`, `showSelection` | the live preview replaces it (D-1) |
| Warning banner and warning markers: `warning`, `noWarning`, `showBanner`, `hideBanner` | no warnings surface in v1 (D-2) |
| Presets tab and its filter chips, plus the tab switch: `presetGroups`, `tabPresets`, `tabLayers`, `showPresets`, `showLayers` | the Effects Library is the picker (D-2) |
| Ruler, track rows, playhead, Snap, timeline zoom, Help button: `ticks`, `rulerLabels`, `phLeft` | the timeline slot owns them; Help does nothing (D-2) |

**Keep** (names unchanged): `togglePlay`, `playing`, `paused`, `toStart`, `toEnd`, `toggleLoop`, `loop`, `noLoop`, `timecode`, `checker`, `noChecker`, `checkerAria`, `toggleChecker`, `safe`, `noSafe`, `safeAria`, `toggleSafe`. The checkerboard and safe-area overlay sit around the `stage` slot.

## 2. Export Flow

**Add** a card for **animated WebP**; the cards are formats, listed from `destCards`★ (card: `id`, `name`, `use`, `meta`, `icon`, `checked`, `limited`, `limitedReason`★, `pick`). WebM with alpha shows as a card that is never available (`limited` true, with `limitedReason`). Add value `thumbAspect`★ so thumbnails follow the project's aspect. (D-9)

**Remove**: Loop and Audio rows (`loop`, `onLoop`, `loopHelp`, `audio`, `onAudio`); the Web embed card and its options (`isEmbed`, `embedCode`, `embedLoop`, `embedPreview`, `embedSize`, `embedStart`, `embedTag`, `embedW`, `onEmbedLoop`, `onEmbedSize`, `onEmbedStart`, `sizeOpts`, `startOpts`); Fit/Fill framing (`framing`, `framingHelp`, `framingOpts`, `onFraming`, `needsFraming`, `noFraming`); the PNG/WebM sub-picker (`isMp4`, `isAlpha`, `pickPng`, `pickWebm`, `pngChecked`, `webmChecked`, `webmOk`, `unsupported`, `pngSize`, `webmSize`); the time-left text (`eta`); the frame-rate and duration pickers (`fpsOpts`, `onFps`, `onDur`). (D-4, D-9)

**Change**: Frame rate and Duration become plain read-only text bound to `fps` and `dur`; no card may assume a fixed aspect ratio, so drop the 9:16 / 1:1 / 16:9 labels and sizes; size options are scales of the project's own size (`res`, `resOpts`, `onRes`). (D-4, D-9)

**Addendum (D-4): close and download.** Three controls currently do nothing. Bind the Close X, the Cancel button on the format step, and the Done button on the success step to handler `onClose`★ (it closes the export dialog). Bind the Download button on the success step to handler `onDownload`★ (it saves the finished file).

**Keep** (names unchanged): `crumbs`, `s1`, `s2`, `s3`, `s4`, `s5`, `toOptions`, `toDest`, `d`, `res`, `resOpts`, `onRes`, `fps`, `dur`, `frames`, `framesText`, `frameTc`, `pct`, `pctText`, `exportSteps`, `estimate`, `outSummary`, `startExport`, `cancelExport`, `exportLabel`, `thumbW`, `stageInThumb`, `successTitle`, `successText`, `fileName`, `fileMeta`, `fileIcon`, `failText`, `errCode`, `tryNext`, plus two handlers added by the addendum below: `onClose`★ and `onDownload`★.

## 3. Effects Library

**Add**: the "Applying to" chip becomes data: `applyTarget`★ (layer text) and `applyTargetMeta`★ (small text beside it); the header count becomes `effectCount`★ (e.g. "12 effects"). (D-10)

**Remove**: the large preview area (`preview`). Thumbnails on the cards stay. (D-5)

**Change**: the Easing select shows only when `showEase`★ is true (five effects have no easing). (D-8) Sort offers two options: Catalog order and Name A to Z (`sortOptions`).

**Keep**: all other current bindings, unchanged.

## Acceptance checklist (tick before re-exporting)

- [ ] Stage and Timeline are empty named regions (`stage`, `timeline`); the stage ratio comes from `stageAspect`. (D-1)
- [ ] Top bar has New, Load demo, Save, Open, Undo, Export, each with its binding; there is no Redo. (D-2)
- [ ] The Project panel has all seven settings and the inline error line. (D-2)
- [ ] Layers list, Add layer, the Inspector fields and the effects list all carry the bindings in section 1. (D-2)
- [ ] No keyframe, blur, opacity, scale, rotation, zoom, Help, Snap, warning-banner or Presets-tab controls remain. (D-2)
- [ ] The project-name input is gone or read-only. (D-3)
- [ ] Export Flow has no Loop, Audio, Web embed, Fit/Fill or PNG/WebM sub-picker; Frame rate and Duration are read-only text; Close X, Cancel (format step) and Done carry `onClose`, and Download carries `onDownload`. (D-4)
- [ ] Export Flow cards: MP4, PNG sequence, GIF, WebP available; WebM alpha always unavailable with a reason; no fixed aspect ratios anywhere. (D-9)
- [ ] Effects Library has no large preview, a bound "Applying to" chip and effect count, and Easing only when `showEase`. (D-5, D-8, D-10)
- [ ] Every remaining control has a binding, and every binding is used by a control. (all)
