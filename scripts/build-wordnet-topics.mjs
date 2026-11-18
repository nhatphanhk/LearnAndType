#!/usr/bin/env node
/**
 * Sinh src/renderer/src/data/wordnet-topics.json: từ tiếng Anh → chủ đề mẫu (id trong core/classify.ts),
 * dựa trên WordNet 3.1 (gói wordnet-db): nhóm nghĩa (lexicographer file) + chuỗi hypernym tới các synset "neo".
 *
 *   npm run build:wordnet                  # sinh file + in độ chính xác trên 240 từ có sẵn
 *   node scripts/build-wordnet-topics.mjs --senses bank fruit   # xem các nghĩa (để chỉnh neo)
 *   node scripts/build-wordnet-topics.mjs --why verdict         # xem vì sao một từ ra chủ đề đó
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DICT = path.join(ROOT, 'node_modules', 'wordnet-db', 'dict')
const OUT = path.join(ROOT, 'src', 'renderer', 'src', 'data', 'wordnet-topics.json')
const BUILTIN_DIR = path.join(ROOT, 'src', 'renderer', 'src', 'data', 'builtin')

const LEXFILES = [
  'adj.all', 'adj.pert', 'adv.all', 'noun.Tops', 'noun.act', 'noun.animal', 'noun.artifact', 'noun.attribute',
  'noun.body', 'noun.cognition', 'noun.communication', 'noun.event', 'noun.feeling', 'noun.food', 'noun.group',
  'noun.location', 'noun.motive', 'noun.object', 'noun.person', 'noun.phenomenon', 'noun.plant', 'noun.possession',
  'noun.process', 'noun.quantity', 'noun.relation', 'noun.shape', 'noun.state', 'noun.substance', 'noun.time',
  'verb.body', 'verb.change', 'verb.cognition', 'verb.communication', 'verb.competition', 'verb.consumption',
  'verb.contact', 'verb.creation', 'verb.emotion', 'verb.motion', 'verb.perception', 'verb.possession',
  'verb.social', 'verb.stative', 'verb.weather', 'adj.ppl'
]

/** Cả nhóm nghĩa → chủ đề (dùng khi không gặp neo cụ thể nào trên chuỗi hypernym). */
const LEX_TOPIC = {
  'noun.animal': 'animals',
  'noun.food': 'food',
  'noun.body': 'body',
  'noun.feeling': 'emotions',
  'verb.emotion': 'emotions',
  'noun.plant': 'nature',
  'noun.phenomenon': 'nature',
  'noun.object': 'nature',
  'verb.weather': 'nature',
  'verb.competition': 'sports',
  'verb.consumption': 'food',
  'noun.possession': 'business'
}

/**
 * Neo cụ thể: "lemma#k" = nghĩa thứ k (danh từ) của lemma; "v:lemma#k" = động từ. Mọi hyponym (qua @ / @i) thuộc chủ đề đó.
 * Neo gần nhất trên chuỗi hypernym thắng, nên neo cụ thể (fruit) thắng neo chung (food) và nhóm nghĩa (noun.food).
 */
