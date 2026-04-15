const { dataApi } = require("@surf-ai/sdk/server");
const { dbQuery: rawDbQuery, dbProvision } = require("@surf-ai/sdk/db");
const { Router } = require("express");
const router = Router();

// Normalize dbQuery results: Surf SDK returns { rows: [...] } — we want the rows array
async function dbQuery(sql, params) {
  const result = await rawDbQuery(sql, params);
  return result?.rows ?? result ?? [];
}

// Ensure tables exist on first load
const tablesReady = (async () => {
  try {
    await dbProvision();
    await dbQuery(`
      CREATE TABLE IF NOT EXISTS renaiss_cards (
        token_id TEXT PRIMARY KEY,
        token_index INTEGER,
        serial TEXT,
        serial_num BIGINT,
        name TEXT,
        image_url TEXT,
        grader TEXT,
        grade TEXT,
        set_name TEXT,
        year INTEGER,
        metadata_url TEXT,
        owner TEXT,
        is_listed BOOLEAN DEFAULT false,
        vault_address TEXT,
        fmv REAL,
        price REAL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await dbQuery(`
      CREATE TABLE IF NOT EXISTS scan_status (
        id INTEGER PRIMARY KEY DEFAULT 1,
        total_supply INTEGER DEFAULT 0,
        indexed_count INTEGER DEFAULT 0,
        listed_count INTEGER DEFAULT 0,
        consecutive_pairs INTEGER DEFAULT 0,
        last_full_scan TIMESTAMPTZ,
        last_listing_refresh TIMESTAMPTZ,
        is_scanning BOOLEAN DEFAULT false,
        scan_progress TEXT
      )
    `);
    // Add ask_price column if not exists (for marketplace price)
    await dbQuery("ALTER TABLE renaiss_cards ADD COLUMN IF NOT EXISTS ask_price REAL");
    // Ensure PRIMARY KEY constraints exist (dbProvision may create tables without them)
    try {
      await dbQuery("ALTER TABLE renaiss_cards ADD CONSTRAINT renaiss_cards_pkey PRIMARY KEY (token_id)");
    } catch { /* constraint already exists — OK */ }
    try {
      await dbQuery("ALTER TABLE scan_status ADD CONSTRAINT scan_status_pkey PRIMARY KEY (id)");
    } catch { /* constraint already exists — OK */ }
    // Reset stale scanning flag (in case server restarted mid-scan)
    await dbQuery("UPDATE scan_status SET is_scanning = false WHERE is_scanning = true");
    console.log("[scanner] Tables ready");
  } catch (err) {
    console.error("[scanner] Table init error:", err.message);
  }
})();

// ─── Constants ──────────────────────────────────────────────────────────────

const REGISTRY = "0xf8646a3ca093e97bb404c3b25e675c0394dd5b30";

// Renaiss tRPC marketplace API
const RENAISS_API = "https://www.renaiss.xyz/api/trpc/collectible.list";
const RENAISS_PAGE_SIZE = 25; // Max per-page from their API

const RPC_ENDPOINTS = [
  "https://bsc-dataseed1.binance.org/",
  "https://bsc-dataseed2.binance.org/",
  "https://bsc-dataseed3.binance.org/",
  "https://bsc-dataseed4.binance.org/",
  "https://bsc-dataseed1.defibit.io/",
  "https://bsc-dataseed2.defibit.io/",
  "https://bsc-dataseed1.ninicoin.io/",
  "https://bsc-dataseed2.ninicoin.io/",
];

// Card image URL pattern — replace {SERIAL} with the NFT Serial attribute value
const CARD_IMAGE_BASE = "https://8nothtoc5ds7a0x3.public.blob.vercel-storage.com/graded-cards-renders";

// Function selectors (4-byte keccak prefixes)
const SEL = {
  totalSupply: "0x18160ddd",
  tokenByIndex: "0x4f6ccce7",
  tokenOfOwnerByIndex: "0x2f745c59",
  balanceOf: "0x70a08231",
  tokenURI: "0xc87b56dd",
  ownerOf: "0x6352211e",
};

// ─── RPC helpers (pure fetch, no ethers.js) ─────────────────────────────────

let rpcIndex = 0;
let rpcCallId = 1;

function nextRpc() {
  const url = RPC_ENDPOINTS[rpcIndex % RPC_ENDPOINTS.length];
  rpcIndex++;
  return url;
}

function pad256(hex) {
  const clean = hex.replace(/^0x/i, "");
  return clean.padStart(64, "0");
}

function numToHex256(n) {
  return pad256(n.toString(16));
}

function addrTo256(addr) {
  return pad256(addr.replace(/^0x/i, ""));
}

async function ethCall(to, data, retries = 4) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const url = nextRpc();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_call",
          params: [{ to, data }, "latest"],
          id: rpcCallId++,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const json = await resp.json();
      if (json.error) {
        if (json.error.message?.includes("limit")) {
          await sleep(1000 * (attempt + 1));
          continue;
        }
        throw new Error(json.error.message);
      }
      return json.result;
    } catch (err) {
      if (attempt === retries - 1) throw err;
      await sleep(500 * (attempt + 1));
    }
  }
}

function decodeUint(hex) {
  const clean = hex.replace(/^0x/i, "").slice(-64);
  return parseInt(clean, 16);
}

function decodeString(hex) {
  const clean = hex.replace(/^0x/i, "");
  const len = parseInt(clean.slice(64, 128), 16);
  const dataHex = clean.slice(128, 128 + len * 2);
  const bytes = [];
  for (let i = 0; i < dataHex.length; i += 2) {
    bytes.push(parseInt(dataHex.slice(i, i + 2), 16));
  }
  return String.fromCharCode(...bytes);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Contract call wrappers ─────────────────────────────────────────────────

async function getTotalSupply() {
  const result = await ethCall(REGISTRY, SEL.totalSupply);
  return decodeUint(result);
}

async function getTokenByIndex(index) {
  const data = SEL.tokenByIndex + numToHex256(index);
  const result = await ethCall(REGISTRY, data);
  return "0x" + result.replace(/^0x/i, "").slice(-64);
}

async function getBalanceOf(address) {
  const data = SEL.balanceOf + addrTo256(address);
  const result = await ethCall(REGISTRY, data);
  return decodeUint(result);
}

async function getTokenOfOwnerByIndex(owner, index) {
  const data = SEL.tokenOfOwnerByIndex + addrTo256(owner) + numToHex256(index);
  const result = await ethCall(REGISTRY, data);
  return "0x" + result.replace(/^0x/i, "").slice(-64);
}

async function getTokenURI(tokenId) {
  const clean = tokenId.replace(/^0x/i, "");
  const data = SEL.tokenURI + pad256(clean);
  const result = await ethCall(REGISTRY, data);
  return decodeString(result);
}

// ─── Metadata fetcher ───────────────────────────────────────────────────────

async function fetchMetadata(metadataUrl) {
  // Primary: direct fetch (fast, returns clean JSON)
  try {
    const resp = await fetch(metadataUrl, { signal: AbortSignal.timeout(12000) });
    if (resp.ok) return await resp.json();
  } catch { /* fall through */ }
  // Fallback: Surf web/fetch API
  try {
    const result = await dataApi.get("web/fetch", { url: metadataUrl });
    const content = result?.data?.content || "";
    const cleaned = content.replace(/\\\\/g, "\\").replace(/\\_/g, "_");
    try { return JSON.parse(cleaned); } catch {
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    }
  } catch { /* ignore */ }
  return null;
}

function parseMetadata(json) {
  if (!json) return null;
  const attrs = json.attributes || [];
  const getAttr = (type) => attrs.find((a) => a.trait_type === type)?.value;

  const serial = getAttr("Serial") || "";
  const serialMatch = serial.match(/\d+/);
  const serialNum = serialMatch ? parseInt(serialMatch[0], 10) : null;

  return {
    serial,
    serialNum,
    name: json.name || "",
    imageUrl: serial ? `${CARD_IMAGE_BASE}/${serial}/nft_image.jpg` : (json.image || "").replace(/\\_/g, "_"),
    grader: getAttr("Grader") || "",
    grade: getAttr("Grade") || "",
    setName: getAttr("Set") || "",
    year: parseInt(getAttr("Year")) || null,
  };
}

// ─── Batch execution with concurrency control ───────────────────────────────

async function batchExecute(items, fn, concurrency = 15) {
  const results = new Array(items.length);
  let idx = 0;

  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      try {
        results[i] = await fn(items[i], i);
      } catch (err) {
        results[i] = { error: err.message };
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// ─── Status helpers ─────────────────────────────────────────────────────────

async function getStatus() {
  try {
    const rows = await dbQuery("SELECT * FROM scan_status WHERE id = 1");
    return rows[0] || null;
  } catch {
    return null;
  }
}

async function upsertStatus(fields) {
  try {
    const keys = Object.keys(fields);
    const values = Object.values(fields);
    const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
    const placeholders = keys.map((_, i) => `$${i + 2}`).join(", ");
    const sql = `INSERT INTO scan_status (id, ${keys.join(", ")}) VALUES ($1, ${placeholders})
     ON CONFLICT (id) DO UPDATE SET ${sets}`;
    await dbQuery(sql, [1, ...values]);
  } catch (err) {
    console.error("[scanner] upsertStatus error:", err.message, "fields:", JSON.stringify(fields));
  }
}

// ─── Core scan logic (shared by API + cron) ─────────────────────────────────

async function runFullScan() {
  await tablesReady;
  const status = await getStatus();
  if (status?.is_scanning) {
    console.log("[scanner] Scan already in progress, skipping.");
    return;
  }

  try {
    await upsertStatus({ is_scanning: true, scan_progress: "Starting..." });

    // 1. Get total supply
    const totalSupply = await getTotalSupply();
    await upsertStatus({
      total_supply: totalSupply,
      scan_progress: `Fetching ${totalSupply} token IDs...`,
    });

    // 2. Enumerate all tokenIds
    const indices = Array.from({ length: totalSupply }, (_, i) => i);
    const tokenIds = await batchExecute(
      indices,
      async (index, i) => {
        const id = await getTokenByIndex(index);
        if (i % 100 === 0) {
          await upsertStatus({ scan_progress: `Token IDs: ${i}/${totalSupply}` });
        }
        if (i % 50 === 0 && i > 0) await sleep(200);
        return { index, tokenId: id };
      },
      8
    );

    const validTokens = tokenIds.filter((t) => t && !t.error && t.tokenId);
    await upsertStatus({
      scan_progress: `Got ${validTokens.length} token IDs. Fetching metadata...`,
    });

    // 3. For each token, get tokenURI + metadata
    let metadataCount = 0;
    const METADATA_BATCH = 100;

    for (let batch = 0; batch < validTokens.length; batch += METADATA_BATCH) {
      const slice = validTokens.slice(batch, batch + METADATA_BATCH);

      const uris = await batchExecute(
        slice,
        async (t, i) => {
          const uri = await getTokenURI(t.tokenId);
          if (i % 30 === 0 && i > 0) await sleep(200);
          return { ...t, uri };
        },
        6
      );

      const metas = await batchExecute(
        uris.filter((u) => u && u.uri && !u.error),
        async (u) => {
          const json = await fetchMetadata(u.uri);
          const parsed = parseMetadata(json);
          return { ...u, meta: parsed };
        },
        10
      );

      for (const item of metas) {
        if (!item || item.error || !item.meta) continue;
        const m = item.meta;
        try {
          await dbQuery(
            `INSERT INTO renaiss_cards (token_id, token_index, serial, serial_num, name, image_url, grader, grade, set_name, year, metadata_url, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
             ON CONFLICT (token_id) DO UPDATE SET
               serial = $3, serial_num = $4, name = $5, image_url = $6,
               grader = $7, grade = $8, set_name = $9, year = $10,
               metadata_url = $11, updated_at = NOW()`,
            [item.tokenId, item.index, m.serial, m.serialNum, m.name, m.imageUrl,
             m.grader, m.grade, m.setName, m.year, item.uri]
          );
          metadataCount++;
        } catch (dbErr) {
          console.error(`DB insert error for token ${item.tokenId}:`, dbErr.message);
        }
      }

      const pct = Math.round(((batch + slice.length) / validTokens.length) * 100);
      await upsertStatus({
        indexed_count: metadataCount,
        scan_progress: `Metadata: ${batch + slice.length}/${validTokens.length} (${pct}%, ${metadataCount} saved)`,
      });
    }

    // 4. Refresh listings via marketplace API
    await upsertStatus({ scan_progress: "Scanning marketplace listings..." });
    await refreshListings();

    // 5. Count consecutive pairs
    const pairs = await findConsecutivePairsFromDB();
    await upsertStatus({
      is_scanning: false,
      indexed_count: metadataCount,
      consecutive_pairs: pairs.length,
      last_full_scan: new Date().toISOString(),
      scan_progress: `Done! ${metadataCount} cards indexed, ${pairs.length} consecutive pairs found.`,
    });

    console.log(`[scanner] Full scan complete: ${metadataCount} cards, ${pairs.length} pairs.`);
  } catch (err) {
    console.error("[scanner] Full scan error:", err);
    await upsertStatus({
      is_scanning: false,
      scan_progress: `Error: ${err.message}`,
    });
  }
}

async function runListingRefresh() {
  await tablesReady;
  const status = await getStatus();
  if (status?.is_scanning) {
    console.log("[scanner] Scan in progress, skipping refresh.");
    return;
  }

  try {
    await upsertStatus({ is_scanning: true, scan_progress: "Refreshing listings..." });
    await refreshListings();

    const pairs = await findConsecutivePairsFromDB();
    await upsertStatus({
      is_scanning: false,
      consecutive_pairs: pairs.length,
      last_listing_refresh: new Date().toISOString(),
      scan_progress: `Listings refreshed. ${pairs.length} consecutive pairs.`,
    });
    console.log(`[scanner] Listing refresh complete: ${pairs.length} pairs.`);
  } catch (err) {
    console.error("[scanner] Refresh error:", err);
    await upsertStatus({ is_scanning: false, scan_progress: `Error: ${err.message}` });
  }
}

// ─── Scheduled daily scan (Beijing 01:00 = UTC 17:00) ───────────────────────

function scheduleDailyScan() {
  function msUntilNextRun() {
    const now = new Date();
    // Target: 17:00 UTC (= Beijing 01:00 next day)
    const target = new Date(now);
    target.setUTCHours(17, 0, 0, 0);
    // If already past 17:00 UTC today, schedule for tomorrow
    if (now >= target) {
      target.setUTCDate(target.getUTCDate() + 1);
    }
    return target.getTime() - now.getTime();
  }

  function scheduleNext() {
    const delay = msUntilNextRun();
    const targetTime = new Date(Date.now() + delay);
    console.log(`[scanner] Next auto-scan scheduled at ${targetTime.toISOString()} (Beijing ${targetTime.getUTCHours() + 8}:00)`);

    setTimeout(async () => {
      console.log("[scanner] Starting scheduled daily scan...");
      try {
        await runFullScan();
      } catch (err) {
        console.error("[scanner] Scheduled scan failed:", err.message);
      }
      // Schedule the next one
      scheduleNext();
    }, delay);
  }

  scheduleNext();
}

// Start the scheduler on module load + auto-scan if DB is empty
tablesReady.then(async () => {
  scheduleDailyScan();
  console.log("[scanner] Daily auto-scan scheduler started (Beijing 01:00 / UTC 17:00)");

  // If Production DB is empty, run first full scan immediately
  try {
    const countResult = await dbQuery("SELECT count(*) as cnt FROM renaiss_cards");
    const count = parseInt(countResult[0]?.cnt || "0");
    if (count === 0) {
      console.log("[scanner] Database is empty — triggering initial full scan on startup...");
      runFullScan().catch((err) =>
        console.error("[scanner] Initial scan failed:", err.message)
      );
    }
  } catch (err) {
    console.error("[scanner] Startup check error:", err.message);
  }
});

// ─── Refresh listing status via Renaiss marketplace tRPC API ────────────────

async function refreshListings() {
  // Reset all to unlisted
  await dbQuery("UPDATE renaiss_cards SET is_listed = false, ask_price = NULL");

  let offset = 0;
  let total = null;
  let listedCount = 0;
  const listedSerials = new Set();

  while (true) {
    try {
      const input = JSON.stringify({
        json: { limit: RENAISS_PAGE_SIZE, offset, sortBy: "listDate", sortOrder: "desc" },
      });
      const url = `${RENAISS_API}?input=${encodeURIComponent(input)}`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!resp.ok) {
        console.error(`[scanner] Marketplace API returned ${resp.status}`);
        break;
      }
      const data = await resp.json();
      const result = data?.result?.data?.json;
      if (!result) break;

      const items = result.collection || [];
      const pagination = result.pagination || {};
      if (total === null) total = pagination.total || 0;

      if (items.length === 0) break;

      // Process each item — only cards with an actual ask price are truly "listed"
      for (const item of items) {
        const attrs = item.attributes || [];
        const serialAttr = attrs.find((a) => a.trait === "Serial");
        const serial = serialAttr?.value || "";
        if (!serial) continue;

        // Parse ask price (bigint string in wei-like format → USDT)
        let askPrice = null;
        if (item.askPriceInUSDT && item.askPriceInUSDT !== "NO-ASK-PRICE") {
          // askPriceInUSDT is like "122400000000000000000" (18 decimals)
          askPrice = parseFloat(item.askPriceInUSDT) / 1e18;
          if (askPrice <= 0) askPrice = null;
        }

        // Parse FMV (cents → dollars)
        let fmv = null;
        if (item.fmvPriceInUSD && item.fmvPriceInUSD !== "0") {
          fmv = parseFloat(item.fmvPriceInUSD) / 100;
        }

        // Only truly "listed" if there's an actual ask price > 0
        const isListed = askPrice != null && askPrice > 0;

        if (isListed) {
          listedSerials.add(serial);
          listedCount++;
        }

        // Update card in DB by serial match — always update FMV, but is_listed only if priced
        await dbQuery(
          `UPDATE renaiss_cards SET is_listed = $1, ask_price = $2, fmv = $3, updated_at = NOW()
           WHERE serial = $4`,
          [isListed, askPrice, fmv, serial]
        );
      }

      await upsertStatus({
        scan_progress: `Marketplace: ${offset + items.length}/${total} listings scanned`,
      });

      offset += items.length;
      if (!pagination.hasMore) break;

      // Rate limit: small delay between pages
      await sleep(300);
    } catch (err) {
      console.error(`[scanner] Marketplace API error at offset ${offset}:`, err.message);
      // Retry once after delay
      await sleep(2000);
      continue;
    }
  }

  const listedResult = await dbQuery(
    "SELECT count(*) as cnt FROM renaiss_cards WHERE is_listed = true AND ask_price > 0"
  );
  const actualListed = parseInt(listedResult[0]?.cnt || "0");
  await upsertStatus({ listed_count: actualListed });
  console.log(`[scanner] Marketplace scan: ${total} API items, ${listedCount} with ask price, ${actualListed} matched in DB`);
}

// ─── Find consecutive serial pairs from DB ──────────────────────────────────

async function findConsecutivePairsFromDB() {
  const cards = await dbQuery(
    `SELECT token_id, serial, serial_num, name, image_url, grader, grade, set_name, year,
            is_listed, fmv, ask_price
     FROM renaiss_cards
     WHERE serial_num IS NOT NULL
     ORDER BY serial_num ASC`
  );

  const pairs = [];
  for (let i = 0; i < cards.length - 1; i++) {
    const a = cards[i];
    const b = cards[i + 1];
    const numA = Number(a.serial_num);
    const numB = Number(b.serial_num);
    if (numB - numA === 1) {
      // Truly listed = has ask_price > 0
      const aListed = a.is_listed && a.ask_price > 0;
      const bListed = b.is_listed && b.ask_price > 0;
      const bothListed = aListed && bListed;
      const eitherListed = aListed || bListed;
      const priceA = aListed ? (a.ask_price || 0) : 0;
      const priceB = bListed ? (b.ask_price || 0) : 0;
      pairs.push({
        card1: formatCard(a),
        card2: formatCard(b),
        serialRange: `${numA} → ${numB}`,
        sameName: a.name === b.name,
        totalCost: priceA + priceB,
        totalFmv: (a.fmv || 0) + (b.fmv || 0),
        bothListed,
        eitherListed,
        buyable: bothListed,
      });
    }
  }

  return pairs;
}

function formatCard(row) {
  const serial = row.serial || "";
  const imageUrl = serial
    ? `${CARD_IMAGE_BASE}/${serial}/nft_image.jpg`
    : row.image_url;

  const isListed = !!row.is_listed && row.ask_price > 0;
  return {
    serial,
    numericSerial: Number(row.serial_num),
    name: row.name || "",
    link: `https://renaiss.xyz`,
    isListed,
    price: isListed ? row.ask_price : null,
    fmv: row.fmv,
    imageUrl,
    grader: row.grader,
    grade: row.grade,
    setName: row.set_name,
    year: row.year,
  };
}

// ─── Routes ─────────────────────────────────────────────────────────────────

/**
 * GET /api/scanner/status
 * Return current scan status and stats.
 */
router.get("/status", async (req, res) => {
  try {
    await tablesReady;
    const status = await getStatus();
    const countResult = await dbQuery("SELECT count(*) as cnt FROM renaiss_cards");
    const listedResult = await dbQuery(
      "SELECT count(*) as cnt FROM renaiss_cards WHERE is_listed = true AND ask_price > 0"
    );
    res.json({
      status: status || {},
      totalIndexed: parseInt(countResult[0]?.cnt || "0"),
      totalListed: parseInt(listedResult[0]?.cnt || "0"),
    });
  } catch (err) {
    res.json({ status: null, totalIndexed: 0, totalListed: 0, error: err.message });
  }
});

/**
 * GET /api/scanner
 * Return consecutive pairs from DB (read-only, no scan trigger).
 */
router.get("/", async (req, res) => {
  try {
    await tablesReady;
    const countResult = await dbQuery("SELECT count(*) as cnt FROM renaiss_cards");
    const totalIndexed = parseInt(countResult[0]?.cnt || "0");

    if (totalIndexed === 0) {
      return res.json({
        pairs: [],
        totalPairs: 0,
        totalAllPairs: 0,
        totalCards: 0,
        totalListed: 0,
        scannedAt: null,
        source: "onchain",
        error: "No data yet. Waiting for first automatic scan.",
      });
    }

    const mode = req.query.mode || "all";
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize) || 20));

    const pairs = await findConsecutivePairsFromDB();
    const filteredPairs =
      mode === "listed" ? pairs.filter((p) => p.bothListed) : pairs;

    // Sort: listed mode → by total cost ascending (cheapest first); all mode → buyable first, then by serial
    if (mode === "listed") {
      filteredPairs.sort((a, b) => {
        // Both should be buyable in listed mode, sort by totalCost ascending
        if (a.totalCost !== b.totalCost) return a.totalCost - b.totalCost;
        return a.card1.numericSerial - b.card1.numericSerial;
      });
    } else {
      filteredPairs.sort((a, b) => {
        if (a.buyable !== b.buyable) return b.buyable ? 1 : -1;
        // Among buyable, cheapest first
        if (a.buyable && b.buyable && a.totalCost !== b.totalCost) return a.totalCost - b.totalCost;
        return a.card1.numericSerial - b.card1.numericSerial;
      });
    }

    // Paginate
    const totalFiltered = filteredPairs.length;
    const totalPages = Math.ceil(totalFiltered / pageSize);
    const start = (page - 1) * pageSize;
    const pagedPairs = filteredPairs.slice(start, start + pageSize);

    const listedResult = await dbQuery(
      "SELECT count(*) as cnt FROM renaiss_cards WHERE is_listed = true AND ask_price > 0"
    );
    const status = await getStatus();

    res.json({
      pairs: pagedPairs,
      totalPairs: totalFiltered,
      totalAllPairs: pairs.length,
      totalCards: totalIndexed,
      totalListed: parseInt(listedResult[0]?.cnt || "0"),
      scannedAt: status?.last_listing_refresh || status?.last_full_scan || null,
      source: "onchain",
      page,
      pageSize,
      totalPages,
    });
  } catch (err) {
    console.error("Scanner error:", err);
    res.status(500).json({ error: "Failed to query scanner data" });
  }
});

