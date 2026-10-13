// Runtime page translator. The UI is written in Uzbek; when another language is selected every
// text node and a few attributes are replaced using the dictionary (see i18n-dict-*.ts). Text that
// has no entry (user-written content, names, numbers) is left exactly as it is.
import { dict1, type Entry } from "@/lib/i18n-dict-1";
import { dict2 } from "@/lib/i18n-dict-2";
import { dict3 } from "@/lib/i18n-dict-3";
import { dict4 } from "@/lib/i18n-dict-4";

export type TargetLang = "ru" | "en";
export type Lang = "uz" | TargetLang;

const NUMBER = /\d+(?:[ \u00a0]\d{3})*(?:[.,]\d+)?/g;

/** Plain apostrophes, collapsed whitespace, lower case: the dictionary lookup form. */
export const normalizeKey = (value: string) =>
  value
    .replace(/[ʻ‘’ʼ`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const maps: Record<TargetLang, Map<string, string>> = { ru: new Map(), en: new Map() };
for (const [uz, ru, en] of [...dict1, ...dict2, ...dict3, ...dict4] as Entry[]) {
  const key = normalizeKey(uz);
  maps.ru.set(key, ru);
  maps.en.set(key, en);
}

/** Gives the translation the same first-letter case as the source text. */
function matchCase(source: string, translated: string) {
  const first = source.match(/[A-Za-zА-Яа-я]/)?.[0];
  if (!first || !translated) return translated;
  const upper = first === first.toUpperCase();
  const head = translated[0] ?? "";
  if (upper && head !== head.toUpperCase()) return head.toUpperCase() + translated.slice(1);
  // Only lower-case a leading capital when the next letter is lower case (keeps "USDT", "Payme").
  if (!upper && head === head.toUpperCase() && head !== head.toLowerCase()) {
    const next = translated[1] ?? "";
    if (next && next === next.toLowerCase()) return head.toLowerCase() + translated.slice(1);
  }
  return translated;
}

function lookup(core: string, lang: TargetLang): string | undefined {
  const map = maps[lang];
  const exact = map.get(normalizeKey(core));
  if (exact !== undefined) return exact.includes("{n}") ? undefined : matchCase(core, exact);
  const numbers = core.match(NUMBER);
  if (!numbers) return undefined;
  const templated = map.get(normalizeKey(core.replace(NUMBER, "{n}")));
  if (templated === undefined) return undefined;
  let i = 0;
  return matchCase(
    core,
    templated.replace(/\{n\}/g, () => numbers[i++] ?? ""),
  );
}

const SEGMENT_SPLIT = /( · | — | – |: )/;

/** Translates one piece of text, keeping its surrounding whitespace. Returns the input if unknown. */
export function translateText(text: string, lang: Lang): string {
  if (lang === "uz") return text;
  const lead = text.match(/^\s*/)?.[0] ?? "";
  const trail = text.match(/\s*$/)?.[0] ?? "";
  const core = text.trim();
  if (!core) return text;

  const whole = lookup(core, lang);
  if (whole !== undefined) return lead + whole + trail;

  // "Label: value" / "A · B" / "A — B": translate each part that is known.
  const parts = core.split(SEGMENT_SPLIT);
  if (parts.length > 1) {
    let changed = false;
    const out = parts.map((part, i) => {
      if (i % 2 === 1) return part;
      const hit = lookup(part, lang) ?? lookup(part + ":", lang)?.replace(/:$/, "");
      if (hit === undefined) return part;
      changed = true;
      return hit;
    });
    if (changed) return lead + out.join("") + trail;
  }
  return text;
}

// ---------------------------------------------------------------- DOM walker
const ATTRS = ["placeholder", "title", "aria-label", "alt"] as const;
const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "CODE", "PRE", "META", "LINK"]);

type Seen = { source: string; shown: string };
const textState = new WeakMap<Node, Seen>();
const attrState = new WeakMap<Element, Map<string, Seen>>();

function skipped(node: Node) {
  const el = node instanceof Element ? node : node.parentElement;
  return !el || SKIP.has(el.tagName) || Boolean(el.closest("[data-no-translate]"));
}

function applyText(node: Text, lang: Lang) {
  if (skipped(node)) return;
  const current = node.nodeValue ?? "";
  const seen = textState.get(node);
  // If the value is not what we last wrote, React (or the page) set new text: it is a new source.
  const source = seen && seen.shown === current ? seen.source : current;
  const shown = translateText(source, lang);
  textState.set(node, { source, shown });
  if (shown !== current) node.nodeValue = shown;
}

function applyAttrs(el: Element, lang: Lang) {
  if (SKIP.has(el.tagName) || el.closest("[data-no-translate]")) return;
  let states = attrState.get(el);
  for (const name of ATTRS) {
    const current = el.getAttribute(name);
    if (current === null) continue;
    states ??= new Map();
    attrState.set(el, states);
    const seen = states.get(name);
    const source = seen && seen.shown === current ? seen.source : current;
    const shown = translateText(source, lang);
    states.set(name, { source, shown });
    if (shown !== current) el.setAttribute(name, shown);
  }
}

function applyTree(root: Node, lang: Lang) {
  if (root.nodeType === Node.TEXT_NODE) return applyText(root as Text, lang);
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
  if (root instanceof Element) applyAttrs(root, lang);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) applyText(n as Text, lang);
    else applyAttrs(n as Element, lang);
  }
}

/** Translates the whole page now and keeps translating whatever React renders afterwards. */
export function startTranslating(lang: Lang): () => void {
  const root = document.documentElement;
  applyTree(root, lang);
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "characterData") applyTree(record.target, lang);
      else if (record.type === "attributes") applyAttrs(record.target as Element, lang);
      else record.addedNodes.forEach((node) => applyTree(node, lang));
    }
  });
  observer.observe(root, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...ATTRS],
  });
  return () => {
    observer.disconnect();
    // Put the original Uzbek text back so the next language starts from the source.
    if (lang !== "uz") applyTree(root, "uz");
  };
}
