import { useState, useCallback, useEffect, useRef } from "react"
import { api } from "@/lib/api"
import { useI18n, localeLabels, type Locale } from "@/lib/i18n"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  RefreshCw, ArrowRight, Zap, Hash,
  Clock, Database,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Languages, ShoppingCart, Eye, Flame,
  X,
} from "lucide-react"

interface CardData {
  serial: string
  numericSerial: number
  name: string
  link: string | null
  isListed: boolean
  price: number | null
  fmv: number | null
  imageUrl: string | null
  tokenId?: string
  grader?: string
  grade?: string
  setName?: string
  year?: number
}

interface PairData {
  card1: CardData
  card2: CardData
  serialRange: string
  sameName: boolean
  totalCost: number
  totalFmv: number
  bothListed: boolean
  eitherListed: boolean
  buyable: boolean
}

interface ScanResult {
  pairs: PairData[]
  totalPairs: number
  totalCards: number
  totalListed?: number
  scannedAt?: string
  scannedAtUtc?: string
  source?: "marketplace"
  error?: string
  page?: number
  pageSize?: number
  totalPages?: number
}

interface ScanStatus {
  status: {
    indexed_count?: number
    listed_count?: number
    consecutive_pairs?: number
    last_full_scan?: string
    last_listing_refresh?: string
    last_full_scan_utc?: string | null
    last_listing_refresh_utc?: string | null
    is_scanning?: boolean
    scan_progress?: string
    last_source_total?: number
  }
  totalIndexed: number
  totalListed: number
  error?: string
}

