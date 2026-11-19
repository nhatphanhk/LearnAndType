import { describe, expect, it } from 'vitest'
import { fallSpeed, matchFalling, pickLane, spawnInterval, stepFalling, wordPoints, type FallingItem } from './game'

const item = (key: number, answer: string, y: number, x = 0.5): FallingItem => ({ key, wordId: `w${key}`, answer, y, x, spawnedAt: 0 })

describe('game', () => {
  it('điểm có thưởng combo (giới hạn) và từ dài', () => {
    expect(wordPoints(0, 3)).toBe(10)
    expect(wordPoints(3, 5)).toBe(16)
    expect(wordPoints(50, 8)).toBe(33)
  })

  it('tốc độ tăng, khoảng thả giảm và có giới hạn', () => {
    expect(fallSpeed(60_000)).toBeGreaterThan(fallSpeed(0))
    expect(fallSpeed(10_000_000)).toBe(0.2)
    expect(spawnInterval(0)).toBe(3200)
    expect(spawnInterval(10_000_000)).toBe(1100)
  })

  it('khớp từ thấp nhất, không phân biệt hoa thường', () => {
    const items = [item(1, 'cat', 0.2), item(2, 'dog', 0.5), item(3, 'cat', 0.7)]
    expect(matchFalling(items, 'CAT')).toBe(2)
    expect(matchFalling(items, 'cow')).toBe(-1)
  })

  it('từ chạm đáy bị tính trượt', () => {
    const { alive, missed } = stepFalling([item(1, 'a', 0.1), item(2, 'b', 0.99)], 1000, 0)
    expect(alive.map((i) => i.key)).toEqual([1])
    expect(missed.map((i) => i.key)).toEqual([2])
    expect(alive[0].y).toBeCloseTo(0.16)
  })

  it('chọn làn trống', () => {
    const busy = [0.1, 0.3, 0.5, 0.7].map((x, i) => item(i, 'x', 0.1, x))
    expect(pickLane(busy, () => 0)).toBe(0.9)
  })
})
