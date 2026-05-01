/** Split `total` across topics: use explicit positive quotas where set; remaining split evenly among topics with null quota. */
export function allocateQuestionCounts(total, topicIds, quotas) {
    const out = new Map();
    if (topicIds.length === 0 || total <= 0)
        return out;
    let fixedSum = 0;
    const flexTopics = [];
    for (const id of topicIds) {
        const q = quotas.get(id);
        if (q != null && q > 0) {
            out.set(id, q);
            fixedSum += q;
        }
        else {
            flexTopics.push(id);
        }
    }
    const remaining = total - fixedSum;
    if (flexTopics.length > 0 && remaining >= 0) {
        const per = Math.floor(remaining / flexTopics.length);
        let extra = remaining - per * flexTopics.length;
        for (const id of flexTopics) {
            const add = per + (extra > 0 ? 1 : 0);
            if (extra > 0)
                extra--;
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
            const v = out.get(id);
            const n = isLast ? total - acc : Math.max(1, Math.round(v * scale));
            out.set(id, n);
            acc += n;
        }
    }
    return out;
}