const ANCHORS = {
  animals: ['animal#1', 'pet#1'],
  food: ['food#1', 'food#2', 'meal#1', 'beverage#1', 'dish#2', 'cooking#1', 'v:cook#3', 'v:eat#1', 'v:drink#1', 'restaurant#1', 'tableware#1', 'cookware#1'],
  fruits: ['edible_fruit#1', 'fruit#1', 'vegetable#1', 'vegetable#2', 'produce#1', 'herb#2', 'nut#1', 'legume#2', 'mushroom#3'],
  family: ['relative#1', 'spouse#1', 'family#1', 'family#2', 'parent#1', 'child#2', 'kinship#1', 'marriage#1', 'wedding#1', 'v:marry#1'],
  jobs: ['worker#1', 'professional#1', 'skilled_worker#1', 'occupation#1', 'employee#1', 'serviceman#1', 'lawman#1', 'health_professional#1', 'educator#1', 'artisan#1', 'tradesman#1'],
  body: ['body_part#1', 'body#1', 'organ#1', 'external_body_part#1', 'body_covering#1', 'tooth#1', 'bone#1', 'muscle#1'],
  house: ['furniture#1', 'furnishing#2', 'room#1', 'home_appliance#1', 'housing#1', 'dwelling#1', 'house#1', 'kitchen_utensil#1', 'bedclothes#1', 'container#1', 'household#1', 'building_material#1', 'plumbing_fixture#1', 'lamp#1', 'hand_tool#1'],
  school: ['educational_institution#1', 'school#1', 'school#2', 'student#1', 'examination#2', 'education#1', 'education#2', 'learning#1', 'discipline#1', 'writing_implement#1', 'textbook#1', 'course#1', 'lesson#1', 'class#3', 'academic_degree#1', 'v:study#1', 'v:learn#1', 'v:teach#1'],
  transport: ['vehicle#1', 'conveyance#3', 'travel#1', 'journey#1', 'trip#1', 'thoroughfare#1', 'road#1', 'station#1', 'airport#1', 'traveler#1', 'luggage#1', 'v:travel#1', 'v:drive#1', 'v:fly#1', 'tourism#1', 'transport#1', 'transportation#1', 'vessel#2', 'craft#2'],
  nature: ['weather#1', 'atmospheric_phenomenon#1', 'natural_object#1', 'geological_formation#1', 'body_of_water#1', 'land#1', 'plant#2', 'tree#1', 'flower#1', 'environment#1', 'environment#2', 'natural_phenomenon#1', 'season#2', 'landscape#1', 'region#3', 'celestial_body#1', 'planet#1', 'star#1', 'pollution#1'],
  sports: ['sport#1', 'athlete#1', 'sports_equipment#1', 'game#2', 'contest#1', 'exercise#1', 'player#1', 'team#1', 'athletic_facility#1', 'ball#1', 'v:compete#1', 'v:play#1', 'v:exercise#1', 'v:swim#1'],
  clothes: ['clothing#1', 'garment#1', 'footwear#1', 'footwear#2', 'jewelry#1', 'headdress#1', 'accessory#1', 'fabric#1', 'bag#4', 'v:dress#1', 'v:wear#1', 'fastener#1', 'adornment#1'],
  office: ['office#1', 'office#2', 'office_furniture#1', 'meeting#1', 'conference#1', 'appointment#2', 'workplace#1', 'staff#1', 'paperwork#1', 'document#2', 'supervisor#1', 'administrator#1', 'employment#1', 'salary#1', 'v:employ#1', 'v:hire#1', 'v:resign#1', 'secretary#1', 'clerk#1'],
  business: ['commerce#1', 'business#1', 'business#3', 'company#1', 'enterprise#2', 'institution#1', 'money#1', 'money#2', 'money#3', 'finance#1', 'financial_gain#1', 'cost#1', 'price#2', 'assets#1', 'investment#1', 'investor#1', 'businessman#1', 'merchant#1', 'economy#1', 'economic_process#1', 'contract#1', 'agreement#1', 'payment#1', 'bill#2', 'tax#1', 'bank#2', 'financial_institution#1', 'market#1', 'marketing#1', 'advertisement#1', 'v:pay#1', 'v:invest#1', 'v:sell#1', 'v:trade#1', 'v:negotiate#1', 'capitalist#2', 'insurance#1', 'loan#1', 'debt#1', 'transaction#1'],
  technology: ['computer#1', 'electronic_device#1', 'electronic_equipment#1', 'software#1', 'telecommunication#1', 'computer_network#1', 'computer_science#1', 'data#1', 'machine#1', 'technology#1', 'technology#2', 'internet#1', 'website#1', 'computer_file#1', 'computer_user#1', 'v:program#1', 'v:download#1', 'v:compute#1', 'electrical_device#1', 'telephone#1', 'camera#1', 'battery#2'],
  health: ['disease#1', 'illness#1', 'symptom#1', 'injury#1', 'wound#1', 'medicine#2', 'drug#1', 'medical_care#1', 'medical_aid#1', 'therapy#1', 'treatment#1', 'medical_procedure#1', 'hospital#1', 'medical_building#1', 'patient#1', 'health#1', 'pathological_state#1', 'disorder#1', 'pain#1', 'medicine#1', 'vitamin#1', 'diet#1', 'v:cure#1', 'v:heal#1', 'v:treat#3', 'v:hurt#1', 'medical_instrument#1', 'infection#1', 'microorganism#1', 'v:ache#1'],
  emotions: ['feeling#1', 'emotion#1', 'trait#1', 'personality#1', 'disposition#1', 'attitude#1', 'temperament#1', 'v:feel#1', 'v:love#1', 'v:hate#1', 'v:fear#1', 'v:worry#1', 'mood#1'],
  shopping: ['shop#1', 'mercantile_establishment#1', 'purchase#1', 'purchase#2', 'buyer#1', 'shopper#1', 'shopping#1', 'v:buy#1', 'v:shop#1', 'sale#1', 'discount#1', 'receipt#1', 'refund#1', 'delivery#1', 'merchandise#1'],
  arts: ['art#1', 'art#2', 'music#1', 'music#2', 'musical_instrument#1', 'literary_composition#1', 'writing#2', 'performing_arts#1', 'performance#2', 'show#1', 'movie#1', 'theater#1', 'genre#1', 'painting#1', 'graphic_art#1', 'photography#1', 'v:sing#1', 'v:paint#1', 'v:dance#1', 'v:perform#2', 'dance#1', 'song#1', 'poem#1', 'novel#1', 'entertainment#1', 'hobby#1', 'museum#1', 'festival#2', 'broadcast#1', 'v:draw#6'],
  science: ['natural_science#1', 'science#1', 'chemical_element#1', 'acid#1', 'atom#1', 'molecule#1', 'cell#2', 'gene#1', 'experiment#1', 'experiment#2', 'research#1', 'scientific_research#1', 'theory#1', 'hypothesis#2', 'physical_phenomenon#1', 'energy#1', 'force#3', 'laboratory#1', 'scientific_instrument#1', 'mathematics#1', 'math#1', 'galaxy#1', 'particle#2', 'radiation#1', 'v:experiment#1', 'v:measure#1', 'v:calculate#1', 'evolution#2', 'biological_process#1', 'chemical_process#1', 'physical_process#1'],
  law: ['law#1', 'law#2', 'legal_document#1', 'court#1', 'court#2', 'crime#1', 'criminal#1', 'wrongdoer#1', 'legal_action#1', 'trial#1', 'judgment#1', 'verdict#1', 'punishment#1', 'prison#1', 'government#1', 'government#2', 'politics#1', 'politics#2', 'political_unit#1', 'election#1', 'vote#1', 'citizen#1', 'military#1', 'military_action#1', 'war#1', 'armed_forces#1', 'military_personnel#1', 'police#1', 'society#1', 'social_group#1', 'policy#1', 'rule#2', 'right#2', 'legislature#1', 'protest#1', 'v:arrest#1', 'v:sue#1', 'v:vote#1', 'v:govern#1', 'v:steal#1', 'v:kill#1', 'v:legislate#1', 'v:convict#1', 'v:sentence#1', 'weapon#1', 'v:punish#1', 'immigrant#1', 'poverty#1', 'welfare#1', 'social_control#1']
}

