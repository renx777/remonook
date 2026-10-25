import { index, indexedRows, marks, encode } from "./domain.mjs";
import {enableStudyBranch} from './study-library.mjs';

export const ALL_MCQS = "__all_mcqs__";
const answerMarker = () => /(^|\s)@Answer(?=\s|$|[.,;:!?])/gi;
export function taggedMcqAnswer(options) {
  const tagged = options.filter(option => answerMarker().test(option.text));
  return { id: tagged.length === 1 ? tagged[0].id : null, count: tagged.length };
}
// Strip only the control token in study views, without changing notes or mark offsets.
export function mcqStudyOption(node) {
  const removed = [...node.text.matchAll(answerMarker())].map(match => [match.index + match[1].length, match.index + match[0].length]);
  if (!removed.length) return node;
  const shift = position => position - removed.reduce((sum, [start, end]) => sum + Math.max(0, Math.min(position, end) - start), 0);
  const untrimmed = node.text.replace(answerMarker(), (_match, prefix) => prefix), leading = untrimmed.length - untrimmed.trimStart().length, text = untrimmed.trim();
  const formatting = encode(marks(node.formatting || "", node.text.length).map(mark => ({ ...mark, start: Math.max(0, Math.min(text.length, shift(mark.start) - leading)), end: Math.max(0, Math.min(text.length, shift(mark.end) - leading)) })).filter(mark => mark.end > mark.start));
  return { ...node, text, formatting };
}

export function bulkMcqPlan(doc, rootId) {
  const idx = index(doc.tables.bullets);
  if (!idx.byId.has(rootId)) throw Error("This branch no longer exists.");
  const candidates = [idx.byId.get(rootId), ...indexedRows(idx, rootId, true).map(row => row.bullet)], ready = [], skipped = [];
  for (const question of candidates) {
    const options = idx.children.get(question.id) || [], existing = mcqDefinition(doc, question.id, idx);
    if (options.length !== 4) {
      if (existing || (options.length && (question.kind === "QUESTION" || taggedMcqAnswer(options).count > 0))) skipped.push({ id: question.id, text: question.text, reason: "Needs exactly four options" });
      continue;
    }
    const tagged = taggedMcqAnswer(options);
    if (!question.text.trim() || options.some(option => !mcqStudyOption(option).text.trim())) skipped.push({ id: question.id, text: question.text, reason: "Empty question or option" });
    else if (tagged.count > 1) skipped.push({ id: question.id, text: question.text, reason: "More than one option has @Answer" });
    else if (tagged.id || existing?.valid) ready.push({ id: question.id, text: question.text, correctOptionId: tagged.id || existing.config.correctOptionId, optionIds: options.map(option => option.id), explanation: existing?.config.explanation || "", shuffle: existing?.config.shuffle !== false, existing: !!existing });
    else skipped.push({ id: question.id, text: question.text, reason: "Mark one option with @Answer" });
  }
  return { ready, skipped };
}
export function configureMcqBranch(doc, rootId, now = Date.now()) {
  doc=enableStudyBranch(doc,rootId);
  const plan = bulkMcqPlan(doc, rootId);
  if (!plan.ready.length) throw Error("No questions are ready. Add four options and mark one with @Answer.");
  const byId = new Map(doc.tables.bullets.map(node => [node.id, node]));
  const layout = plan.ready.every(item => item.id !== rootId && byId.get(item.id)?.parentId !== rootId) ? 'TOPICS' : 'FLAT';
  const mcqs = { ...doc.web?.mcqs }, changed = new Set();
  for (const item of plan.ready) {
    changed.add(item.id);
    mcqs[item.id] = { optionIds: item.optionIds, correctOptionId: item.correctOptionId, explanation: item.explanation, shuffle: item.shuffle };
  }
  return { ...doc, web: { ...doc.web, mcqs, deckTypes: { ...doc.web?.deckTypes, [rootId]: "MCQ" } }, tables: { ...doc.tables,
    bullets: doc.tables.bullets.map(node => changed.has(node.id) ? { ...node, kind: "QUESTION" } : node),
    decks: doc.tables.decks.some(deck => deck.rootId === rootId) ? doc.tables.decks.map(deck => deck.rootId === rootId ? { ...deck, layout } : deck) : [...doc.tables.decks, { rootId, createdAt: now, pinned: 0, layout }] } };
}

