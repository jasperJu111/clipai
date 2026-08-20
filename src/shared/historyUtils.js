export const DEFAULT_MAX_HISTORY = 200

export function getMaxHistoryLimit(rawVal) {
  const raw = Number(rawVal ?? DEFAULT_MAX_HISTORY)
  if (Number.isFinite(raw) && raw >= 10 && raw <= 2000) {
    return Math.floor(raw)
  }
  return DEFAULT_MAX_HISTORY
}

export function persistHistoryList(list, maxHistoryLimit = DEFAULT_MAX_HISTORY) {
  if (!Array.isArray(list)) return []
  const maxLimit = getMaxHistoryLimit(maxHistoryLimit)
  const favs = list.filter(i => i && i.favorite)
  const nonFavs = list.filter(i => i && !i.favorite).slice(0, maxLimit)
  const allowedIds = new Set([...favs.map(i => i.id), ...nonFavs.map(i => i.id)])
  return list.filter(i => i && allowedIds.has(i.id))
}
