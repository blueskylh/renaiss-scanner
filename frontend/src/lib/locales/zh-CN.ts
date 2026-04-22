export default {
  // Header
  "app.title": "Renaiss 在售连号工具",
  "app.badge": "Marketplace Cache",
  "app.description": "自动同步 Renaiss Marketplace 的在售数据，只展示当前可买的连号组合。",
  "app.syncFrequency": "同步频率：每 10 分钟",
  "app.timezone": "时区：UTC",
  "app.registerRenaiss": "注册 Renaiss",
  "app.followX": "关注 X",
  "app.tutorial": "使用教程",

  // Stats
  "stats.listedPairs": "在售连号对",
  "stats.marketTotal": "市场在售总量",
  "stats.unit": "张",
  "stats.pendingSync": "待同步",
  "stats.onlyBothListed": "仅展示双卡均在售",

  // Info bar
  "info.dbListed": "当前数据库在售",
  "info.updatedAgo": "{minutes} 分钟前更新",
  "info.justUpdated": "刚刚更新",
  "info.updatedHoursAgo": "{hours} 小时前更新",

  // Scanning
  "scan.syncing": "正在同步在售市场数据",
  "scan.loading": "加载中...",
  "scan.waitingFirst": "等待首次同步",
  "scan.cacheNotReady": "在售缓存尚未就绪",
  "scan.cacheNotReadyDesc": "定时任务会每 10 分钟自动抓取一次 marketplace 在售数据。首次同步完成后页面会自动显示在售连号。",
  "scan.connectFailed": "连接失败",

  // Pairs
  "pair.listedPair": "在售连号",
  "pair.bothListed": "双卡在售",
  "pair.found": "发现 {count} 个可购连号对",
  "pair.priceAsc": "价格升序",
  "pair.totalCostTooltip": "两张卡牌的挂单价总和",
  "pair.noPairsFound": "当前没有找到双卡均在售的连号对",
  "pair.consecutive": "连号 +1",

  // Card
  "card.listed": "在售",
  "card.bargain": "捡漏",
  "card.bargainTooltip": "挂单价低于 FMV 超过 $10",
  "card.buy": "购买",
  "card.fmv": "FMV",
  "card.price": "挂单价",

  // Pagination
  "page.first": "第一页",
  "page.prev": "上一页",
  "page.next": "下一页",
  "page.last": "最后一页",

  // Language
  "lang.label": "语言",
} as const
