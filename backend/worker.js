const DEFAULT_MARKETPLACE_API = 'https://www.renaiss.xyz/api/trpc/collectible.list'
const DEFAULT_LIMIT = 50
const DEFAULT_PAGE_SIZE = 10
const UPSERT_SQL = `
  INSERT INTO renaiss_cards (
    token_id, item_id, name, set_name, card_number, character_name,
    owner_address, owner_username, vault_location, serial, serial_num,
    grader, grade, language, year, image_url, ask_price, offer_price,
    fmv, buyback_base_value, is_listed, updated_at
  ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22)
  ON CONFLICT(token_id) DO UPDATE SET
    item_id = excluded.item_id,
    name = excluded.name,
    set_name = excluded.set_name,
    card_number = excluded.card_number,
    character_name = excluded.character_name,
    owner_address = excluded.owner_address,
    owner_username = excluded.owner_username,
    vault_location = excluded.vault_location,
    serial = excluded.serial,
    serial_num = excluded.serial_num,
    grader = excluded.grader,
    grade = excluded.grade,
    language = excluded.language,
    year = excluded.year,
    image_url = excluded.image_url,
    ask_price = excluded.ask_price,
    offer_price = excluded.offer_price,
    fmv = excluded.fmv,
    buyback_base_value = excluded.buyback_base_value,
    is_listed = excluded.is_listed,
    updated_at = excluded.updated_at
`

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=60',
      ...(init.headers || {}),
    },
  })
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function corsHeaders(env) {
  return {
    'access-control-allow-origin': env.FRONTEND_ORIGIN || '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,x-refresh-token',
  }
}