/**
 * POST /api/scanner/build  (internal only — called by cron)
 * Full index: enumerate all tokens, fetch metadata, store in DB.
 */
router.post("/build", async (req, res) => {
  await tablesReady;
  const status = await getStatus();
  if (status?.is_scanning && req.query.force !== "1") {
    return res.json({ message: "Scan already in progress", progress: status.scan_progress });
  }
  res.json({ message: "Full scan started." });
  runFullScan();
});

/**
 * POST /api/scanner/refresh (internal only — called by cron)
 * Quick refresh: just update which tokens are in vault (listed).
 */
router.post("/refresh", async (req, res) => {
  await tablesReady;
  const status = await getStatus();
  if (status?.is_scanning) {
    return res.json({ message: "Scan in progress, try later" });
  }
  res.json({ message: "Listing refresh started." });
  runListingRefresh();
});

/**
 * GET /api/scanner/debug
 * Check table structure and DB connectivity for debugging.
 */
router.get("/debug", async (req, res) => {
  try {
    await tablesReady;
    const results = {};
    try {
      const r = await dbQuery("SELECT count(*) as cnt FROM renaiss_cards");
      results.cardCount = parseInt(r[0]?.cnt || "0");
    } catch (e) { results.cardCountError = e.message; }
    try {
      const r = await dbQuery("SELECT * FROM scan_status WHERE id = 1");
      results.scanStatus = r[0] || "no row";
    } catch (e) { results.scanStatusError = e.message; }
    try {
      await dbQuery(
        `INSERT INTO renaiss_cards (token_id, serial, serial_num, name, is_listed, updated_at)
         VALUES ($1, $2, $3, $4, false, NOW())
         ON CONFLICT (token_id) DO UPDATE SET name = $4, updated_at = NOW()`,
        ["__debug_test__", "DEBUG0", 0, "Debug test card"]
      );
      results.insertTest = "OK";
      await dbQuery("DELETE FROM renaiss_cards WHERE token_id = '__debug_test__'");
    } catch (e) { results.insertError = e.message; }
    try {
      await dbQuery(
        `INSERT INTO renaiss_cards (token_id, serial, serial_num, name, is_listed, ask_price, updated_at)
         VALUES ($1, $2, $3, $4, false, $5, NOW())
         ON CONFLICT (token_id) DO UPDATE SET ask_price = $5, updated_at = NOW()`,
        ["__debug_test2__", "DEBUG0", 0, "Debug test card", 10.5]
      );
      results.askPriceTest = "OK";
      await dbQuery("DELETE FROM renaiss_cards WHERE token_id = '__debug_test2__'");
    } catch (e) { results.askPriceError = e.message; }
    try {
      const cols = await dbQuery(
        "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'renaiss_cards' ORDER BY ordinal_position"
      );
      results.columns = cols.map(c => `${c.column_name}:${c.data_type}`);
    } catch (e) { results.columnsError = e.message; }
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/scanner/export
 * Export all card data + scan status for migration to another environment.
 */
router.get("/export", async (req, res) => {
  try {
    await tablesReady;
    const limit = parseInt(req.query.limit) || 2000;
    const offset = parseInt(req.query.offset) || 0;
    const cards = await dbQuery(
      "SELECT * FROM renaiss_cards ORDER BY serial_num ASC LIMIT $1 OFFSET $2",
      [limit, offset]
    );
    const countResult = await dbQuery("SELECT count(*) as cnt FROM renaiss_cards");
    const total = parseInt(countResult[0]?.cnt || "0");
    const status = await getStatus();
    res.json({ cards, total, offset, limit, status, exportedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/scanner/import
 * Import card data + scan status from another environment.
 * Body: { cards: [...], status: {...} }
 */
router.post("/import", async (req, res) => {
  try {
    await tablesReady;
    const { cards, status } = req.body;
    if (!cards || !Array.isArray(cards)) {
      return res.status(400).json({ error: "Missing cards array" });
    }

    let imported = 0;
    const errors = [];
    for (const c of cards) {
      try {
        await dbQuery(
          `INSERT INTO renaiss_cards (token_id, token_index, serial, serial_num, name, image_url, grader, grade, set_name, year, metadata_url, owner, is_listed, vault_address, fmv, price, ask_price, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW())
           ON CONFLICT (token_id) DO UPDATE SET
             serial=$3, serial_num=$4, name=$5, image_url=$6, grader=$7, grade=$8,
             set_name=$9, year=$10, metadata_url=$11, owner=$12, is_listed=$13,
             vault_address=$14, fmv=$15, price=$16, ask_price=$17, updated_at=NOW()`,
          [c.token_id, c.token_index, c.serial, c.serial_num, c.name, c.image_url,
           c.grader, c.grade, c.set_name, c.year, c.metadata_url, c.owner,
           c.is_listed, c.vault_address, c.fmv, c.price, c.ask_price]
        );
        imported++;
      } catch (err) {
        if (errors.length < 3) errors.push(err.message || String(err));
      }
    }

    // Import scan status
    if (status) {
      await upsertStatus({
        total_supply: status.total_supply || 0,
        indexed_count: imported,
        listed_count: status.listed_count || 0,
        consecutive_pairs: status.consecutive_pairs || 0,
        last_full_scan: status.last_full_scan || new Date().toISOString(),
        last_listing_refresh: status.last_listing_refresh || new Date().toISOString(),
        is_scanning: false,
        scan_progress: `Imported ${imported} cards from migration.`,
      });
    }

    res.json({ message: `Imported ${imported}/${cards.length} cards.`, imported, errors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
