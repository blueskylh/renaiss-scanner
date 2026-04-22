import { useState, useCallback, useEffect, useRef } from "react"
import { api } from "@/lib/api"
import { useI18n, localeLabels, type Locale } from "@/lib/i18n"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
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
  X, BookOpen, Sparkles,
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

function CardImage({ name, imageUrl, onClick, hasGlow }: { name: string; imageUrl?: string | null; onClick?: () => void; hasGlow?: boolean }) {
  const [error, setError] = useState(false)
  const url = imageUrl || null

  if (!url || error) {
    return (
      <div className="w-full aspect-[2/3] rounded-xl bg-bg-subtle flex items-center justify-center cursor-pointer border border-white/5" onClick={onClick}>
        <span className="text-fg-muted text-xs text-center px-2">{name.slice(0, 30)}</span>
      </div>
    )
  }

  return (
    <img
      src={url}
      alt={name}
      className={`w-full aspect-[2/3] object-cover rounded-xl shadow-sm cursor-pointer transition-all duration-300 ${hasGlow ? 'nft-glow' : ''} hover:scale-[1.02]`}
      onError={() => setError(true)}
      loading="lazy"
      onClick={onClick}
    />
  )
}

function StatCard({ value, label, accent }: { value: string | number; label: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl glass p-5 text-center relative overflow-hidden group">
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 via-transparent to-pink-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      <div className={`relative text-2xl font-bold mono-data ${accent ? "gradient-text" : "text-fg-base"}`}>{value}</div>
      <div className="mt-2 text-[11px] uppercase tracking-wider text-fg-muted font-medium">{label}</div>
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
      <div className="overflow-hidden rounded-2xl glass card-glow relative group">
        {/* Top accent line */}
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-purple-500/30 to-transparent" />

        <div className="flex items-center justify-between p-4 pb-3">
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-fg-muted opacity-60">#{index + 1}</span>
            <Zap className="h-4 w-4 text-accent-purple" />
            <span className="text-sm font-semibold text-fg-base">{t("pair.listedPair")}</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="rounded-lg px-2 py-1 text-xs font-mono font-bold price-glow text-emerald-400 mono-data">
                    ${pair.totalCost.toFixed(2)}
                  </span>
                </TooltipTrigger>
                <TooltipContent className="glass">{t("pair.totalCostTooltip")}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* Secondary badge */}
          <div className="rounded-full px-3 py-1 bg-fuchsia-900/30 text-fuchsia-400 border border-fuchsia-500/20 text-[10px] font-semibold">
            {t("pair.bothListed")}
          </div>
        </div>

        <div className="p-4">
          <div className="flex items-start gap-4">
            <PairSide card={pair.card1} t={t} onImageClick={() => openImage(pair.card1)} hasGlow />
            <div className="flex shrink-0 flex-col items-center justify-center pt-12">
              {/* Consecutive Badge - Clean design with gradient border */}
              <div className="relative px-2 py-1">
                {/* Gradient border effect */}
                <div className="absolute inset-0 rounded-full bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500 p-[1px]">
                  <div className="absolute inset-0 rounded-full bg-neutral-900/90" />
                </div>
                {/* Inner content */}
                <div className="relative px-3 py-1 flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3 text-purple-400" />
                  <span className="text-[11px] font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-orange-400 bg-clip-text text-transparent uppercase tracking-wider">
                    {t("pair.consecutive")}
                  </span>
                </div>
              </div>
            </div>
            <PairSide card={pair.card2} t={t} onImageClick={() => openImage(pair.card2)} hasGlow />
          </div>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg bg-black/95 border border-white/10 p-0 overflow-hidden backdrop-blur-xl">
          {dialogCard && (
            <>
              <DialogTitle className="sr-only">{dialogCard.name}</DialogTitle>
              <DialogDescription className="sr-only">{dialogCard.serial}</DialogDescription>
              {dialogCard.imageUrl ? (
                <div className="relative">
                  <img
                    src={dialogCard.imageUrl}
                    alt={dialogCard.name}
                    className="w-full object-contain max-h-[80vh]"
                  />
                  {/* Glow effect on full image */}
                  <div className="absolute inset-0 shadow-[inset_0_0_60px_rgba(168,85,247,0.2)] pointer-events-none" />
                </div>
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

function PairSide({ card, t, onImageClick, hasGlow }: { card: CardData; t: (key: string, params?: Record<string, string | number>) => string; onImageClick?: () => void; hasGlow?: boolean }) {
  const isBargain = card.fmv != null && card.fmv > 0 && card.price != null && card.price > 0 && (card.fmv - card.price) > 10

  return (
    <div className="min-w-0 flex-1">
      <div className="mx-auto mb-3 w-full max-w-[140px] relative">
        <CardImage name={card.name} imageUrl={card.imageUrl} onClick={onImageClick} hasGlow={hasGlow} />
        {isBargain && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="absolute top-1 left-1 rounded-lg bg-gradient-to-r from-orange-500 via-pink-500 to-red-500 px-1.5 py-0.5 text-[9px] font-bold text-white shadow-lg flex items-center gap-1 animate-pulse">
                  <Flame className="h-3 w-3" />
                  <span className="bg-clip-text">{t("card.bargain")}</span>
                </span>
              </TooltipTrigger>
              <TooltipContent className="glass">{t("card.bargainTooltip")}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      <div className="space-y-2">
        {/* Serial Number - Monospace style */}
        <div className="flex items-center gap-2">
          <Hash className="h-3.5 w-3.5 shrink-0 text-accent-cyan" />
          <span className="font-mono text-sm font-semibold text-accent-cyan mono-data">{card.serial}</span>
        </div>

        <p className="line-clamp-2 text-[11px] leading-tight text-fg-subtle">{card.name}</p>

        {card.grade && (
          <span className="text-[10px] text-fg-muted mono-data">{card.grader} {card.grade}</span>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {/* Listed badge */}
          <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold glass text-accent-emerald text-xs">
            {t("card.listed")}
          </span>

          {/* Price - High contrast */}
          {card.price != null && card.price > 0 && (
            <span className="rounded-lg px-2 py-0.5 text-[11px] font-bold price-glow text-emerald-400 mono-data">
              ${card.price.toFixed(2)}
            </span>
          )}
        </div>

        {/* FMV */}
        {card.fmv != null && card.fmv > 0 && (
          <div className="text-[10px] text-fg-muted">
            <span className="text-fg-subtle">{t("card.fmv")}:</span>{" "}
            <span className="font-mono font-medium text-accent-cyan mono-data">${card.fmv.toFixed(2)}</span>
          </div>
        )}

        {/* Buy button */}
        {card.tokenId && (
          <a
            href={`https://www.renaiss.xyz/card/${card.tokenId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-[10px] font-medium text-purple-300 transition-all duration-200 hover:bg-purple-500/20 hover:border-purple-400/50 hover:shadow-[0_0_12px_rgba(168,85,247,0.3)] group"
          >
            <ShoppingCart className="h-3 w-3 transition-transform group-hover:scale-110" />
            {t("card.buy")}
          </a>
        )}
      </div>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-2xl glass p-4">
          <div className="flex items-center justify-between mb-4">
            <Skeleton className="h-4 w-32 skeleton-shimmer rounded-lg" />
            <Skeleton className="h-5 w-20 skeleton-shimmer rounded-full" />
          </div>
          <div className="flex gap-4">
            <Skeleton className="h-[200px] w-[100px] skeleton-shimmer rounded-xl" />
            <div className="flex items-center justify-center">
              <Skeleton className="h-6 w-6 skeleton-shimmer rounded-full" />
            </div>
            <Skeleton className="h-[200px] w-[100px] skeleton-shimmer rounded-xl" />
          </div>
        </div>
      ))}
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
        {/* Header - Glass Morphism */}
        <div className="mb-8 overflow-hidden rounded-3xl glass p-6 relative">
          {/* Gradient background overlay */}
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-transparent to-pink-500/10 pointer-events-none" />
          {/* Top accent */}
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-purple-500/50 via-pink-500/30 to-orange-500/50" />

          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <div className="mb-3 flex items-center gap-3">
                <img src="/logo.svg" alt="Renaiss" className="h-9 w-9" />
                <h1 className="text-2xl font-bold gradient-text">{t("app.title")}</h1>
                {/* Web3 style badge */}
                <div className="consecutive-badge rounded-full px-2.5 py-1">
                  <span className="text-[10px] font-bold bg-gradient-to-r from-purple-300 via-pink-300 to-orange-300 bg-clip-text text-transparent">
                    {t("app.badge")}
                  </span>
                </div>
              </div>
              <p className="text-sm leading-6 text-fg-subtle">
                {t("app.description")}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full glass px-3 py-1 text-[11px] text-fg-muted">{t("app.syncFrequency")}</span>
                <span className="rounded-full glass px-3 py-1 text-[11px] text-fg-muted">{t("app.timezone")}</span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="grid min-w-[260px] grid-cols-3 gap-3 lg:w-[540px] lg:grid-cols-3">
              {/* Time info */}
              <div className="rounded-xl glass p-4 relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-br from-accent-cyan/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative">
                  <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wider text-fg-muted">
                    <Clock className="h-3.5 w-3.5 text-accent-cyan" />
                    {relativeTime}
                  </div>
                  <div className="text-sm font-semibold text-fg-base mono-data">
                    {(scanStatus?.totalListed || sourceTotal)
                      ? `${(scanStatus?.totalListed || sourceTotal).toLocaleString()} ${t("stats.unit")}`
                      : t("stats.pendingSync")}
                  </div>
                </div>
              </div>

              {/* Language Switcher */}
              <div className="rounded-xl glass p-4 flex flex-col items-center justify-center relative overflow-visible group">
                <div className="absolute inset-0 bg-gradient-to-br from-accent-purple/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative flex items-center gap-1.5 text-xs uppercase tracking-wider text-fg-muted mb-2">
                  <Languages className="h-3.5 w-3.5 text-accent-purple" />
                  {t("lang.label")}
                </div>
                <select
                  value={locale}
                  onChange={(e) => setLocale(e.target.value as Locale)}
                  className="relative z-10 text-xs font-medium text-fg-base bg-neutral-900/80 border border-white/20 rounded-lg px-3 py-1.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent-purple/50 focus:border-accent-purple/50 hover:border-white/30 transition-colors [&>option]:bg-neutral-900 [&>option]:text-fg-base min-w-[80px] text-center"
                  style={{ WebkitAppearance: "menulist" }}
                >
                  {locales.map((l) => (
                    <option key={l} value={l}>{localeLabels[l]}</option>
                  ))}
                </select>
              </div>

              {/* Register Renaiss */}
              <a
                href="https://www.renaiss.xyz/ref/blueskyone"
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center justify-center gap-2 rounded-xl border border-purple-500/30 bg-purple-500/10 px-4 py-3 text-sm font-medium text-purple-300 transition-all duration-300 hover:bg-purple-500/20 hover:border-purple-400/50 hover:shadow-[0_0_20px_rgba(168,85,247,0.25)]"
              >
                <img src="/logo.svg" alt="Renaiss" className="h-4 w-4" />
                <span>{t("app.registerRenaiss")}</span>
              </a>

              {/* Tutorial */}
              <a
                href="https://x.com/blueskylh1/status/2046864072818512013"
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center justify-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-3 text-sm font-medium text-cyan-300 transition-all duration-300 hover:bg-cyan-500/20 hover:border-cyan-400/50 hover:shadow-[0_0_20px_rgba(34,211,238,0.25)]"
              >
                <BookOpen className="h-4 w-4" />
                <span>{t("app.tutorial")}</span>
              </a>

              {/* Follow Author */}
              <a
                href="https://twitter.com/intent/user?screen_name=blueskylh1"
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-2 rounded-xl border border-white/10 glass px-3 py-2 text-sm transition-all duration-300 hover:border-sky-400/40 hover:shadow-[0_0_16px_rgba(56,189,248,0.2)]"
              >
                <img
                  src="/avatar.jpg"
                  alt="蓝天"
                  className="h-6 w-6 rounded-full object-cover ring-1 ring-white/20"
                />
                <span className="text-sm text-slate-200">蓝天</span>
                <X className="h-3.5 w-3.5 text-slate-400 transition-colors group-hover:text-sky-400" />
              </a>
            </div>
          </div>
        </div>

        {/* Scanning progress */}
        {isScanning && (
          <div className="mb-6 rounded-2xl glass p-5 relative overflow-hidden">
            {/* Glow effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 via-pink-500/5 to-transparent" />
            <div className="relative">
              <div className="mb-2 flex items-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin text-accent-purple" />
                <span className="text-sm font-medium text-fg-base">{t("scan.syncing")}</span>
              </div>
              <p className="mb-3 text-xs font-mono text-fg-muted mono-data">{progress}</p>
              {progressPercent > 0 && (
                <div className="relative">
                  <Progress value={progressPercent} className="h-2 rounded-full bg-white/5" />
                  {/* Progress bar glow effect */}
                  <div className="absolute inset-0 h-2 rounded-full progress-glow pointer-events-none" />
                </div>
              )}
            </div>
          </div>
        )}

        <div className="space-y-5">
          {hasData && (
            <>
              {/* Stats Cards */}
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

              {/* Info bar */}
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl glass p-4 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-accent-cyan/5 to-transparent" />
                <div className="relative flex flex-wrap items-center gap-5 text-xs text-fg-muted">
                  <div className="flex items-center gap-2">
                    <Database className="h-3.5 w-3.5 text-accent-purple" />
                    {t("info.dbListed")} <span className="font-semibold text-fg-base mono-data">{scanStatus?.totalListed?.toLocaleString()}</span> {t("stats.unit")}
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-accent-cyan" />
                    {relativeTime}
                  </div>
                </div>
                {/* Secondary badge */}
                <div className="rounded-full px-3 py-1 bg-fuchsia-900/30 text-fuchsia-400 border border-fuchsia-500/20 text-[10px] font-semibold">
                  {t("stats.onlyBothListed")}
                </div>
              </div>
            </>
          )}

          {/* Empty state */}
          {!hasData && !isScanning && (
            <div className="rounded-2xl glass p-12 text-center relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 via-transparent to-pink-500/5" />
              <div className="relative">
                <div className="mb-4 relative inline-block">
                  <Sparkles className="h-12 w-12 text-fg-muted mx-auto" />
                  <div className="absolute inset-0 blur-xl bg-accent-purple/10 -z-10" />
                </div>
                <p className="mb-2 text-sm text-fg-subtle">{t("scan.cacheNotReady")}</p>
                <p className="text-xs text-fg-muted">{t("scan.cacheNotReadyDesc")}</p>
              </div>
            </div>
          )}

          {/* Loading state */}
          {loading && <LoadingSkeleton />}

          {/* Results */}
          {scanResult && !loading && (
            <>
              {scanResult.error && (
                <div className="rounded-xl glass p-4 text-sm text-fg-subtle">
                  {scanResult.error}
                </div>
              )}

              {scanResult.pairs.length > 0 ? (
                <div className="space-y-4">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <Zap className="h-5 w-5 text-accent-purple" />
                        <div className="absolute inset-0 blur-sm bg-accent-purple/30 -z-10" />
                      </div>
                      <h2 className="text-sm font-semibold text-fg-base">
                        {t("pair.found", { count: scanResult.totalPairs })}
                      </h2>
                      {/* Price ascending badge */}
                      <span className="rounded-full px-2 py-0.5 bg-emerald-900/30 text-emerald-400 border border-emerald-500/20 text-[10px] font-semibold">
                        {t("pair.priceAsc")}
                      </span>
                    </div>
                    {(scanResult.totalPages ?? 1) > 1 && (
                      <span className="text-xs mono-data text-fg-muted">
                        {scanResult.page}/{scanResult.totalPages}
                      </span>
                    )}
                  </div>

                  {/* Pair cards */}
                  {scanResult.pairs.map((pair, i) => {
                    const globalIndex = ((scanResult.page ?? 1) - 1) * PAGE_SIZE + i
                    return (
                      <PairCard key={`${pair.card1.numericSerial}-${pair.card2.numericSerial}`} pair={pair} index={globalIndex} t={t} />
                    )
                  })}

                  {/* Pagination */}
                  {(scanResult.totalPages ?? 1) > 1 && (
                    <div className="flex items-center justify-center gap-1 pt-4">
                      <button
                        onClick={() => goToPage(1)}
                        disabled={currentPage <= 1}
                        className="rounded-xl border border-white/10 glass p-2.5 text-fg-subtle transition-all hover:border-accent-purple/30 hover:bg-purple-500/10 disabled:cursor-not-allowed disabled:opacity-30"
                        title={t("page.first")}
                      >
                        <ChevronsLeft className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => goToPage(currentPage - 1)}
                        disabled={currentPage <= 1}
                        className="rounded-xl border border-white/10 glass p-2.5 text-fg-subtle transition-all hover:border-accent-purple/30 hover:bg-purple-500/10 disabled:cursor-not-allowed disabled:opacity-30"
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
                            className={`h-10 min-w-[40px] rounded-xl text-xs font-semibold transition-all ${
                              p === currentPage
                                ? "border border-accent-purple/50 bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-fg-base shadow-[0_0_12px_rgba(168,85,247,0.2)]"
                                : "border border-white/10 glass text-fg-subtle hover:border-accent-purple/30 hover:bg-purple-500/10"
                            }`}
                          >
                            {p}
                          </button>
                        ))
                      })()}

                      <button
                        onClick={() => goToPage(currentPage + 1)}
                        disabled={currentPage >= (scanResult.totalPages ?? 1)}
                        className="rounded-xl border border-white/10 glass p-2.5 text-fg-subtle transition-all hover:border-accent-purple/30 hover:bg-purple-500/10 disabled:cursor-not-allowed disabled:opacity-30"
                        title={t("page.next")}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => goToPage(scanResult.totalPages ?? 1)}
                        disabled={currentPage >= (scanResult.totalPages ?? 1)}
                        className="rounded-xl border border-white/10 glass p-2.5 text-fg-subtle transition-all hover:border-accent-purple/30 hover:bg-purple-500/10 disabled:cursor-not-allowed disabled:opacity-30"
                        title={t("page.last")}
                      >
                        <ChevronsRight className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              ) : scanResult.totalCards > 0 && !scanResult.error ? (
                <div className="rounded-2xl glass p-10 text-center relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-accent-cyan/5 to-transparent" />
                  <div className="relative">
                    <Eye className="h-10 w-10 text-fg-muted mx-auto mb-3" />
                    <p className="text-sm text-fg-subtle">{t("pair.noPairsFound")}</p>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}