export function mcqDefinition(doc, id, providedIndex) {
  const raw = doc.web?.mcqs?.[id];
  if (!raw) return null;
  const config = { correctOptionId: typeof raw.correctOptionId === "string" ? raw.correctOptionId : "", optionIds: Array.isArray(raw.optionIds) ? raw.optionIds : [], explanation: typeof raw.explanation === "string" ? raw.explanation.slice(0, 10000) : "", shuffle: raw.shuffle !== false };
  const idx = providedIndex || index(doc.tables.bullets), question = idx.byId.get(id), options = idx.children.get(id) || [];
  const ids = options.map(option => option.id);
  const valid = !!question?.text.trim() && options.length === 4 && options.every(option => !!mcqStudyOption(option).text.trim()) &&
    ids.includes(config.correctOptionId) && Array.isArray(config.optionIds) && config.optionIds.length === 4 && new Set(config.optionIds).size === 4 && config.optionIds.every(optionId => ids.includes(optionId));
  return { question, options, config, valid,
    fingerprint: JSON.stringify([question?.text, options.map(option => [option.id, option.text, option.formatting]), config.correctOptionId, config.explanation]),
    error: valid ? "" : "This MCQ needs exactly four non-empty direct child options and a valid correct answer. Edit its MCQ settings to repair it." };
}
export function configureMcq(doc, id, value) {
  doc=enableStudyBranch(doc,id);
  const idx = index(doc.tables.bullets), question = idx.byId.get(id), options = idx.children.get(id) || [];
  if (!question?.text.trim() || options.length !== 4 || options.some(option => !mcqStudyOption(option).text.trim())) throw Error("Add a question and exactly four non-empty child options first.");
  value = { ...value, correctOptionId: value.correctOptionId || taggedMcqAnswer(options).id };
  if (!options.some(option => option.id === value.correctOptionId)) throw Error("Choose the correct answer.");
  const web = { ...doc.web, mcqs: { ...doc.web?.mcqs, [id]: { optionIds: options.map(option => option.id), correctOptionId: value.correctOptionId, explanation: String(value.explanation || "").slice(0, 10000), shuffle: value.shuffle !== false } } };
  return { ...doc, web, tables: { ...doc.tables, bullets: doc.tables.bullets.map(node => node.id === id ? { ...node, kind: "QUESTION" } : node) } };
}
export function orderedMcqOptions(definition, seed) {
  const options = definition.options.slice();
  if (definition.config.shuffle === false) return options;
  let hash = 2166136261;
  for (const char of String(seed)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  for (let i = options.length - 1; i > 0; i--) {
    hash = (Math.imul(hash, 1664525) + 1013904223) >>> 0;
    const at = hash % (i + 1);
    [options[i], options[at]] = [options[at], options[i]];
  }
  return options;
}
export function mcqAttempt(doc, session) {
  const value = doc.web?.mcqRuns?.[session?.tag || "legacy"]?.answers?.[session?.cursor];
  return value && typeof value.choiceId === "string" && typeof value.fingerprint === "string" && typeof value.correct === "boolean" ? value : null;
}
export function answerMcq(doc, session, choiceId, now = Date.now()) {
  const queue = JSON.parse(session.queueJson), id = queue[session.cursor], definition = mcqDefinition(doc, id);
  if (!definition?.valid) throw Error(definition?.error || "This is not an MCQ.");
  if (!definition.options.some(option => option.id === choiceId)) throw Error("Choose one of the four options.");
  const old = mcqAttempt(doc, session);
  if (old?.fingerprint === definition.fingerprint) return doc;
  const tag = session.tag || "legacy", run = doc.web?.mcqRuns?.[tag] || { startedAt: now, scope: session.scope, answers: {} };
  const attempt = { questionId: id, choiceId, correctOptionId: definition.config.correctOptionId, correct: choiceId === definition.config.correctOptionId, answeredAt: now, fingerprint: definition.fingerprint };
  const runs = { ...doc.web?.mcqRuns, [tag]: { ...run, answers: { ...run.answers, [session.cursor]: attempt } } };
  const retained = Object.fromEntries(Object.entries(runs).filter(([, value]) => value && typeof value === "object").sort((a, b) => (b[1].startedAt || 0) - (a[1].startedAt || 0)).slice(0, 20));
  return { ...doc, web: { ...doc.web, mcqRuns: retained }, tables: { ...doc.tables, study_sessions: doc.tables.study_sessions.map(item => item.id === session.id ? { ...session, revealed: 1, updatedAt: now } : item) } };
}
export function mcqRunResults(doc, session) {
  const answers = Object.values(doc.web?.mcqRuns?.[session?.tag || "legacy"]?.answers || {}).filter(answer => answer && typeof answer.questionId === "string" && typeof answer.correct === "boolean");
  return { answered: answers.length, correct: answers.filter(answer => answer.correct).length,
    missedIds: [...new Set(answers.filter(answer => !answer.correct).map(answer => answer.questionId))] };
}
export async function validateReactionGif(file) {
  if (file.size > 2 * 1024 * 1024) throw Error("Choose GIFs under 2 MB each.");
  const bytes = new Uint8Array(await file.slice(0, 10).arrayBuffer());
  const header = new TextDecoder().decode(bytes.slice(0, 6));
  const width = bytes[6] | bytes[7] << 8, height = bytes[8] | bytes[9] << 8;
  if (!["GIF87a", "GIF89a"].includes(header) || !width || !height || width * height > 4_000_000) throw Error("Choose a valid GIF smaller than 4 megapixels.");
}
