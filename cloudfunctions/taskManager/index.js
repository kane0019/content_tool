'use strict'

/**
 * Cloud function: taskManager
 *
 * Routes by action:
 *   list   { page?, page_size? }   -> { total, items[] }
 *   get    { task_id }             -> { ...task, results[] }
 *   delete { task_id }             -> {}
 */

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { action, user_uuid: userUuid = 'anonymous' } = event
  if (action === 'list') return list(event, userUuid)
  if (action === 'get') return get(event, userUuid)
  if (action === 'delete') return del(event, userUuid)
  return { code: 400, message: `未知 action: ${action}，支持 list / get / delete` }
}

async function list(event, userUuid) {
  const page = Math.max(Number(event.page) || 1, 1)
  const pageSize = Math.min(Math.max(Number(event.page_size) || 20, 1), 100)
  const offset = (page - 1) * pageSize

  try {
    const [countRes, tasksRes] = await Promise.all([
      db.collection('tasks').where({ user_uuid: userUuid }).count(),
      db.collection('tasks')
        .where({ user_uuid: userUuid })
        .field({ results: false })
        .orderBy('created_at', 'desc')
        .skip(offset)
        .limit(pageSize)
        .get(),
    ])

    const items = tasksRes.data.map(t => ({
      task_id: t._id,
      skeleton: t.skeleton || '',
      style: t.style || '',
      platforms: t.platforms || [],
      audience: t.audience || '',
      status: t.status || '',
      created_at: t.created_at || '',
    }))

    return { code: 0, data: { total: countRes.total, items } }
  } catch (err) {
    return { code: 500, message: String(err) }
  }
}

async function get(event, userUuid) {
  const taskId = String(event.task_id || '').trim()
  if (!taskId) return { code: 400, message: '缺少 task_id' }

  try {
    const res = await db.collection('tasks').doc(taskId).get()
    if (!res.data) return { code: 404, message: '任务不存在' }
    if (res.data.user_uuid && res.data.user_uuid !== userUuid) return { code: 403, message: '无权访问' }

    const { _id, ...rest } = res.data
    return { code: 0, data: { task_id: _id, ...rest } }
  } catch (err) {
    const msg = String(err)
    if (msg.includes('not exist') || msg.includes('not found')) {
      return { code: 404, message: '任务不存在' }
    }
    return { code: 500, message: msg }
  }
}

async function del(event, userUuid) {
  const taskId = String(event.task_id || '').trim()
  if (!taskId) return { code: 400, message: '缺少 task_id' }

  try {
    const res = await db.collection('tasks').doc(taskId).get()
    if (res.data && res.data.user_uuid && res.data.user_uuid !== userUuid) return { code: 403, message: '无权删除' }
    await db.collection('tasks').doc(taskId).remove()
    return { code: 0 }
  } catch (err) {
    return { code: 500, message: String(err) }
  }
}
