'use strict'

/**
 * Cloud function: templateManager
 *
 * Routes by action:
 *   list    {}                        -> [{ id, name, config, created_at }]
 *   create  { name, config }          -> { id }
 *   update  { id, name?, config? }    -> {}
 *   delete  { id }                    -> {}
 */

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { action, user_uuid: userUuid = 'anonymous' } = event
  if (action === 'list') return list(userUuid)
  if (action === 'create') return create(event, userUuid)
  if (action === 'update') return update(event, userUuid)
  if (action === 'delete') return del(event, userUuid)
  return { code: 400, message: `未知 action: ${action}，支持 list / create / update / delete` }
}

async function list(userUuid) {
  try {
    const res = await db.collection('templates').where({ user_uuid: userUuid }).orderBy('created_at', 'desc').get()
    const items = res.data.map(t => ({
      id: t._id,
      name: t.name || '',
      config: t.config || {},
      created_at: t.created_at || '',
    }))
    return { code: 0, data: items }
  } catch (err) {
    return { code: 500, message: String(err) }
  }
}

async function create(event, userUuid) {
  const name = String(event.name || '').trim()
  const config = (event.config && typeof event.config === 'object') ? event.config : {}
  if (!name) return { code: 400, message: 'name 不能为空' }

  try {
    const res = await db.collection('templates').add({
      data: { name, config, user_uuid: userUuid, created_at: new Date().toISOString() },
    })
    return { code: 0, data: { id: res._id } }
  } catch (err) {
    return { code: 500, message: String(err) }
  }
}

async function update(event, userUuid) {
  const id = String(event.id || '').trim()
  if (!id) return { code: 400, message: '缺少模板 id' }

  const updates = {}
  if (event.name) updates.name = String(event.name).trim()
  if (event.config && typeof event.config === 'object') updates.config = event.config
  if (!Object.keys(updates).length) return { code: 400, message: '没有可更新的字段（name / config）' }

  try {
    await db.collection('templates').doc(id).update({ data: updates })
    return { code: 0 }
  } catch (err) {
    return { code: 500, message: String(err) }
  }
}

async function del(event, userUuid) {
  const id = String(event.id || '').trim()
  if (!id) return { code: 400, message: '缺少模板 id' }

  try {
    await db.collection('templates').doc(id).remove()
    return { code: 0 }
  } catch (err) {
    return { code: 500, message: String(err) }
  }
}
