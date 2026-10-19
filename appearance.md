---
status: stable
formatVersion: "1.0"
---

# Appearance

An app's look is data: a set of design tokens, an optional dark variant, a few
escape hatches, the colour modes the app wears and the contrast it promises.
The renderer turns that data into CSS custom properties (`--pw-*`) on the page
root; blocks read only those properties. This document specifies the
appearance configuration, the token vocabulary, how layers combine, how modes
apply, and the contrast rules a renderer must keep.

Schemas:
[`schemas/appearance.schema.json`](schemas/appearance.schema.json) (the
configuration; generated from the reference schema `AppearanceConfigSchema`)
and [`schemas/appearance.theme.schema.json`](schemas/appearance.theme.schema.json)
(the token set; hand-written from the token vocabulary — see "Differences").

## 1. Where appearance lives

| Place | Shape |
|---|---|
| A page's receipt, `appearance` | `{ config: AppearanceConfig }` |
| The app, `app/definitions/appearance.json` (and the envelope's `appearance.json`) | see [definitions](definitions.md#appearancejson) |
| A `ui-appearance` atom, `atoms/appearance/<theme>/manifest.json` | an atom manifest whose `theme` member is a token set |

Selecting a theme atom copies its tokens into the configuration; nothing is
resolved by reference at render time.

## 2. The configuration

| Member | Type | Meaning |
|---|---|---|
| `theme` | token set | The light (base) tokens. |
| `darkTheme` | token set | Dark-variant overrides. Only the tokens set here change; the rest fall back to the resolved light values. When absent, a renderer MAY derive a dark variant. |
| `styleVariables` | `{ name: string }` | Extra custom properties outside the token vocabulary. |
| `keyframes` | `{ name: body }` | Page-scoped `@keyframes`; see §5. |
| `extensions` | object | Free-form, for forward compatibility. Readers ignore what they do not know. |
| `mode` | `{ policy?, contrast? }` | Colour-mode policy and contrast level (§4). Closed. |
| `brand` | `{ logo?, favicon? }` | References (URL or path, 1–2048 characters) to the app's logo and favicon. Closed. The logo belongs in the app's shell (its navbar), the favicon is the app icon; neither is a body block. |

Unknown top-level members are allowed and carried.

## 3. Tokens

A token set has nine groups; every group and every token is optional. Values
are CSS values (strings), except `zIndex`, whose values are integers.

| Group | Tokens | Custom properties |
|---|---|---|
| `colors` | `primary`, `secondary`, `accent`, `background`, `card`, `text`, `textMuted`, `border`, `error`, `success`, `warning`, `info`, `textOnPrimary` | `--pw-color-<kebab-name>`. `card` is the container colour's only name; a theme that carries `surface` is invalid. |
| `border` | `radius`, `radiusSmall`, `radiusLarge`, `radiusXl`, `radius2xl`, `radiusFull`, `width`, `style` | `--pw-border-radius{,-sm,-lg,-xl,-2xl,-full}`, `--pw-border-width`, `--pw-border-style` |
| `typography` | `fontFamily`, `headingFontFamily`, `monoFontFamily`, `baseFontSize`, `headingWeight`, `headingLineHeight`, `letterSpacing`, `bodyLineHeight`, `bodyWeight`, `bodyLetterSpacing`, `fontSizeXs`, `fontSizeSm`, `fontSizeLg`, `fontSizeXl`, `fontSize2xl`…`fontSize4xl`, `fontSizeH1`…`fontSizeH5` | `--pw-font-*`, `--pw-line-height-*`, `--pw-letter-spacing-*` |
| `spacing` | `base`, `xs`, `sm`, `md`, `lg`, `xl`, `xxl` | `--pw-spacing-base`, `--pw-space-{xs…xxl}` |
| `shadows` | `card`, `button`, `sm`, `md`, `lg`, `xl` | `--pw-shadow-*` |
| `motion` | `durationFast`, `durationNormal`, `durationSlow`, `easing`, `easingBounce` | `--pw-duration-*`, `--pw-easing*` |
| `layout` | `gap`, `padding`, `containerMaxWidth`, `gridGap`, `sectionPaddingY`, `sectionPaddingX` | `--pw-layout-*`, `--pw-space-section-{x,y}` |
| `focus` | `ringColor`, `ringWidth`, `ringOffset` | `--pw-focus-ring-{color,width,offset}` |
| `zIndex` | `sticky`, `nav`, `dropdown`, `drawer`, `modal`, `toast` | `--pw-z-*` |

A renderer MAY emit derived properties beyond these (for example
`--pw-color-primary-subtle`, `--pw-color-primary-ink`); a pack that depends on
a derived property declares it in its requirements so a host can refuse a pack
it cannot serve. A reader MUST ignore tokens it does not know.

### 3.2 Derived colour properties

A theme names fills; it does not name every ink that sits on them. The
reference renderer derives these from the `colors` group, and a renderer that
serves first-party packs SHOULD emit them, because their blocks read them. A
page reads them like any other property — `var(--pw-color-on-accent)` in a
block's `style`.

| Property | Emitted when | Value |
|---|---|---|
| `--pw-color-on-accent` | `accent` is set | Ink for text on an `accent` fill, meeting the text line (§4) against it. |
| `--pw-color-on-<status>` | that status colour is set (`error`, `success`, `warning`, `info`) | Ink for text on that status fill. |
| `--pw-color-<status>-ink` | that status colour is set | The status colour adjusted to read as text on `background` and `card`. |
| `--pw-color-text-on-card` | `card` is set | Text ink on a card: the theme's `text` when card and page are on the same lightness side, a contrasting ink when they are not (a white card on a dark page). Always a concrete colour, never a reference. |
| `--pw-color-text-muted-on-card` | `card` is set | Muted text ink on a card, derived the same way. |
| `--pw-color-primary-ink` | `primary` is set | `primary` adjusted to read as text on `card` (on `background` when there is no `card`). |
| `--pw-color-primary-subtle`, `--pw-color-accent-subtle` | `colors` is present | A light tint of the colour toward `background` (selected rows, soft chips). |
| `--pw-color-primary-strong` | `colors` is present | `primary` moved toward `text` (pressed and hover fills). |
| `--pw-color-surface-muted` | `colors` is present | `card` moved slightly toward `text` (a recessed band inside a card). |

The tint and shade properties are written as `color-mix()` over the role
properties, so they follow a theme that changes the role colour. A derived ink
never moves the fill it sits on; it moves the ink.

### 3.1 Layers

Tokens resolve in four layers, highest first:

1. a block's own `style`;
2. the block's variant logic;
3. the page's theme — merged per group over the app's (project) theme, which is
   merged per group over the renderer's defaults;
4. the renderer's defaults.

"Per group" means a page that sets `colors.primary` keeps every other colour
from the layer below.

The reference defaults (informative): primary `#4f46e5`, background `#ffffff`,
card `#f8fafc`, text `#1e293b`, border `#e2e8f0`, radius `0.375rem`, body font
`Inter, system-ui, -apple-system, sans-serif`, base size `1rem`, z-index scale
sticky 50 · nav 100 · dropdown 200 · drawer 300 · modal 400 · toast 500.

## 4. Modes and contrast

`mode.policy`:

| Value | Meaning |
|---|---|
| `system` (default) | Follow the visitor's device: the dark variant applies under `prefers-color-scheme: dark`. |
| `light` | Light only. A renderer MUST NOT emit a dark variant. |
| `dark` | Dark only. The dark variant is the only palette. |

Independently of the device, a renderer MUST apply the dark variant when the
page root carries `data-pw-theme="dark"` (an explicit toggle), unless the
policy is `light`.

`mode.contrast` is the contrast the app promises:

| Value | Text | UI components (focus ring, control edges) |
|---|---|---|
| `normal` (default) | 4.5:1 | 3:1 |
| `high` | 7:1 | 4.5:1 |

A renderer that derives colours (inks on a fill, a focus ring on the page, a
control border, the dark variant) MUST derive them to meet the promised lines
against what they sit on, keeping hue and saturation and moving lightness. In
particular: text on `primary` against `primary`; `primary` used as text against
`background` and `card`; the focus ring against the page ground in both
variants; control borders against the ground. Ratios are WCAG 2 contrast
ratios.

Unknown `policy` or `contrast` values in a stored document are read as the
defaults by the reference reader, but the schema refuses them; producers MUST
write only the listed values.

## 5. Keyframes

Each `keyframes` entry `name: body` is emitted as
`@keyframes pw-kf-<name> { <body> }`; a block references it as
`animation: pw-kf-<name> …`. The prefix keeps page keyframes from colliding
with the host page. A renderer MUST honour `prefers-reduced-motion`.

### 5.1 Built-in keyframes

A block's `style` cannot declare `@keyframes`, so a renderer provides a small
named set that any block may use from `style.animation` without a `keyframes`
entry — `"animation": "pw-pulse 1.5s ease-in-out infinite"`:

| Name | Motion |
|---|---|
| `pw-fade-in` | opacity 0 → 1 |
| `pw-slide-up` | in from 8px below, fading in |
| `pw-slide-down` | in from 8px above, fading in |
| `pw-scale-in` | in from 96% scale, fading in |
| `pw-spring-in` | in from 90% scale with an overshoot; the overshoot curve is the theme's `motion.easingBounce` |
| `pw-pulse` | opacity 1 → 0.45 → 1 (a loop) |
| `pw-bounce` | up by a quarter of the height and back (a loop) |
| `pw-spin` | one full turn (a loop) |
| `pw-marquee` | `translateX(0)` → `translateX(-50%)`: a strip holding its content twice scrolls seamlessly when looped |

The set is closed for this version: a renderer provides no keyframes for a
name outside it and outside the page's own `pw-kf-*` names, so a producer MUST
NOT rely on one. Under `prefers-reduced-motion: reduce` a
renderer runs every animation once and near-instantly.

## Differences from the reference schema

The reference schema for a token set (used to validate a `ui-appearance` atom's
`theme`) names fewer tokens than the vocabulary in §3 and drops what it does
not name: `focus`, `zIndex`, the radius scale beyond `radiusLarge`, the
typography scale beyond `fontSizeXs`, the spacing scale beyond `base`, and the
shadow ramp. It therefore accepts, for example, `zIndex.modal: "top"`, which
`appearance.theme.schema.json` refuses. Within the configuration
(`AppearanceConfigSchema`), `theme` and `darkTheme` are open objects. The
examples here are chosen where both agree; the hand-written token schema is the
normative one.

## Conformance

- `examples/appearance/{valid,invalid}/*.json` — configurations, checked
  against the JSON Schema and the reference schema.
- `examples/appearance.theme/{valid,invalid}/*.json` — token sets, checked
  against the hand-written schema and the reference token schema.
- Contrast derivation is exercised by the reference engine's tests; rendered
  fixtures (a theme in, the emitted custom properties out) are reserved for
  `fixtures/`.
