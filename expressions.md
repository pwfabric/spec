---
status: draft
formatVersion: "1.0"
---

# Expressions

A receipt binds data into a page with **expressions**: text between `{{` and
`}}` inside a string. This document specifies where expressions are read, the
names they can see, their grammar, the helpers and methods they may call, and
what a renderer does when one cannot be evaluated — so that a page renders the
same in any runtime.

There is no schema: an expression is a string inside documents that have their
own schemas ([receipt](receipt.md), [data-protocol](data-protocol.md)).

**Why draft.** The grammar and the helper list are restated from the reference
renderer. Two details are kept for compatibility and may change in a next
format version: a `-` between two name characters is part of the name (§4.1),
and `??` binds tighter than `&&` and `||` (§4.4). The status moves to stable
when the expression cases of the Conformance section exist and a second
renderer passes them.

## 1. Where expressions are read

| Place | What the expression sees | Notes |
|---|---|---|
| Block `props` — every string value, at any depth inside objects and arrays (the `action` prop included) | the page scope (§2) | §3 |
| Block `visibleWhen` / `if` | the page scope | §3.3 |
| Block `repeat` | the page scope | §5 |
| Data source `endpoint` | `state` only | see [data-protocol §2](data-protocol.md#2-data-sources) |
| Data source `query` and `aggregate` | `state` only | §3.4 |

Nothing else is evaluated. In particular a block's `id`, `type`, `style`,
`states`, `conditionalStates`, `groupStates` and `layout` are taken as written,
and the actions of a persistence `behaviors` entry are taken as written (a
`setState` value there is a literal, never an expression).

## 2. Names in the page scope

| Name | Value |
|---|---|
| `state` | The page state (`initialState`, then every `setState`). A runner MAY seed it from the address (see [envelope §4](envelope.md#4-per-page)). |
| `<sourceId>` | The data the source with that id is bound to (see [data-protocol](data-protocol.md)). Undefined until its first answer. A `rest`, `entity` or `graphql` source that answers with one object is bound as a list of one; a `static` or `state` source is bound as it is; an aggregate source is bound as `{ fn, field?, value, count }`. |
| `__loading.<id>` | `true` while the source is fetching, and before its first fetch has started. Always `false` for a `state` source and for a source only a form writes to. |
| `__anyLoading` | `true` when any source is loading. |
| `__errors.<id>` | The error message of the source's last fetch, or `null`. |
| `__anyError` | `true` when any source has an error. |
| `__status.<id>` | The HTTP status of the last answer, or `null` (network failure, not fetched, or not an HTTP source). |
| `__notFound.<id>` | `true` when that status is `404`. |
| `__idle.<id>` | `true` when the source was not fetched because a required path value of its endpoint is empty. |
| `__meta.<id>` | The envelope the source's `returns` unwrapped its rows from (`total`, `limit` …), or `null`. |
| `item`, `index` | Inside a `repeat`: the current element and its zero-based position (§5). |

A name that is none of these is `undefined`; it is not an error. A source id
SHOULD NOT be `state`, `item` or `index` and SHOULD NOT start with `__`: such a
source hides the reserved name, or is hidden by it.

## 3. Evaluation

### 3.1 Whole value and interpolation

A string that is **exactly one** expression, `"{{ … }}"`, is a whole value:
the prop receives the expression's value with its type — a list, an object, a
number, a boolean. `"items": "{{products}}"` passes the list.

A string that mixes text and expressions, `"Total: {{count}} items"`, is
interpolated: each expression is evaluated and written in as text, and the
prop receives a string. A value is written as JavaScript's `String(value)`
would write it, except that `undefined` and `null` are written as nothing:
`5` → `5`, `true` → `true`, a list → its elements joined by `,`, an object →
`[object Object]`. A producer SHOULD NOT interpolate lists and objects.

An expression cannot contain `}}`. In an interpolated string an expression
does not span lines.

### 3.2 When an expression fails

An expression **fails** on a syntax error, a call to a name that is not a
helper (§6), a helper that throws, or a method that is not allowed on its
value (§7). A path that
leads nowhere does not fail; it is `undefined` (§4.2).

- In a prop, a failed whole value leaves the string as written
  (`"{{foo(1)}}"`). One failed expression in an interpolated string leaves
  the **whole string** as written, the expressions that succeeded included.
- A renderer MUST NOT render a partial value of a failed expression.

### 3.3 Conditions

`visibleWhen` (or its shorthand `if`) hides the block, with its children, when
the value is falsy. Falsy is `undefined`, `null`, `false`, `0`, `NaN`, and the
strings `""`, `"false"`, `"undefined"`, `"null"` and `"0"` (after trimming,
case-insensitive). A condition that fails **hides** the block: a condition
left as written would be a non-empty string, which is truthy, and the block
would show forever.

A block hidden inside a `form` block stays mounted but not displayed, so its
inputs keep their values and stay part of the submission; anywhere else a
hidden block is not rendered.

### 3.4 In a query

In a data source's `query` and `aggregate`, a value that is exactly one
expression takes the value's type. When it resolves to `""` or `null`, or
fails, its key is **dropped**, so an empty search box or an "All" choice means
"no constraint" rather than `field eq ""`. A mixed string is interpolated; when
it fails it stays as written.

## 4. Grammar

### 4.1 Tokens

- **Names**: a letter, `_` or `$`, then letters, digits, `_` or `$`. A `-`
  directly between two name characters, with no space around it, is part of
  the name, because source ids are hyphenated: `hero-stats.0.text` reads the
  source `hero-stats`, and `count-1` is the name `count-1`. Subtraction is
  written with spaces: `count - 1`.
- **Numbers**: digits with an optional fraction, `12`, `4.5`. A leading `-` is a
  sign where no value precedes it (`-3`, `a * -3`). There is no exponent
  (`1e3`) and no leading dot (`.5`).
- **Strings**: in `'…'` or `"…"`; `\n` and `\t` are a newline and a tab, `\`
  before any other character is that character.
- **Literals**: `true`, `false`, `null`, `undefined`.
- **Punctuation**: `( ) [ ] . , ? :` and the operators of §4.4.

Any other character is a syntax error, as is anything left over after a
complete expression.

### 4.2 Paths

`a.b`, `a[0]`, `a.0`, `a[expr]` and `a["key"]` read a property or an element.
After a `.`, digits and keywords are property names (`rows.0`,
`item.default`). Reading from `undefined` or `null`, or a property a value
does not have, gives `undefined`. A string has one property, `length`.

**A list of one is read through.** Reading a property from a list that holds
exactly one element, where the list itself has no such property, reads it from
that element: `{{product.title}}` works when `product` is a single-record
source bound as a list of one. A list of two or more has no `.title`.
`length`, indices and the list's own members still read the list.

### 4.3 Calls

`name(args…)` calls a helper (§6). `value.name(args…)` calls a method of the
value (§7). Nothing else can be called. Calling a method on `undefined` or
`null` gives `undefined`.

### 4.4 Operators

From the loosest binding to the tightest:

| Level | Operators | Notes |
|---|---|---|
| 1 | `c ? a : b` | right-associative |
| 2 | `\|\|` | short-circuits; yields an operand, as in JavaScript |
| 3 | `&&` | short-circuits; yields an operand |
| 4 | `??` | short-circuits; the right side when the left is `undefined` or `null` |
| 5 | `===` `!==` `==` `!=` | `==` and `!=` compare as JavaScript's loose equality |
| 6 | `>` `<` `>=` `<=` | as in JavaScript: two strings compare as text (`"10" > "9"` is false) |
| 7 | `+` `-` | `+` joins as text when either side is a string, otherwise adds |
| 8 | `*` `/` `%` | |
| 9 | `!` `-` `+` | prefix |

Operators of one level associate left to right: `'a' + 1 + 2` is `"a12"`,
`1 + 2 + 'a'` is `"3a"`. Parentheses group. `[a, b]` is a list.

`??` binds tighter than `&&` and `||`, which differs from JavaScript:
`a ?? b == c` is `a ?? (b == c)`. Write parentheses where it matters.

## 5. Repeat

A block whose `repeat` is an expression treats its `children` as a template.
The expression is evaluated as a whole value; when it gives a list, the
template is rendered once per element with `item` bound to the element and
`index` to its position. When it gives anything else — undefined while the
source loads, an object, a string — the block renders no children. The
repeating block's own props are evaluated outside the repeat, in the scope
around it.

Each copy of a template block gets the id `<id>--<index>`, so ids stay unique
on the page; `states`, `conditionalStates` and `groupStates` apply to every
copy.

Repeats nest: an inner `repeat` such as `"{{item.reviews}}"` is evaluated with
the outer `item`, and inside it `item` and `index` are the **inner** element
and position. The outer `item` is not reachable from the inner template; there
is no alias for it. Copy what the inner template needs from the outer item into
the inner rows, or show it outside the inner repeat.

## 6. Helpers

Helpers are called by name: `{{currency(total, 'EUR', 'de-DE')}}`. A helper
name is not a value (`{{upper}}` is `undefined`). Arguments are converted the
way the description says, and a bad argument gives what the conversion gives
(`NaN`, `"undefined"`). A helper that throws — `currency` with an unknown
currency code — fails the expression.

| Helper | Result |
|---|---|
| `upper(s)`, `lower(s)`, `trim(s)` | the text of `s` in upper case, lower case, trimmed |
| `capitalize(s)` | the text of `s` with its first character in upper case |
| `concat(a, b, …)` | the texts of the arguments joined |
| `length(v)` | the length of a list, otherwise of the text of `v` |
| `round(n, d = 0)` | `n` rounded to `d` decimals |
| `floor(n)`, `ceil(n)`, `abs(n)` | as `Math.floor`, `Math.ceil`, `Math.abs` |
| `min(a, b, …)`, `max(a, b, …)` | the smallest and the largest number |
| `pages(total, size)` | `ceil(total / size)`; `0` when either is missing, not a number, zero or negative |
| `sumBy(list, field?)` | the sum of `field` over the elements (of the elements themselves without `field`); values that are not numbers are skipped; `0` for a non-list |
| `groupCount(list, field)` | an object: each value of `field` → how many elements carry it; a missing or empty value counts as `"unknown"` |
| `first(list)`, `last(list)` | the first and the last element; `undefined` for a non-list |
| `join(list, sep = ',')` | the elements joined by `sep`; the text of a non-list |
| `includes(v, x)` | whether the list contains `x`, or the text of `v` contains the text of `x` |
| `slice(v, start?, end?)` | part of a list, or of the text of `v` |
| `isEmpty(v)` | `true` for `undefined`, `null`, `""` and an empty list |
| `isNotEmpty(v)` | the opposite of `isEmpty` |
| `isArray(v)`, `isString(v)`, `isNumber(v)`, `isBool(v)`, `isBoolean(v)` | type tests; `isNumber(NaN)` is `true` |
| `isNull(v)` | `true` for `undefined` and `null` |
| `typeof(v)` | JavaScript's `typeof v` |
| `keys(o)`, `values(o)` | an object's keys and values; `[]` for a non-object |
| `json(v)` | `v` as JSON text |
| `today(days = 0)` | the visitor's local date, shifted by whole `days`, as `YYYY-MM-DD` — the form date fields are stored in, so `{{event.date >= today()}}` compares as text |
| `date(v)`, `time(v)`, `datetime(v)` | `v` read as a date and written in the visitor's locale (implementation-defined text) |
| `currency(n, code = 'USD', locale = 'en-US')` | `n` as money, `Intl.NumberFormat` currency style |
| `percent(n, d = 0)` | `n × 100` with `d` decimals and `%` |

A host MAY add helpers. A name that is neither one of these nor a helper the
host added fails the expression.

## 7. Methods

A method may be called only when the value is of the right kind and the name
is in its list; any other method call fails the expression.

| Value | Methods |
|---|---|
| string | `toLowerCase`, `toUpperCase`, `trim`, `trimStart`, `trimEnd`, `includes`, `startsWith`, `endsWith`, `indexOf`, `lastIndexOf`, `slice`, `substring`, `padStart`, `padEnd`, `split`, `replace`, `replaceAll`, `charAt`, `at`, `concat`, `repeat`, `toString`, `localeCompare` |
| list | `includes`, `indexOf`, `lastIndexOf`, `join`, `slice`, `at`, `concat` |
| number | `toFixed`, `toPrecision`, `toString`, `toLocaleString` |

They behave as the JavaScript methods of the same name. `repeat`, `padStart`
and `padEnd` fail with a count above 10 000. Objects and booleans have no
methods. There are no functions as values, so list methods that take one
(`map`, `filter`, `find`) do not exist; filtering and sorting belong to the
source's `query` (see [data-protocol §3](data-protocol.md#3-query-language)),
and folding to the helpers `sumBy` and `groupCount`.

## Conformance

- A table of expression cases — expression, scope, expected value or failure —
  is reserved for `fixtures/expressions/`. The cases of §3, §4 and §5 are its
  first rows.
