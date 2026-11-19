/**
 * Gói luyện thi đóng kèm app: mọi file `*.json` trong thư mục này (sinh bởi `npm run build:packs`).
 * Các file này không commit (xem .gitignore) vì dựng từ tài liệu có bản quyền, chỉ dùng cá nhân.
 * Nạp lười — chỉ đọc khi mở trang "Luyện thi" / bấm cài.
 */
import { isPackFile, summarizePack, type PackFile, type PackSummary } from '@/core/packs'

const modules = import.meta.glob<{ default: unknown }>('./*.json')

export async function loadBundledPacks(): Promise<PackFile[]> {
  const loaded = await Promise.all(Object.values(modules).map((load) => load().then((m) => m.default)))
  return loaded.filter(isPackFile).sort((a, b) => a.name.localeCompare(b.name))
}

export async function bundledPackSummaries(): Promise<PackSummary[]> {
  return (await loadBundledPacks()).map(summarizePack)
}
