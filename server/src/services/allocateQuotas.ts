/** Split `total` across topics: use explicit positive quotas where set; remaining split evenly among topics with null quota. */
export function allocateQuestionCounts(
  total: number,
  topicIds: string[],
  quotas: Map<string, number | null>
): Map<string, number> {
  const out = new Map<string, number>();
  if (topicIds.length === 0 || total <= 0) return out;

  let fixedSum = 0;
  const flexTopics: string[] = [];

  for (const id of topicIds) {
    const q = quotas.get(id);
    if (q != null && q > 0) {
      out.set(id, q);
      fixedSum += q;
    } else {
      flexTopics.push(id);
    }
  }

  const remaining = total - fixedSum;
  if (flexTopics.length > 0 && remaining >= 0) {
    const per = Math.floor(remaining / flexTopics.length);
    let extra = remaining - per * flexTopics.length;
    for (const id of flexTopics) {
      const add = per + (extra > 0 ? 1 : 0);
      if (extra > 0) extra--;
      out.set(id, (out.get(id) ?? 0) + add);
    }
  }

  if (flexTopics.length === 0 && fixedSum !== total && fixedSum > 0) {
    const scale = total / fixedSum;
    const ids = [...out.keys()];
    let acc = 0;
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const isLast = i === ids.length - 1;
      const v = out.get(id)!;
      const n = isLast ? total - acc : Math.max(1, Math.round(v * scale));
      out.set(id, n);
      acc += n;
    }
  }

  return out;
}

/** Split `total` in proportion to positive weights. Counts sum to `total`. Zero-weight ids get 0. */
export function allocateByWeights(total: number, weights: Map<string, number>): Map<string, number> {
  const ids = [...weights.keys()];
  const out = new Map<string, number>();
  if (ids.length === 0 || total <= 0) return out;
  const sum = ids.reduce((s, id) => s + Math.max(0, weights.get(id) ?? 0), 0);
  if (sum <= 0) return allocateQuestionCounts(total, ids, new Map(ids.map((id) => [id, null])));

  const parts = ids.map((id) => {
    const exact = (Math.max(0, weights.get(id) ?? 0) / sum) * total;
    const base = Math.floor(exact);
    return { id, base, frac: exact - base };
  });
  parts.sort((a, b) => b.frac - a.frac || a.id.localeCompare(b.id));
  let left = total - parts.reduce((s, p) => s + p.base, 0);
  for (const p of parts) {
    const add = left > 0 ? 1 : 0;
    if (left > 0) left -= 1;
    out.set(p.id, p.base + add);
  }
  return out;
}