/** Ưu tiên khi hai neo ở cùng độ sâu (cụ thể trước chung). */
const PRIORITY = ['fruits', 'health', 'clothes', 'family', 'jobs', 'sports', 'technology', 'arts', 'science', 'law', 'shopping', 'office', 'business', 'transport', 'house', 'school', 'emotions', 'body', 'animals', 'food', 'nature']

/* ------------------------------- Đọc WordNet ------------------------------- */

function readData(pos) {
  const synsets = new Map()
  for (const line of fs.readFileSync(path.join(DICT, `data.${pos}`), 'latin1').split('\n')) {
    if (!line || line.startsWith(' ')) continue
    const [head, gloss = ''] = line.split(' | ')
    const t = head.trim().split(' ')
    const offset = t[0]
    const lex = LEXFILES[Number(t[1])]
    const wcnt = parseInt(t[3], 16)
    const words = []
    for (let i = 0; i < wcnt; i++) words.push(t[4 + i * 2].toLowerCase().replace(/\(.*\)$/, ''))
    let p = 4 + wcnt * 2
    const pcnt = Number(t[p++])
    const hyper = []
    for (let i = 0; i < pcnt; i++) {
      const [sym, off, ptPos] = [t[p], t[p + 1], t[p + 2]]
      p += 4
      if ((sym === '@' || sym === '@i') && (ptPos === 'n' || ptPos === 'v')) hyper.push(`${ptPos}${off}`)
    }
    synsets.set(`${pos[0]}${offset}`, { lex, words, hyper, gloss: gloss.trim() })
  }
  return synsets
}