function formatRelativeTime(isoStr: string | null | undefined, t: (key: string, params?: Record<string, string | number>) => string): string {
  if (!isoStr) return t("scan.waitingFirst")
  const diff = Date.now() - new Date(isoStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return t("info.justUpdated")
  if (minutes < 60) return t("info.updatedAgo", { minutes })
  const hours = Math.floor(minutes / 60)
  return t("info.updatedHoursAgo", { hours })
}
function CardImage({ name, imageUrl, onClick }: { name: string; imageUrl?: string | null; onClick?: () => void }) {
  const [error, setError] = useState(false)
  const url = imageUrl || null

  if (!url || error) {
    return (
      <div className="w-full aspect-[2/3] rounded-lg bg-bg-subtle flex items-center justify-center cursor-pointer" onClick={onClick}>
        <span className="text-fg-muted text-xs text-center px-2">{name.slice(0, 30)}</span>
      </div>
    )
  }

  return (
    <img
      src={url}
      alt={name}
      className="w-full aspect-[2/3] object-cover rounded-lg shadow-sm cursor-pointer hover:opacity-90 transition-opacity"
      onError={() => setError(true)}
      loading="lazy"
      onClick={onClick}
    />
  )
}

function StatCard({ value, label, accent }: { value: string | number; label: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-border-strong bg-bg-base-opaque p-4 text-center shadow-sm">
      <div className={`text-xl font-bold ${accent ? "text-brand-100" : "text-fg-base"}`}>{value}</div>
      <div className="mt-1 text-[11px] uppercase tracking-wide text-fg-muted">{label}</div>
    </div>
  )
}

function PairCard({ pair, index, t }: { pair: PairData; index: number; t: (key: string, params?: Record<string, string | number>) => string }) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogCard, setDialogCard] = useState<CardData | null>(null)

  const openImage = (card: CardData) => {
    setDialogCard(card)
    setDialogOpen(true)
  }

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-border-strong bg-bg-base-opaque shadow-sm">
        <div className="flex items-center justify-between border-b border-border-base p-4 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-fg-muted">#{index + 1}</span>
            <Zap className="h-3.5 w-3.5 text-brand-100" />
            <span className="text-sm font-semibold text-fg-base">{t("pair.listedPair")}</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="rounded bg-tag-cyan-10 px-1.5 py-0.5 text-xs font-mono font-bold text-tag-cyan-100 cursor-default">
                    ${pair.totalCost.toFixed(2)}
                  </span>
                </TooltipTrigger>
                <TooltipContent>{t("pair.totalCostTooltip")}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Badge className="border-0 bg-tag-cyan-10 text-[11px] text-tag-cyan-100">{t("pair.bothListed")}</Badge>
        </div>

        <div className="p-4">
          <div className="flex items-start gap-3">
            <PairSide card={pair.card1} t={t} onImageClick={() => openImage(pair.card1)} />
            <div className="flex shrink-0 flex-col items-center gap-1 pt-12">
              <ArrowRight className="h-5 w-5 text-brand-100" />
              <span className="text-[10px] font-mono font-bold text-fg-muted">+1</span>
            </div>
            <PairSide card={pair.card2} t={t} onImageClick={() => openImage(pair.card2)} />
          </div>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg bg-black/95 border-none p-0 overflow-hidden">
          {dialogCard && (
            <>
              <DialogTitle className="sr-only">{dialogCard.name}</DialogTitle>
              <DialogDescription className="sr-only">{dialogCard.serial}</DialogDescription>
              {dialogCard.imageUrl ? (
                <img
                  src={dialogCard.imageUrl}
                  alt={dialogCard.name}
                  className="w-full object-contain max-h-[80vh]"
                />
              ) : (
                <div className="flex items-center justify-center h-[60vh] text-fg-muted text-sm">
                  {dialogCard.name}
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function PairSide({ card, t, onImageClick }: { card: CardData; t: (key: string, params?: Record<string, string | number>) => string; onImageClick?: () => void }) {
  const isBargain = card.fmv != null && card.fmv > 0 && card.price != null && card.price > 0 && (card.fmv - card.price) > 10

  return (
    <div className="min-w-0 flex-1">
      <div className="mx-auto mb-3 w-full max-w-[140px] relative">
        <CardImage name={card.name} imageUrl={card.imageUrl} onClick={onImageClick} />
        {isBargain && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="absolute top-1 left-1 rounded bg-gradient-to-r from-orange-500 to-red-500 px-1 py-0.5 text-[9px] font-bold text-white shadow-sm">
                  <Flame className="inline h-3 w-3" /> {t("card.bargain")}
                </span>
              </TooltipTrigger>
              <TooltipContent>{t("card.bargainTooltip")}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Hash className="h-3 w-3 shrink-0 text-fg-muted" />
          <span className="font-mono text-xs font-semibold text-brand-100">{card.serial}</span>
        </div>
        <p className="line-clamp-2 text-[11px] leading-tight text-fg-subtle">{card.name}</p>
        {card.grade && (
          <span className="text-[10px] text-fg-muted">{card.grader} {card.grade}</span>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge className="border-0 bg-tag-cyan-10 text-[10px] text-tag-cyan-100">{t("card.listed")}</Badge>
          {card.price != null && card.price > 0 && (
            <span className="text-[10px] font-mono font-semibold text-fg-base">${card.price.toFixed(2)}</span>
          )}
        </div>
        {card.fmv != null && card.fmv > 0 && (
          <div className="text-[10px] text-fg-muted">
            {t("card.fmv")}: <span className="font-mono font-medium">${card.fmv.toFixed(2)}</span>
          </div>
        )}
        {card.tokenId && (
          <a
            href={`https://www.renaiss.xyz/card/${card.tokenId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded bg-brand-100/10 px-2 py-0.5 text-[10px] font-medium text-brand-100 transition-colors hover:bg-brand-100/20"
          >
            <ShoppingCart className="h-3 w-3" />
            {t("card.buy")}
          </a>
        )}
      </div>
    </div>
  )
}

const PAGE_SIZE = 10

export default function ConsecutiveScanner() {
  const { t, locale, setLocale, locales } = useI18n()
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [scanStatus, setScanStatus] = useState<ScanStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchResults = useCallback(async (page: number) => {
    setLoading(true)
    try {
      const res = await fetch(api(`scanner?mode=listed&page=${page}&pageSize=${PAGE_SIZE}`))
      const data = await res.json()
      setScanResult(data)
    } catch {
      setScanResult({ pairs: [], totalPairs: 0, totalCards: 0, error: t("scan.connectFailed") })
    } finally {
      setLoading(false)
    }
  }, [t])

  const goToPage = useCallback((page: number) => {
    setCurrentPage(page)
    fetchResults(page)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }, [fetchResults])

  const pollStatus = useCallback(async (autoFetch = false) => {
    try {
      const res = await fetch(api("scanner/status"))
      const data: ScanStatus = await res.json()
      setScanStatus(data)
      if (data.status?.is_scanning && !pollRef.current) {
        pollRef.current = setInterval(() => pollStatus(), 3000)
      }
      if (!data.status?.is_scanning && pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
      if (autoFetch && data.totalIndexed > 0) {
        fetchResults(1)
      }
    } catch {
      // ignore
    }
  }, [fetchResults])

  useEffect(() => {
    pollStatus(true)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [pollStatus])

  const isScanning = !!scanStatus?.status?.is_scanning
  const hasData = (scanStatus?.totalIndexed || 0) > 0
  const progress = scanStatus?.status?.scan_progress || ""
  const lastScanTime = scanStatus?.status?.last_listing_refresh || scanStatus?.status?.last_full_scan || scanResult?.scannedAt

  const relativeTime = formatRelativeTime(lastScanTime, t)

  const sourceTotal = scanStatus?.status?.last_source_total || 0

  let progressPercent = 0
  const pctMatch = progress.match(/(\d+)%/)
  if (pctMatch) {
    progressPercent = parseInt(pctMatch[1])
  } else {
    const progressMatch = progress.match(/(\d+)\/(\d+)/)
    if (progressMatch) {
      progressPercent = Math.round((parseInt(progressMatch[1]) / parseInt(progressMatch[2])) * 100)
    }
  }

  return (
    <TooltipProvider>
      <div className="mx-auto w-full max-w-5xl px-2 sm:px-0">
        {/* Header */}
        <div className="mb-6 overflow-hidden rounded-3xl border border-border-strong bg-[radial-gradient(circle_at_top_left,_rgba(110,104,255,0.16),_transparent_35%),radial-gradient(circle_at_top_right,_rgba(255,104,99,0.14),_transparent_30%),var(--color-bg-base-opaque)] p-6 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <div className="mb-2 flex items-center gap-2.5">
                <img src="/logo.svg" alt="Renaiss" className="h-8 w-8" />
                <h1 className="text-2xl font-bold text-fg-base">{t("app.title")}</h1>
                <Badge className="border-0 bg-brand-10 text-[10px] text-brand-100">{t("app.badge")}</Badge>
              </div>
              <p className="text-sm leading-6 text-fg-subtle">
                {t("app.description")}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge className="border-0 bg-bg-subtle text-fg-subtle">{t("app.syncFrequency")}</Badge>
                <Badge className="border-0 bg-bg-subtle text-fg-subtle">{t("app.timezone")}</Badge>
              </div>
            </div>

            <div className="grid min-w-[260px] grid-cols-2 gap-3 sm:grid-cols-2 lg:w-[360px] lg:grid-cols-2">
              <div className="rounded-2xl border border-border-strong bg-bg-base-opaque/70 p-4">
                <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wide text-fg-muted">
                  <Clock className="h-3.5 w-3.5" />
                  {relativeTime}
                </div>
                <div className="text-sm font-medium text-fg-base">
                  {(scanStatus?.totalListed || sourceTotal)
                    ? `${(scanStatus?.totalListed || sourceTotal).toLocaleString()} ${t("stats.unit")}`
                    : t("stats.pendingSync")}
                </div>
              </div>

              {/* Language Switcher */}
              <div className="rounded-2xl border border-border-strong bg-bg-base-opaque/70 p-4 flex flex-col items-center justify-center">
                <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-fg-muted mb-1">
                  <Languages className="h-3.5 w-3.5" />
                  {t("lang.label")}
                </div>
                <select
                  value={locale}
                  onChange={(e) => setLocale(e.target.value as Locale)}
                  className="text-xs font-medium text-fg-base bg-bg-base-opaque border border-border-strong rounded-lg px-2 py-1 cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand-100 [&>option]:bg-bg-base-opaque [&>option]:text-fg-base"
                >
                  {locales.map((l) => (
                    <option key={l} value={l}>{localeLabels[l]}</option>
                  ))}
                </select>
              </div>

              <a
                href="https://www.renaiss.xyz/ref/blueskyone"
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center justify-center gap-2 rounded-full border border-purple-500/30 bg-purple-600/10 px-4 py-2 text-sm font-medium text-purple-200 transition-all duration-200 hover:border-purple-400/60 hover:bg-purple-600/20 hover:shadow-[0_0_16px_rgba(168,85,247,0.4)]"
              >
                <img src="/logo.svg" alt="Renaiss" className="h-4 w-4" />
                {t("app.registerRenaiss")}
              </a>
              <a
                href="https://twitter.com/intent/user?screen_name=blueskylh1"
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-2 rounded-full border border-white/10 bg-black/50 px-3 py-1.5 text-sm transition-all duration-200 hover:border-sky-400/40 hover:shadow-[0_0_16px_rgba(56,189,248,0.35)]"
              >
                {/* 作者头像 */}
                <img
                  src="/avatar.jpg"
                  alt="蓝天"
                  className="h-6 w-6 rounded-full object-cover ring-1 ring-white/20"
                />
                {/* 作者名 */}
                <span className="text-sm text-slate-200">蓝天</span>
                {/* X Icon */}
                <X className="h-3.5 w-3.5 text-slate-400 transition-colors duration-200 group-hover:text-sky-400" />
              </a>
            </div>
          </div>
        </div>

        {/* Scanning progress */}
        {isScanning && (
          <div className="mb-6 rounded-2xl border border-brand-30 bg-brand-10 p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2">
              <RefreshCw className="h-4 w-4 animate-spin text-brand-100" />
              <span className="text-sm font-medium text-fg-base">{t("scan.syncing")}</span>
            </div>
            <p className="mb-3 text-xs font-mono text-fg-subtle">{progress}</p>
            {progressPercent > 0 && <Progress value={progressPercent} className="h-2" />}
          </div>
        )}

        <div className="space-y-5">
          {hasData && (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <StatCard
                  value={scanResult?.totalPairs || scanStatus?.status?.consecutive_pairs || "-"}
                  label={t("stats.listedPairs")}
                  accent
                />
                <StatCard
                  value={scanStatus?.totalListed ? scanStatus.totalListed.toLocaleString() : "-"}
                  label={t("stats.marketTotal")}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border-strong bg-bg-base-opaque p-4">
                <div className="flex flex-wrap items-center gap-4 text-xs text-fg-muted">
                  <div className="flex items-center gap-1.5">
                    <Database className="h-3.5 w-3.5" />
                    {t("info.dbListed")} <span className="font-semibold text-fg-base">{scanStatus?.totalListed?.toLocaleString()}</span> {t("stats.unit")}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    {relativeTime}
                  </div>
                </div>
                <Badge className="border-0 bg-tag-cyan-10 text-tag-cyan-100">{t("stats.onlyBothListed")}</Badge>
              </div>
            </>
          )}

          {!hasData && !isScanning && (
            <div className="rounded-2xl border border-border-strong bg-bg-base-opaque p-10 text-center shadow-sm">
              <img src="/logo.svg" alt="Renaiss" className="mx-auto mb-3 h-10 w-10" />
              <p className="mb-2 text-sm text-fg-subtle">{t("scan.cacheNotReady")}</p>
              <p className="text-xs text-fg-muted">{t("scan.cacheNotReadyDesc")}</p>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-5 w-5 animate-spin text-brand-100" />
              <span className="ml-2 text-sm text-fg-subtle">{t("scan.loading")}</span>
            </div>
          )}

          {scanResult && !loading && (
            <>
              {scanResult.error && (
                <div className="rounded-lg border border-border-strong bg-bg-base-opaque p-3 text-sm text-fg-subtle">
                  {scanResult.error}
                </div>
              )}

              {scanResult.pairs.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="flex items-center gap-2 text-sm font-semibold text-fg-base">
                      <Zap className="h-4 w-4 text-brand-100" />
                      {t("pair.found", { count: scanResult.totalPairs })}
                      <Badge className="border-0 bg-tag-cyan-10 text-[10px] text-tag-cyan-100">{t("pair.priceAsc")}</Badge>
                    </h2>
                    {(scanResult.totalPages ?? 1) > 1 && (
                      <span className="text-xs text-fg-muted">
                        {scanResult.page}/{scanResult.totalPages}
                      </span>
                    )}
                  </div>

                  {scanResult.pairs.map((pair, i) => {
                    const globalIndex = ((scanResult.page ?? 1) - 1) * PAGE_SIZE + i
                    return (
                      <PairCard key={`${pair.card1.numericSerial}-${pair.card2.numericSerial}`} pair={pair} index={globalIndex} t={t} />
                    )
                  })}

                  {(scanResult.totalPages ?? 1) > 1 && (
                    <div className="flex items-center justify-center gap-1 pt-4">
                      <button
                        onClick={() => goToPage(1)}
                        disabled={currentPage <= 1}
                        className="rounded-lg border border-border-strong bg-bg-base-opaque p-2 text-fg-subtle transition-colors hover:bg-bg-subtle disabled:cursor-not-allowed disabled:opacity-30"
                        title={t("page.first")}
                      >
                        <ChevronsLeft className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => goToPage(currentPage - 1)}
                        disabled={currentPage <= 1}
                        className="rounded-lg border border-border-strong bg-bg-base-opaque p-2 text-fg-subtle transition-colors hover:bg-bg-subtle disabled:cursor-not-allowed disabled:opacity-30"
                        title={t("page.prev")}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>

                      {(() => {
                        const totalPages = scanResult.totalPages ?? 1
                        const pages: number[] = []
                        const maxVisible = 5
                        let start = Math.max(1, currentPage - Math.floor(maxVisible / 2))
                        let end = Math.min(totalPages, start + maxVisible - 1)
                        if (end - start + 1 < maxVisible) {
                          start = Math.max(1, end - maxVisible + 1)
                        }
                        for (let p = start; p <= end; p++) pages.push(p)
                        return pages.map(p => (
                          <button
                            key={p}
                            onClick={() => goToPage(p)}
                            className={`h-9 min-w-[36px] rounded-lg text-xs font-medium transition-colors ${
                              p === currentPage
                                ? "border border-brand-100 bg-brand-100 text-white"
                                : "border border-border-strong bg-bg-base-opaque text-fg-subtle hover:bg-bg-subtle"
                            }`}
                          >
                            {p}
                          </button>
                        ))
                      })()}

                      <button
                        onClick={() => goToPage(currentPage + 1)}
                        disabled={currentPage >= (scanResult.totalPages ?? 1)}
                        className="rounded-lg border border-border-strong bg-bg-base-opaque p-2 text-fg-subtle transition-colors hover:bg-bg-subtle disabled:cursor-not-allowed disabled:opacity-30"
                        title={t("page.next")}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => goToPage(scanResult.totalPages ?? 1)}
                        disabled={currentPage >= (scanResult.totalPages ?? 1)}
                        className="rounded-lg border border-border-strong bg-bg-base-opaque p-2 text-fg-subtle transition-colors hover:bg-bg-subtle disabled:cursor-not-allowed disabled:opacity-30"
                        title={t("page.last")}
                      >
                        <ChevronsRight className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              ) : scanResult.totalCards > 0 && !scanResult.error ? (
                <div className="rounded-2xl border border-border-strong bg-bg-base-opaque p-8 text-center shadow-sm">
                  <Eye className="mx-auto mb-3 h-8 w-8 text-fg-muted" />
                  <p className="mb-1 text-sm text-fg-subtle">{t("pair.noPairsFound")}</p>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}