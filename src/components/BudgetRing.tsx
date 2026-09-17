import type { BudgetPace } from "@/lib/metrics/budgets";

/**
 * Цвет кольца.
 * Обычный конверт: изумруд (в норме) → жёлтый (у лимита) → красный (перерасход).
 * Конверт-ЦЕЛЬ (накопления): чем ближе к 100%, тем насыщеннее зелёный; на 100%+
 * — полный бренд-зелёный. Красного нет: достичь цели накоплений — это хорошо.
 */
function ringColor(pct: number, pace: BudgetPace, goal: boolean): string {
  if (goal) {
    if (pct >= 100) return "var(--accent-ink)";
    const p = Math.min(100, Math.max(0, pct)) / 100;
    const sat = Math.round(24 + 56 * p); // 24% → 80%
    const light = Math.round(66 - 20 * p); // 66% → 46%
    return `hsl(152 ${sat}% ${light}%)`;
  }
  return pace === "over" ? "var(--danger)" : pct > 92 ? "var(--warn)" : "var(--accent)";
}

/**
 * Кольцо прогресса бюджета. Цвет и значок дублируют смысл не только цветом (WCAG):
 * у конверта-цели на 100% в центре — «✓».
 */
export function BudgetRing({ pct, pace, size = 72, goal = false }: { pct: number; pace: BudgetPace; size?: number; goal?: boolean }) {
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, pct));
  const dash = (clamped / 100) * c;
  const color = ringColor(pct, pace, goal);
  const done = goal && pct >= 100;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)", flex: "none" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c}`}
      />
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="central"
        transform={`rotate(90 ${size / 2} ${size / 2})`}
        fontSize={done ? size * 0.34 : size * 0.24}
        fontWeight={600}
        fill={done ? "var(--accent-ink)" : "var(--ink)"}
      >
        {done ? "✓" : `${clamped}%`}
      </text>
    </svg>
  );
}
