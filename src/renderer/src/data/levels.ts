/**
 * Bảng cấp độ CEFR (từ → A1…C2) sinh bởi `npm run build:packs` từ vocab/_levels, data-sources/_levels
 * và các gói thi. Nạp lười; chưa dựng thì trả về bảng rỗng.
 */
const modules = import.meta.glob<{ default: Record<string, string> }>('./cefr-levels.json')

export async function loadCefrLevels(): Promise<Record<string, string>> {
  const load = Object.values(modules)[0]
  if (!load) return {}
  try {
    return (await load()).default
  } catch {
    return {}
  }
}