function withCors(response, env) {
  const headers = new Headers(response.headers)
  const additions = corsHeaders(env)
  for (const [key, value] of Object.entries(additions)) {
    headers.set(key, value)
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function utcLabel(isoString) {
  if (!isoString) return null
  return new Date(isoString).toISOString().replace('T', ' ').replace('.000Z', ' UTC')
}

function toUsd(value) {
  if (!value || value === 'NO-ASK-PRICE' || value === 'NO-OFFER-PRICE') return null
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return null
  return num / 1e18
}

function toUsdCents(value) {
  if (!value) return null
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return null
  return num / 100
}

function extractAttribute(item, trait) {
  return item.attributes?.find((attr) => attr.trait === trait)?.value || ''
}

function normalizeItem(item) {
  const serial = extractAttribute(item, 'Serial') || ''
  const serialMatch = serial.match(/\d+/)
  const serialNum = serialMatch ? Number.parseInt(serialMatch[0], 10) : null
  const askPrice = toUsd(item.askPriceInUSDT)
  const offerPrice = toUsd(item.offerPriceInUSDT)
  const fmv = toUsdCents(item.fmvPriceInUSD)
  const buybackBaseValue = toUsdCents(item.buybackBaseValueInUSD)

  return {
    token_id: String(item.tokenId),
    item_id: item.itemId || null,
    name: item.name || '',
    set_name: item.setName || '',
    card_number: item.cardNumber || '',
    character_name: item.pokemonName || '',
    owner_address: item.ownerAddress || '',
    owner_username: item.owner?.username || '',
    vault_location: item.vaultLocation || '',
    serial,
    serial_num: Number.isFinite(serialNum) ? serialNum : null,
    grader: extractAttribute(item, 'Grader') || item.gradingCompany || '',
    grade: extractAttribute(item, 'Grade') || item.grade || '',
    language: extractAttribute(item, 'Language') || '',
    year: Number.isFinite(Number(item.year)) ? Number(item.year) : null,
    image_url: item.frontImageUrl || '',
    ask_price: askPrice,
    offer_price: offerPrice,
    fmv,
    buyback_base_value: buybackBaseValue,
    is_listed: askPrice != null ? 1 : 0,
  }
}

function cardChanged(existing, next) {
  if (!existing) return true
  return (
    existing.is_listed !== next.is_listed ||
    existing.ask_price !== next.ask_price ||
    existing.fmv !== next.fmv ||
    existing.token_id !== next.token_id
  )
}

// 全局标记：每个 Worker 实例只执行一次 ensureSchema
let schemaEnsured = false

async function ensureSchema(env) {
  if (schemaEnsured) return
  const statements = [
    `CREATE TABLE IF NOT EXISTS renaiss_cards (
      token_id TEXT PRIMARY KEY,
      item_id TEXT,
      name TEXT,
      set_name TEXT,
      card_number TEXT,
      character_name TEXT,
      owner_address TEXT,
      owner_username TEXT,
      vault_location TEXT,
      serial TEXT,
      serial_num INTEGER,
      grader TEXT,
      grade TEXT,
      language TEXT,
      year INTEGER,
      image_url TEXT,
      ask_price REAL,
      offer_price REAL,
      fmv REAL,
      buyback_base_value REAL,
      is_listed INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    )`,
    'CREATE INDEX IF NOT EXISTS idx_renaiss_cards_serial_num ON renaiss_cards(serial_num)',
    'CREATE INDEX IF NOT EXISTS idx_renaiss_cards_is_listed ON renaiss_cards(is_listed)',
    'CREATE INDEX IF NOT EXISTS idx_renaiss_cards_listed_serial ON renaiss_cards(is_listed, ask_price, serial_num)',
    `CREATE TABLE IF NOT EXISTS scan_status (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      indexed_count INTEGER NOT NULL DEFAULT 0,
      listed_count INTEGER NOT NULL DEFAULT 0,
      consecutive_pairs INTEGER NOT NULL DEFAULT 0,
      last_full_scan TEXT,
      last_listing_refresh TEXT,
      is_scanning INTEGER NOT NULL DEFAULT 0,
      scan_progress TEXT,
      last_source_total INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS api_cache (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      pairs_json TEXT NOT NULL DEFAULT '[]',
      total_pairs INTEGER NOT NULL DEFAULT 0,
      total_cards INTEGER NOT NULL DEFAULT 0,
      total_listed INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    )`,
    `INSERT INTO scan_status (id, indexed_count, listed_count, consecutive_pairs, is_scanning, scan_progress, last_source_total)
     VALUES (1, 0, 0, 0, 0, 'Idle', 0)
     ON CONFLICT(id) DO NOTHING`,
    `INSERT INTO api_cache (id, pairs_json, total_pairs, total_cards, total_listed, updated_at)
     VALUES (1, '[]', 0, 0, 0, '1970-01-01T00:00:00.000Z')
     ON CONFLICT(id) DO NOTHING`,
  ]

  for (const sql of statements) {
    await env.DB.prepare(sql).run()
  }
  schemaEnsured = true
}

async function setStatus(env, fields) {
  const current = await env.DB.prepare('SELECT * FROM scan_status WHERE id = 1').first()
  const merged = {
    indexed_count: current?.indexed_count ?? 0,
    listed_count: current?.listed_count ?? 0,
    consecutive_pairs: current?.consecutive_pairs ?? 0,
    last_full_scan: current?.last_full_scan ?? null,
    last_listing_refresh: current?.last_listing_refresh ?? null,
    is_scanning: current?.is_scanning ?? 0,
    scan_progress: current?.scan_progress ?? 'Idle',
    last_source_total: current?.last_source_total ?? 0,
    ...fields,
  }

  await env.DB.prepare(`
    INSERT INTO scan_status (
      id, indexed_count, listed_count, consecutive_pairs,
      last_full_scan, last_listing_refresh, is_scanning,
      scan_progress, last_source_total
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
    ON CONFLICT(id) DO UPDATE SET
      indexed_count = excluded.indexed_count,
      listed_count = excluded.listed_count,
      consecutive_pairs = excluded.consecutive_pairs,
      last_full_scan = excluded.last_full_scan,
      last_listing_refresh = excluded.last_listing_refresh,
      is_scanning = excluded.is_scanning,
      scan_progress = excluded.scan_progress,
      last_source_total = excluded.last_source_total
  `)
    .bind(
      1,
      merged.indexed_count,
      merged.listed_count,
      merged.consecutive_pairs,
      merged.last_full_scan,
      merged.last_listing_refresh,
      merged.is_scanning,
      merged.scan_progress,
      merged.last_source_total,
    )
    .run()
}

async function fetchMarketplacePage(env, offset) {
  const limit = parsePositiveInt(env.SYNC_LIMIT, DEFAULT_LIMIT)
  const input = {
    json: {
      limit,
      offset,
      sortBy: 'listDate',
      sortOrder: 'desc',
      listedOnly: true,
      characterFilter: '',
      languageFilter: '',
      gradingCompanyFilter: '',
      gradeFilter: '',
      yearRange: '',
      priceRangeFilter: '',
    },
  }

  const url = new URL(env.MARKETPLACE_API || DEFAULT_MARKETPLACE_API)
  url.searchParams.set('input', JSON.stringify(input))

  const response = await fetch(url.toString(), {
    headers: {
      accept: 'application/json',
      'user-agent': 'renaiss-scanner/1.0',
    },
    cf: {
      cacheTtl: 300,
      cacheEverything: false,
    },
  })

  if (!response.ok) {
    throw new Error(`Marketplace API returned ${response.status}`)
  }

  const payload = await response.json()
  return payload?.result?.data?.json ?? payload?.result?.json ?? payload?.data?.json ?? payload
}

async function loadExistingCards(env, tokenIds) {
  const uniqueTokenIds = [...new Set(tokenIds.filter(Boolean))]
  if (uniqueTokenIds.length === 0) return new Map()

  const chunkSize = 200
  const results = new Map()

  for (let i = 0; i < uniqueTokenIds.length; i += chunkSize) {
    const chunk = uniqueTokenIds.slice(i, i + chunkSize)
    const placeholders = chunk.map((_, index) => `?${index + 1}`).join(', ')
    const query = `SELECT token_id, is_listed, ask_price, fmv FROM renaiss_cards WHERE token_id IN (${placeholders})`
    const rows = await env.DB.prepare(query).bind(...chunk).all()

    for (const row of rows.results || []) {
      results.set(String(row.token_id), row)
    }
  }

  return results
}

async function batchUpsertCards(env, cards) {
  if (cards.length === 0) return
  const now = new Date().toISOString()
  const statements = cards.map((card) =>
    env.DB.prepare(UPSERT_SQL).bind(
      card.token_id,
      card.item_id,
      card.name,
      card.set_name,
      card.card_number,
      card.character_name,
      card.owner_address,
      card.owner_username,
      card.vault_location,
      card.serial,
      card.serial_num,
      card.grader,
      card.grade,
      card.language,
      card.year,
      card.image_url,
      card.ask_price,
      card.offer_price,
      card.fmv,
      card.buyback_base_value,
      card.is_listed,
      now,
    )
  )
  await env.DB.batch(statements)
}

function formatCard(row) {
  const serial = row.serial || ''
  const isListed = !!row.is_listed && row.ask_price > 0
  return {
    tokenId: row.token_id || '',
    serial,
    numericSerial: Number(row.serial_num),
    name: row.name || '',
    link: 'https://www.renaiss.xyz/marketplace',
    isListed,
    price: isListed ? row.ask_price : null,
    fmv: row.fmv,
    imageUrl: row.image_url,
    grader: row.grader,
    grade: row.grade,
    setName: row.set_name,
    year: row.year,
  }
}

function buildPairs(cards) {
  const pairs = []
  for (let i = 0; i < cards.length - 1; i++) {
    const a = cards[i]
    const b = cards[i + 1]
    const numA = Number(a.serial_num)
    const numB = Number(b.serial_num)
    if (!Number.isFinite(numA) || !Number.isFinite(numB)) continue
    if (numB - numA !== 1) continue

    const aListed = !!a.is_listed && a.ask_price > 0
    const bListed = !!b.is_listed && b.ask_price > 0
    if (!(aListed && bListed)) continue

    const priceA = a.ask_price || 0
    const priceB = b.ask_price || 0

    pairs.push({
      card1: formatCard(a),
      card2: formatCard(b),
      serialRange: `${numA} → ${numB}`,
      sameName: a.name === b.name,
      totalCost: priceA + priceB,
      totalFmv: (a.fmv || 0) + (b.fmv || 0),
      bothListed: true,
      eitherListed: true,
      buyable: true,
    })
  }
  return pairs
}

// 全局缓存配对计算结果，避免每次同步重复查询
let cachedPairs = null
let lastPairCalculation = 0

/**
 * 从 renaiss_cards 表计算连号配对，并写入 api_cache。
 * 仅在 runSync 同步完成后调用，属于低频操作（每10分钟1次）。
 */
async function computeAndCachePairs(env) {
  // 每次同步周期只计算一次，避免重复执行
  const now = Date.now()
  if (cachedPairs && (now - lastPairCalculation) < 600000) { // 10分钟内不重复计算
    return cachedPairs
  }

  const result = await env.DB.prepare(`
    SELECT token_id, serial, serial_num, name, image_url, grader, grade, set_name, year,
           is_listed, fmv, ask_price
    FROM renaiss_cards
    WHERE serial_num IS NOT NULL AND is_listed = 1 AND ask_price > 0
    ORDER BY serial_num ASC
  `).all()

  const pairs = buildPairs(result.results || [])
  pairs.sort((a, b) => {
    if (a.totalCost !== b.totalCost) return a.totalCost - b.totalCost
    return a.card1.numericSerial - b.card1.numericSerial
  })

  // 写入 api_cache（单行），后续 /api/scanner 直接读此缓存
  await env.DB.prepare(`
    INSERT INTO api_cache (id, pairs_json, total_pairs, total_cards, total_listed, updated_at)
    VALUES (1, ?1, ?2, ?3, ?4, ?5)
    ON CONFLICT(id) DO UPDATE SET
      pairs_json = excluded.pairs_json,
      total_pairs = excluded.total_pairs,
      total_cards = excluded.total_cards,
      total_listed = excluded.total_listed,
      updated_at = excluded.updated_at
  `).bind(
    JSON.stringify(pairs),
    pairs.length,
    0, // 现在用 runSync 传递的值
    0, // 现在用 runSync 传递的值
    new Date().toISOString(),
  ).run()

  cachedPairs = { pairs }
  lastPairCalculation = now

  return { pairs }
}

async function runSync(env) {
  await ensureSchema(env)

  const current = await env.DB.prepare('SELECT is_scanning, last_listing_refresh FROM scan_status WHERE id = 1').first()

  if (current?.is_scanning) {
    const lastRefresh = current?.last_listing_refresh ? new Date(current.last_listing_refresh).getTime() : 0
    const stuckMinutes = (Date.now() - lastRefresh) / 60000
    if (stuckMinutes > 15) {
      await setStatus(env, { is_scanning: 0, scan_progress: 'Stuck flag auto-cleared' })
    } else {
      return { skipped: true, reason: 'sync already in progress' }
    }
  }

  await setStatus(env, {
    is_scanning: 1,
    scan_progress: 'Starting marketplace sync...',
  })

  try {
    let offset = 0
    let total = 0
    let seen = 0
    let listedCount = 0
    let pageCount = 0

    const allChangedCards = []

    while (true) {
      const page = await fetchMarketplacePage(env, offset)
      const collection = page?.collection || []
      const pagination = page?.pagination || {}
      total = Number(pagination.total || total || 0)

      if (collection.length === 0) break

      const normalizedCards = collection.map(normalizeItem)
      const existingMap = await loadExistingCards(env, normalizedCards.map((card) => card.token_id))
      const changedCards = normalizedCards.filter((card) => cardChanged(existingMap.get(card.token_id), card))

      allChangedCards.push(...changedCards)

      seen += normalizedCards.length
      listedCount += normalizedCards.filter((card) => card.is_listed).length
      pageCount += 1

      if (!pagination.hasMore) break
      offset += collection.length
    }

    await batchUpsertCards(env, allChangedCards)

    // 计算配对并写入 api_cache
    const { pairs } = await computeAndCachePairs(env)

    // 用同步过程中的实际统计代替 COUNT(*)，避免全表扫描
    const totalCards = seen
    const totalListed = listedCount
    const now = new Date().toISOString()

    // 更新 api_cache 中的 total_cards 和 total_listed
    await env.DB.prepare(`
      UPDATE api_cache SET total_cards = ?1, total_listed = ?2 WHERE id = 1
    `).bind(totalCards, totalListed).run()

    await setStatus(env, {
      indexed_count: totalCards,
      listed_count: totalListed,
      consecutive_pairs: pairs.length,
      last_full_scan: now,
      last_listing_refresh: now,
      is_scanning: 0,
      scan_progress: `Sync complete: ${seen} cards scanned, ${allChangedCards.length} changed, ${pairs.length} pairs`,
      last_source_total: total,
    })

    return { seen, changed: allChangedCards.length, total, pairs: pairs.length }
  } catch (error) {
    await setStatus(env, {
      is_scanning: 0,
      scan_progress: `Error: ${error.message}`,
    })
    throw error
  }
}

/**
 * 【优化核心】/api/scanner/status — 合并3次独立查询为1次 batch
 * 优化前：3次独立 SELECT → 读取 3×1 = 3 行 + COUNT 扫描
 * 优化后：1次 batch 查询 → 读取 1 行 api_cache + scan_status
 */
async function handleStatus(env) {
  await ensureSchema(env)

  // 用 batch 合并所有查询，减少 D1 调用次数
  const [statusRow, cacheRow] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM scan_status WHERE id = 1'),
    env.DB.prepare('SELECT total_cards, total_listed, updated_at FROM api_cache WHERE id = 1'),
  ])

  const status = statusRow?.results?.[0] || null
  const cache = cacheRow?.results?.[0] || null

  return json({
    status: status ? {
      ...status,
      last_full_scan_utc: utcLabel(status.last_full_scan),
      last_listing_refresh_utc: utcLabel(status.last_listing_refresh),
    } : {},
    totalIndexed: Number(cache?.total_cards || 0),
    totalListed: Number(cache?.total_listed || 0),
  })
}

