#!/usr/bin/env node
/**
 * Dựng gói luyện thi (TOEIC / IELTS…) từ vocab/ (nội dung tự soạn, có commit) và data-sources/ (dữ liệu riêng, có bản quyền)
 * → src/renderer/src/data/packs/<id>.json + data/cefr-levels.json (bảng cấp độ để phân loại từ đang có).
 * Chạy tự động trước `npm run dev` / `npm run build`. Hai thư mục có gói cùng tên thì được gộp.
 * Dữ liệu nguồn và gói sinh ra KHÔNG commit (dựng từ tài liệu có bản quyền, chỉ dùng cá nhân) — xem .gitignore.
 * Mẫu cấu trúc: data-sources.example/.
 *
 *   npm run build:packs                       # dựng mọi gói
 *   npm run build:packs -- --pack toeic       # chỉ một gói
 *   npm run build:packs -- --enrich           # dùng Gemini điền nghĩa / IPA / ví dụ / đồng nghĩa… còn thiếu
 *                                             # (cần biến môi trường GEMINI_API_KEY; kết quả cache trong data-sources/.cache/)
 *
 * Cấu trúc:
 *   data-sources/_levels/*.txt|csv     Bảng cấp độ CEFR dùng chung (VD Oxford 3000/5000 chép từ PDF): "abandon v. B2"
 *   data-sources/<pack>/pack.json      Thông tin gói + danh sách chủ đề (id, name, nameEn, emoji, description)
 *   data-sources/<pack>/*.csv          Từ vựng: word, meaning, ipa, pos, cefr, topic, example, exampleVi,
 *                                      synonyms, collocations, family, tags, emoji (danh sách cách nhau bởi ";" hoặc "|")
 *   data-sources/<pack>/*.txt          Danh sách kiểu Oxford ("word pos. LEVEL") — từ chưa có nghĩa cần --enrich
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Papa from 'papaparse'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'data-sources')
const VOCAB = path.join(ROOT, 'vocab')
const OUT_DIR = path.join(ROOT, 'src', 'renderer', 'src', 'data', 'packs')
const LEVELS_OUT = path.join(ROOT, 'src', 'renderer', 'src', 'data', 'cefr-levels.json')
const CACHE_FILE = path.join(SRC, '.cache', 'enrich.json')
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

const args = process.argv.slice(2)
const ENRICH = args.includes('--enrich')
const ONLY = args.includes('--pack') ? args[args.indexOf('--pack') + 1] : null
const QUIET = args.includes('--quiet')

/* ------------------------------ Đọc nguồn ------------------------------ */

const POS_RE =
  /\s(n\.|v\.|adj\.|adv\.|prep\.|conj\.|pron\.|det\.|exclam\.|number\b|modal v\.|auxiliary v\.|indefinite article|definite article|infinitive marker)/
const POS_SHORT = { 'n.': 'n', 'v.': 'v', 'adj.': 'adj', 'adv.': 'adv', 'prep.': 'prep', 'conj.': 'conj', 'pron.': 'pron', 'det.': 'det', 'exclam.': 'exclam' }

