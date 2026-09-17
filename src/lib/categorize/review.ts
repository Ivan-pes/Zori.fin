import { sql } from "@/lib/db";

/** Порог уверенности, ниже которого транзакция попадает в очередь на проверку. */
export const REVIEW_CONFIDENCE_THRESHOLD = 0.6;

export interface ReviewItem {
  id: string;
  description: string | null;
  category: string | null;
  categoryConfidence: number | null;
  categoryMethod: string | null;
  grossCents: number;
  occurredAt: Date;
}

interface Row {
  id: string;
  description: string | null;
  category: string | null;
  category_confidence: string | null;
  category_method: string | null;
  gross_cents: string;
  occurred_at: Date;
}

/**
 * Очередь «Проверьте категорию» (§4.2): траты без категории или с низкой
 * уверенностью ИИ. Один тап пользователя подтверждает/меняет — и через
 * обучение (upsertUserRule) поднимает качество всех сигналов §2.
 */
export async function loadReviewQueue(orgId: string, limit = 50): Promise<ReviewItem[]> {
  const rows = await sql<Row[]>`
    select id, description, category, category_confidence, category_method, gross_cents, occurred_at
    from transactions
    where org_id = ${orgId}
      and direction = 'expense'
      and (category is null or category_confidence < ${REVIEW_CONFIDENCE_THRESHOLD})
    order by gross_cents desc
    limit ${limit}
  `;
  return rows.map((r) => ({
    id: r.id,
    description: r.description,
    category: r.category,
    categoryConfidence: r.category_confidence !== null ? Number(r.category_confidence) : null,
    categoryMethod: r.category_method,
    grossCents: Number(r.gross_cents),
    occurredAt: r.occurred_at,
  }));
}
