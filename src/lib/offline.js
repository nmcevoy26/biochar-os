const QUEUE_KEY = 'grip_offline_queue'

export function getQueue() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]')
  } catch {
    return []
  }
}

function saveQueue(queue) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
}

// Per-table identifier used to detect duplicate pending ops in the queue.
// Pre-allocated client-side UUIDs and stable business keys make this safe to
// coalesce — the latest-wins replay matches what would have happened if every
// edit had reached Supabase directly.
function coalesceIdentifier(op) {
  const { table, data, match } = op
  if (table === 'bulk_bags') {
    return data?.id || data?.bulk_bag_id || match?.id || null
  }
  return data?.id || match?.id || null
}

export function enqueue(operation) {
  const queue = getQueue()
  const id = coalesceIdentifier(operation)
  const stamped = { ...operation, timestamp: Date.now() }
  if (id) {
    const idx = queue.findIndex(
      (op) => op.table === operation.table && coalesceIdentifier(op) === id,
    )
    if (idx >= 0) {
      queue[idx] = stamped
      saveQueue(queue)
      return
    }
  }
  queue.push(stamped)
  saveQueue(queue)
}

// Remove any queued ops matching `predicate`. Returns the number of ops dropped.
// Used by the page when a record is deleted locally before its queued op has
// drained — e.g. operator adds a bag offline then immediately removes it.
export function dequeueOps(predicate) {
  const queue = getQueue()
  const remaining = queue.filter((op) => !predicate(op))
  saveQueue(remaining)
  return queue.length - remaining.length
}

export async function flushQueue(supabase) {
  const queue = getQueue()
  if (queue.length === 0) return

  const failed = []
  for (const op of queue) {
    try {
      const { table, type, data, match, onConflict } = op
      let result
      if (type === 'insert') {
        result = await supabase.from(table).insert(data)
      } else if (type === 'update') {
        result = await supabase.from(table).update(data).match(match)
      } else if (type === 'upsert') {
        result = await supabase
          .from(table)
          .upsert(data, onConflict ? { onConflict } : undefined)
      } else if (type === 'delete') {
        result = await supabase.from(table).delete().match(match)
      }
      if (result?.error) {
        failed.push(op)
      }
    } catch {
      failed.push(op)
    }
  }
  saveQueue(failed)
  return failed.length
}