function readIndex(pos) {
  const idx = new Map()
  for (const line of fs.readFileSync(path.join(DICT, `index.${pos}`), 'latin1').split('\n')) {
    if (!line || line.startsWith(' ')) continue
    const t = line.trim().split(' ')
    const lemma = t[0]
    const synCnt = Number(t[2])
    const pCnt = Number(t[3])
    const offs = t.slice(4 + pCnt + 2, 4 + pCnt + 2 + synCnt)
    idx.set(lemma, offs.map((o) => `${pos[0]}${o}`))
  }
  return idx
}

const synsets = new Map([...readData('noun'), ...readData('verb')])
const index = { n: readIndex('noun'), v: readIndex('verb') }

/* --------------------------------- Neo --------------------------------- */

function resolveAnchor(spec) {
  const [posPart, rest] = spec.includes(':') ? spec.split(':') : ['n', spec]
  const [lemma, k] = rest.split('#')
  const offs = index[posPart].get(lemma)
  const off = offs?.[Number(k) - 1]
  return off ?? null
}

const anchorTopic = new Map()
const missing = []
for (const topic of PRIORITY) {
  for (const spec of ANCHORS[topic]) {
    const off = resolveAnchor(spec)
    if (!off) missing.push(spec)
    else if (!anchorTopic.has(off)) anchorTopic.set(off, topic)
  }
}
if (missing.length) console.warn(`⚠️ Neo không có trong WordNet (bỏ qua): ${missing.join(', ')}`)

/* ------------------------------ Chủ đề synset ------------------------------ */

const memo = new Map()
/** Neo gần nhất theo chuỗi hypernym (BFS); không có thì theo nhóm nghĩa của chính synset. */
function synsetTopic(off, trace) {
  if (!trace && memo.has(off)) return memo.get(off)
  let frontier = [off]
  const seen = new Set(frontier)
  let found = null
  for (let depth = 0; depth < 16 && frontier.length && !found; depth++) {
    const hits = frontier.filter((o) => anchorTopic.has(o)).map((o) => anchorTopic.get(o))
    if (hits.length) {
      found = PRIORITY.find((p) => hits.includes(p))
      if (trace) trace.push(`  neo ở độ sâu ${depth}: ${hits.join(', ')}`)
      break
    }
    const next = []
    for (const o of frontier) for (const h of synsets.get(o)?.hyper ?? []) if (!seen.has(h)) (seen.add(h), next.push(h))
    frontier = next
  }
  if (!found) found = LEX_TOPIC[synsets.get(off)?.lex] ?? null
  if (!trace) memo.set(off, found)
  return found
}

/** [thắng, thua] khi hai chủ đề này là hai nghĩa hàng đầu của cùng một từ. */
const PAIR_PREFS = [
  ['fruits', 'nature'],
  ['fruits', 'food'],
  ['animals', 'food'],
  ['food', 'nature'],
  ['jobs', 'science'],
  ['jobs', 'arts']
]

const NOUN_W = [3, 2, 1]
const VERB_W = [2, 1, 0.5]