/** Dòng kiểu Oxford 3000/5000: "access n. B1, v. B2" → { word, pos: "n, v", cefr: "B1" (cấp thấp nhất) }. */
export function parseLevelLine(line) {
  const text = line.replace(/\s+/g, ' ').trim()
  const lv = text.match(/\b(A1|A2|B1|B2|C1|C2)\b/g)
  const m = text.match(POS_RE)
  if (!lv || !m || m.index === undefined) return null
  // "a, an" → "a"; "close1" → "close"
  const word = text.slice(0, m.index).split(',')[0].replace(/\d+$/, '').trim()
  if (!/^[A-Za-z][A-Za-z'’ .-]*$/.test(word)) return null
  const pos = [...text.slice(m.index).matchAll(/(n\.|v\.|adj\.|adv\.|prep\.|conj\.|pron\.|det\.|exclam\.)/g)].map((x) => POS_SHORT[x[1]])
  const cefr = lv.sort((a, b) => LEVELS.indexOf(a) - LEVELS.indexOf(b))[0]
  return { word, pos: [...new Set(pos)].join(', '), cefr }
}

const list = (v) =>
  String(v ?? '')
    .split(/[;|]/)
    .map((s) => s.trim())
    .filter(Boolean)

const pick = (row, ...keys) => {
  for (const k of keys) {
    const hit = Object.keys(row).find((h) => h.trim().toLowerCase() === k.toLowerCase())
    if (hit && String(row[hit] ?? '').trim()) return String(row[hit]).trim()
  }
  return ''
}

function readCsv(file) {
  const { data } = Papa.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true })
  return data.map((r) => ({
    word: pick(r, 'word', 'từ', 'english'),
    meaningVi: pick(r, 'meaning', 'meaningVi', 'nghĩa', 'vietnamese'),
    ipa: pick(r, 'ipa', 'phonetic', 'phiên âm'),
    pos: pick(r, 'pos', 'partOfSpeech', 'loại từ'),
    cefr: pick(r, 'cefr', 'level').toUpperCase(),
    topic: pick(r, 'topic', 'chủ đề', 'lesson', 'unit'),
    example: pick(r, 'example', 'ví dụ'),
    exampleVi: pick(r, 'exampleVi', 'dịch ví dụ'),
    emoji: pick(r, 'emoji'),
    synonyms: list(pick(r, 'synonyms', 'đồng nghĩa')),
    collocations: list(pick(r, 'collocations', 'collocation')),
    family: list(pick(r, 'family', 'word family', 'họ từ')),
    tags: list(pick(r, 'tags', 'tag'))
  }))
}

function readTxt(file) {
  return fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map(parseLevelLine)
    .filter(Boolean)
    .map((x) => ({ ...x, meaningVi: '', synonyms: [], collocations: [], family: [], tags: [] }))
}

function readDir(dir) {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .sort()
    .flatMap((f) => {
      const file = path.join(dir, f)
      const tag = path.basename(f, path.extname(f))
      const rows = f.endsWith('.csv') ? readCsv(file) : f.endsWith('.txt') ? readTxt(file) : []
      return rows.filter((r) => r.word).map((r) => ({ ...r, tags: [...new Set([...r.tags, tag])] }))
    })
}

/* ------------------------------ Gemini (tùy chọn) ------------------------------ */

const loadCache = () => (fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) : {})
const saveCache = (c) => {
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true })
  fs.writeFileSync(CACHE_FILE, JSON.stringify(c, null, 1))
}
const cacheKey = (w) => `${w.word.toLowerCase()}|${w.pos}`
const needsEnrich = (w) => !w.meaningVi || !w.ipa || !w.example || !w.exampleVi