/**
 * 【优化核心】/api/scanner — 从 api_cache 读取预计算的配对 JSON
 * 优化前：每次请求读取所有 listed cards（全表扫描，N 行）+ 2 次 COUNT + 1 次 scan_status
 * 优化后：读取 api_cache 单行（1 行）+ scan_status（1 行），共 2 行读取
 */
async function handleScanner(request, env) {
  await ensureSchema(env)
  const url = new URL(request.url)
  const page = parsePositiveInt(url.searchParams.get('page'), 1)
  const pageSize = Math.min(50, parsePositiveInt(url.searchParams.get('pageSize'), DEFAULT_PAGE_SIZE))

  // 只读 api_cache + scan_status，2 行读取代替读取整张 cards 表
  const [cacheRow, statusRow] = await env.DB.batch([
    env.DB.prepare('SELECT pairs_json, total_pairs, total_cards, total_listed, updated_at FROM api_cache WHERE id = 1'),
    env.DB.prepare('SELECT last_listing_refresh, last_full_scan FROM scan_status WHERE id = 1'),
  ])

  const cache = cacheRow?.results?.[0]
  const status = statusRow?.results?.[0]

  const allPairs = cache?.pairs_json ? JSON.parse(cache.pairs_json) : []
  const totalFiltered = allPairs.length
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize))
  const start = (page - 1) * pageSize

  return json({
    pairs: allPairs.slice(start, start + pageSize),
    totalPairs: totalFiltered,
    totalCards: Number(cache?.total_cards || 0),
    totalListed: Number(cache?.total_listed || 0),
    scannedAt: status?.last_listing_refresh || status?.last_full_scan || cache?.updated_at || null,
    scannedAtUtc: utcLabel(status?.last_listing_refresh || status?.last_full_scan || cache?.updated_at || null),
    source: 'marketplace',
    page,
    pageSize,
    totalPages,
  })
}

async function handleRefresh(request, env) {
  const expected = env.REFRESH_TOKEN
  const provided = request.headers.get('x-refresh-token') || new URL(request.url).searchParams.get('token')
  if (expected && expected !== 'change-me' && provided !== expected) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await runSync(env)
  return json({ ok: true, ...result })
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return withCors(new Response(null, { status: 204 }), env)
    }

    const url = new URL(request.url)
    let response

    if (url.pathname === '/api/scanner/status' && request.method === 'GET') {
      response = await handleStatus(env)
    } else if (url.pathname === '/api/scanner' && request.method === 'GET') {
      response = await handleScanner(request, env)
    } else if (url.pathname === '/api/scanner/refresh' && request.method === 'POST') {
      response = await handleRefresh(request, env)
    } else if (url.pathname === '/api/health') {
      response = json({ ok: true })
    } else {
      // Let Assets handle non-API routes
      response = new Response('Not Found', { status: 404 })
    }

    return withCors(response, env)
  },

  async scheduled(_event, env) {
    await runSync(env)
  },
}