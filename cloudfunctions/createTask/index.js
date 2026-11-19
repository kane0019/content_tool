'use strict'

/**
 * Cloud function: createTask
 *
 * Mini-program call: wx.cloud.callFunction({ name: 'createTask', data: { ... } })
 *
 * Input (event):
 *   skeleton     string    Content outline (required)
 *   style        string    Writing style (required)
 *   platforms    string[]  Target platforms (required)
 *   audience     string    Target audience (required)
 *   length_pref  string    short / medium / long (optional, default: medium)
 *   ref_material string    Reference material (optional)
 *
 * Returns immediately with task_id.
 * generateContent runs in background and writes partial_content to DB every 50 chars.
 * Mini-program should watch the task document for live updates.
 *
 * Frontend usage:
 *   1. Call createTask → get task_id
 *   2. db.collection('tasks').doc(task_id).watch({ onChange, onError })
 *   3. Render partial_content as it grows; close watcher when status === 'done'
 */

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const {
    skeleton = '',
    style = '',
    platforms = [],
    audience = '',
    length_pref: lengthPref = 'medium',
    ref_material: refMaterial = '',
    user_uuid: userUuid = 'anonymous',
  } = event

  // Validate
  if (!skeleton.trim()) return { code: 400, message: 'skeleton is required' }
  if (!style.trim())    return { code: 400, message: 'style is required' }
  if (!Array.isArray(platforms) || !platforms.length) return { code: 400, message: 'platforms is required' }
  if (!audience.trim()) return { code: 400, message: 'audience is required' }

  // Create task document
  const res = await db.collection('tasks').add({
    data: {
      skeleton: skeleton.trim(),
      style: style.trim(),
      platforms,
      audience: audience.trim(),
      length_pref: lengthPref,
      ref_material: refMaterial.trim(),
      status: 'running',
      partial_content: '',
      results: [],
      user_uuid: userUuid,
      created_at: new Date().toISOString(),
    },
  })
  const taskId = res._id

  // Trigger generateContent asynchronously (fire and forget)
  cloud.callFunction({
    name: 'generateContent',
    data: { taskId, skeleton, style, platforms, audience, length_pref: lengthPref, ref_material: refMaterial, user_uuid: userUuid },
  }).catch(() => {})

  return { code: 0, data: { task_id: taskId } }
}