function lemmaTopic(lemma, trace) {
  const score = new Map()
  const add = (offs, weights) =>
    offs.slice(0, weights.length).forEach((o, i) => {
      const t = synsetTopic(o, trace && [])
      if (trace) trace.push(`${o} [${synsets.get(o).lex}] ${synsets.get(o).words.slice(0, 3).join(',')} — ${synsets.get(o).gloss.slice(0, 70)} → ${t}`)
      if (t) score.set(t, (score.get(t) ?? 0) + weights[i])
    })
  add(index.n.get(lemma) ?? [], NOUN_W)
  add(index.v.get(lemma) ?? [], VERB_W)
  const ranked = [...score.entries()].sort((a, b) => b[1] - a[1])
  if (!ranked.length) return null
  const [best, second] = ranked
  // Hai nghĩa "cặp đôi" quen thuộc (quả ↔ cây, con vật ↔ thịt): chọn nghĩa người học hay nghĩ tới
  if (second) {
    const pref = PAIR_PREFS.find(([a, b]) => (best[0] === a && second[0] === b) || (best[0] === b && second[0] === a))
    if (pref) return pref[0]
  }
  if (best[1] < 2) return null
  if (second && best[1] < second[1] * 1.5) return null
  return best[0]
}

/* ---------------------------------- CLI ---------------------------------- */

const args = process.argv.slice(2)
if (args[0] === '--senses') {
  for (const w of args.slice(1)) {
    for (const pos of ['n', 'v']) {
      ;(index[pos].get(w) ?? []).forEach((o, i) => {
        const s = synsets.get(o)
        console.log(`${pos === 'v' ? 'v:' : ''}${w}#${i + 1}  [${s.lex}] ${s.words.join(', ')} — ${s.gloss.slice(0, 100)}`)
      })
    }
  }
  process.exit(0)
}
if (args[0] === '--why') {
  for (const w of args.slice(1)) {
    const trace = []
    const t = lemmaTopic(w, trace)
    console.log(`${w} → ${t}\n${trace.join('\n')}\n`)
  }
  process.exit(0)
}

/* --------------------------------- Sinh file --------------------------------- */

const TOPICS = PRIORITY.slice().sort()
const out = {}
let multi = 0
for (const lemma of new Set([...index.n.keys(), ...index.v.keys()])) {
  // Từ đơn và cụm 2 chữ (cụm dài hơn hiếm gặp khi học, làm file to gấp đôi)
  if (!/^[a-z][a-z'-]*(?:_[a-z][a-z'-]*)?$/.test(lemma) || lemma.length < 3) continue
  const t = lemmaTopic(lemma)
  if (!t) continue
  const key = lemma.replace(/_/g, ' ')
  if (key.includes(' ')) multi++
  out[key] = TOPICS.indexOf(t)
}
const json = JSON.stringify({
  source: 'WordNet 3.1 (Princeton University), via wordnet-db — see README',
  c: TOPICS,
  w: out
})
fs.writeFileSync(OUT, json)
console.log(`Đã ghi ${path.relative(ROOT, OUT)}: ${Object.keys(out).length} từ (${multi} cụm), ${(json.length / 1024).toFixed(0)} KB`)

/* ------------------------- Độ chính xác trên từ có sẵn ------------------------- */

let total = 0
let covered = 0
let correct = 0
const wrong = []
for (const f of fs.readdirSync(BUILTIN_DIR).filter((f) => /^[a-z]+\.ts$/.test(f) && !['index.ts', 'types.ts'].includes(f))) {
  const src = fs.readFileSync(path.join(BUILTIN_DIR, f), 'utf8')
  const id = /id: '([a-z]+)'/.exec(src)?.[1]
  if (!id) continue
  for (const m of src.matchAll(/^\s*\['([^']+)',/gm)) {
    total++
    const t = out[m[1].toLowerCase()]
    if (t === undefined) continue
    covered++
    if (TOPICS[t] === id) correct++
    else wrong.push(`${m[1]}: ${id} → ${TOPICS[t]}`)
  }
}
console.log(
  `Từ có sẵn: ${total} · có trong WordNet-topics ${covered} (${((covered / total) * 100).toFixed(0)}%) · đúng ${correct}/${covered} (${((correct / covered) * 100).toFixed(0)}%)`
)
if (args.includes('--wrong')) console.log(wrong.join('\n'))
