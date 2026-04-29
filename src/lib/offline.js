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

export function enqueue(operation) {
  const queue = getQueue()
  queue.push({ ...operation, timestamp: Date.now() })
  saveQueue(queue)
}

export async function flushQueue(supabase) {
  const queue = getQueue()
  if (queue.length === 0) return

  const failed = []
  for (const op of queue) {
    try {
      const { table, type, data, match } = op
      let result
      if (type === 'insert') {
        result = await supabase.from(table).insert(data)
      } else if (type === 'update') {
        result = await supabase.from(table).update(data).match(match)
      } else if (type === 'upsert') {
        result = await supabase.from(table).upsert(data)
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