async function enrich(words, exam) {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('--enrich cần biến môi trường GEMINI_API_KEY')
  const cache = loadCache()
  const todo = words.filter((w) => needsEnrich(w) && !cache[cacheKey(w)])
  console.log(`  Gemini: ${todo.length} từ cần bổ sung (${words.length - todo.length} đã có / đã cache)`)
  for (let i = 0; i < todo.length; i += 30) {
    const batch = todo.slice(i, i + 30)
    const prompt =
      `You build an English vocabulary deck for Vietnamese learners preparing for ${exam.toUpperCase()}.\n` +
      'For each item return: word, meaningVi (short Vietnamese meaning for that part of speech), ipa (US, with slashes), pos, ' +
      `example (one natural ${exam === 'ielts' ? 'academic' : 'business/workplace'} sentence using the word), exampleVi (Vietnamese translation), ` +
      'synonyms (max 3), collocations (max 3 common ones), family (other forms of the word family, max 4).\n' +
      'Return ONLY a JSON array in the same order.\n' +
      JSON.stringify(batch.map((w) => ({ word: w.word, pos: w.pos, meaningVi: w.meaningVi || undefined })))
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.2 }
        })
      }
    )
    if (!res.ok) throw new Error(`Gemini lỗi HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const json = await res.json()
    const out = JSON.parse(json.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]')
    batch.forEach((w, j) => {
      const r = out.find((x) => x?.word?.toLowerCase() === w.word.toLowerCase()) ?? out[j]
      if (r) cache[cacheKey(w)] = r
    })
    saveCache(cache)
    console.log(`  … ${Math.min(i + 30, todo.length)}/${todo.length}`)
  }
  for (const w of words) {
    const r = cache[cacheKey(w)]
    if (!r) continue
    for (const k of ['meaningVi', 'ipa', 'pos', 'example', 'exampleVi']) if (!w[k] && typeof r[k] === 'string') w[k] = r[k].trim()
    for (const k of ['synonyms', 'collocations', 'family'])
      if (!w[k].length && Array.isArray(r[k])) w[k] = r[k].filter((s) => typeof s === 'string' && s.trim())
  }
}

/* ------------------------------ Dựng gói ------------------------------ */

/** Các thư mục nguồn: vocab/ (nội dung tự soạn, commit) rồi data-sources/ (riêng tư, ghi đè thông tin gói). */
const ROOTS = [VOCAB, SRC].filter((d) => fs.existsSync(d))

function levelMap() {
  const m = new Map()
  for (const root of ROOTS) {
    for (const r of readDir(path.join(root, '_levels'))) {
      const k = r.word.toLowerCase()
      const prev = m.get(k)
      if (LEVELS.includes(r.cefr) && (!prev || LEVELS.indexOf(r.cefr) < LEVELS.indexOf(prev))) m.set(k, r.cefr)
    }
  }
  return m
}

/** Mã băm 32-bit (FNV-1a) — đổi nội dung gói là đổi `build`, app báo "Có bản mới". */
function hash(s) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

async function buildPack(name, dirs, levels) {
  // Gộp pack.json: thư mục sau ghi đè trường đơn, gộp danh sách chủ đề theo id
  const meta = { topics: [] }
  for (const dir of dirs) {
    const m = JSON.parse(fs.readFileSync(path.join(dir, 'pack.json'), 'utf8'))
    const topics = meta.topics
    Object.assign(meta, m, { topics })
    for (const t of m.topics ?? []) {
      const i = topics.findIndex((x) => x.id === t.id)
      if (i >= 0) topics[i] = { ...topics[i], ...t }
      else topics.push(t)
    }
    meta.sources = [...new Set([...(meta.sources ?? []), ...(m.sources ?? [])])]
  }
  const exam = meta.exam ?? 'general'
  const rows = dirs.flatMap(readDir)
  // Gộp trùng (theo từ): dòng sau chỉ điền ô còn trống, gộp danh sách
  const byWord = new Map()
  for (const r of rows) {
    const k = r.word.toLowerCase()
    const prev = byWord.get(k)
    if (!prev) {
      byWord.set(k, { ...r })
      continue
    }
    for (const f of ['meaningVi', 'ipa', 'pos', 'cefr', 'topic', 'example', 'exampleVi', 'emoji']) prev[f] ||= r[f]
    for (const f of ['synonyms', 'collocations', 'family', 'tags']) prev[f] = [...new Set([...prev[f], ...r[f]])]
  }
  const words = [...byWord.values()]
  for (const w of words) {
    if (!LEVELS.includes(w.cefr)) w.cefr = levels.get(w.word.toLowerCase()) ?? ''
    w.tags = [...new Set([exam, ...w.tags])]
  }
  if (ENRICH) await enrich(words, exam)

  // Chủ đề: theo pack.json, cột "topic" lạ → tự tạo, thiếu topic → nhóm theo cấp độ CEFR
  const topics = meta.topics.map((t) => ({ ...t, words: [] }))
  const find = (id) => topics.find((t) => t.id.toLowerCase() === id.toLowerCase() || t.name.toLowerCase() === id.toLowerCase())
  for (const w of words) {
    // Không có cột topic: tên file trùng id chủ đề (VD office.csv) thì dùng chủ đề đó
    const fileTopic = w.tags.find((tag) => find(tag))
    const tid = w.topic || (fileTopic ? find(fileTopic).id : w.cefr ? `level-${w.cefr.toLowerCase()}` : 'other')
    let t = find(tid)
    if (!t) {
      const lv = tid.match(/^level-(\w\d)$/)
      t = lv
        ? { id: tid, name: `Cấp độ ${lv[1].toUpperCase()}`, nameEn: `Level ${lv[1].toUpperCase()}`, emoji: '📶', words: [] }
        : { id: tid, name: tid === 'other' ? 'Khác' : tid, nameEn: tid, emoji: meta.emoji ?? '📘', words: [] }
      topics.push(t)
    }
    const { topic: _t, ...rest } = w
    t.words.push(
      Object.fromEntries(Object.entries(rest).filter(([, v]) => (Array.isArray(v) ? v.length : v !== '' && v != null)))
    )
  }
  // Trong mỗi chủ đề: cấp độ thấp → cao (giữ thứ tự nguồn khi cùng cấp)
  for (const t of topics) t.words.sort((a, b) => rank(a.cefr) - rank(b.cefr))
  const body = {
    name: meta.name,
    nameEn: meta.nameEn ?? meta.name,
    emoji: meta.emoji ?? '📘',
    description: meta.description ?? '',
    exam,
    sources: meta.sources ?? [],
    topics: topics.filter((t) => t.words.length)
  }
  const pack = { app: 'LearnAndType-pack', id: meta.id ?? name, version: meta.version ?? 1, build: hash(JSON.stringify(body)), ...body }
  const missing = words.filter((w) => !w.meaningVi).length
  return { pack, total: words.length, missing }
}

const rank = (lv) => (LEVELS.includes(lv) ? LEVELS.indexOf(lv) : LEVELS.length)

async function main() {
  if (ROOTS.length === 0) {
    console.log('Không có vocab/ hay data-sources/ — bỏ qua dựng gói.')
    return
  }
  const levels = levelMap()
  fs.mkdirSync(OUT_DIR, { recursive: true })
  // Gói = thư mục con có pack.json, cùng tên ở các nguồn thì gộp
  const groups = new Map()
  for (const root of ROOTS) {
    for (const d of fs.readdirSync(root, { withFileTypes: true })) {
      if (!d.isDirectory() || d.name.startsWith('_') || d.name.startsWith('.')) continue
      const dir = path.join(root, d.name)
      if (!fs.existsSync(path.join(dir, 'pack.json')) || (ONLY && d.name !== ONLY)) continue
      groups.set(d.name, [...(groups.get(d.name) ?? []), dir])
    }
  }
  const allLevels = new Map(levels)
  for (const [name, dirs] of groups) {
    const { pack, total, missing } = await buildPack(name, dirs, levels)
    const out = path.join(OUT_DIR, `${pack.id}.json`)
    fs.writeFileSync(out, JSON.stringify(pack))
    if (!QUIET) console.log(`▶ ${name}: ${total} từ, ${pack.topics.length} chủ đề → ${path.relative(ROOT, out)}`)
    if (missing) console.log(`  ⚠ ${name}: ${missing} từ chưa có nghĩa (sẽ bị bỏ khi cài) — chạy lại với --enrich hoặc bổ sung cột meaning`)
    for (const t of pack.topics) for (const w of t.words) if (w.cefr && !allLevels.has(w.word.toLowerCase())) allLevels.set(w.word.toLowerCase(), w.cefr)
  }
  // Bảng cấp độ cho tính năng "Phân loại từ đang có" (từ có sẵn + từ tự thêm)
  fs.writeFileSync(LEVELS_OUT, JSON.stringify(Object.fromEntries([...allLevels].sort(([a], [b]) => a.localeCompare(b)))))
  if (!QUIET) console.log(`Bảng cấp độ CEFR: ${allLevels.size} từ → ${path.relative(ROOT, LEVELS_OUT)}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e.message ?? e)
    process.exit(1)
  })
}
