# Bundled fonts

Self-hosted, SIL Open Font License 1.1. No font is requested from a third party at runtime.

| Family | Files | Licence text | Used by |
|---|---|---|---|
| Noto Sans | `noto-sans-latin-{400,700}-normal.woff2` | `OFL-Noto-Sans.txt` | canvas, exports, studio UI |
| Noto Sans Tamil | `noto-sans-tamil-tamil-{400,700}-normal.woff2` | `OFL-Noto-Sans-Tamil.txt` | canvas, exports, studio UI |
| Instrument Sans | `InstrumentSans-400-700-latin{,-ext}.woff2` | `OFL-Instrument-Sans.txt` | design-system UI (`src/ds/ds.css`) |
| DM Mono | `DMMono-{400,500}-latin{,-ext}.woff2` | `OFL-DM-Mono.txt` | design-system UI (`src/ds/ds.css`) |

## Licence sources (verified, read-only lookup)

The licence texts were downloaded unmodified from the upstream `google/fonts` repository, pinned to the
commit that last changed each file.

| File | Source | Commit | Date |
|---|---|---|---|
| `OFL-Instrument-Sans.txt` (4403 bytes) | https://github.com/google/fonts/blob/2fc9491da70cf3e1bafd3c3da49244c5a496e9d5/ofl/instrumentsans/OFL.txt | `2fc9491da70cf3e1bafd3c3da49244c5a496e9d5` | 2023-04-13 |
| `OFL-DM-Mono.txt` (4484 bytes) | https://github.com/google/fonts/blob/d0623a232f5b64f5e1963dc88c66d7de8f25f872/ofl/dmmono/OFL.txt | `d0623a232f5b64f5e1963dc88c66d7de8f25f872` | 2021-05-20 |

Copyright lines, as they appear in those files:

- Instrument Sans: Copyright 2022 The Instrument Sans Project Authors (https://github.com/Instrument/instrument-sans)
- DM Mono: Copyright 2020 The DM Mono Project Authors (https://www.github.com/googlefonts/dm-mono)

## Font binaries

The Instrument Sans and DM Mono `.woff2` files were copied byte-for-byte from the design-system export
(`design/_ds/.../fonts/`). Their SHA-256:

```
21fac8da552a915e7a9fb84c5afaeb85d35507b2616346d592e78128c1cfe3e0  InstrumentSans-400-700-latin-ext.woff2
6219bc4bfdfc5d9b2201dcdf046218b122a758f932e25ed5f168f929b7ca2311  InstrumentSans-400-700-latin.woff2
7f8712cbbd64135f9e74a527475a97cd8c5a49d8e0a1de7a65f8e2c30c5214d9  DMMono-400-latin-ext.woff2
fd7521f3531a5ccfc655b25c4f22e9871df3ec141ad79bb27fde20d0df347b6d  DMMono-400-latin.woff2
e284f2a17fc9cca89cc30f496945bd9a2903010944a9469fb357924da21b6f6c  DMMono-500-latin-ext.woff2
0e263db52797086e763679c54f84ded8cc1249879bc27dca2bd5dd446f6d9f36  DMMono-500-latin.woff2
```

What was NOT verified: that these subset binaries are bit-identical to a particular upstream release. The
licence applies to the families, and the licence texts above are the upstream ones. The design-system's
Noto Sans Tamil file is deliberately not copied: the studio already declares that family, and a second
declaration with different files would change canvas and export glyphs.
