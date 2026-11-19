'use strict'

/**
 * Cloud function: generateContent (streaming mode)
 *
 * Called internally by createTask (fire-and-forget), NOT directly from mini-program.
 *
 * Input (event):
 *   taskId       string   DB document ID created by createTask (required)
 *   skeleton     string   Content outline
 *   style        string   Writing style
 *   platforms    string[] Target platforms (uses first element)
 *   audience     string   Target audience
 *   length_pref  string   short / medium / long
 *   ref_material string   Reference material
 *
 * Behaviour:
 *   - Streams tokens from DeepSeek
 *   - Writes partial_content to DB every 50 chars so the mini-program watcher sees live updates
 *   - On completion, writes final content + title_candidates + status=done
 */

const cloud = require('wx-server-sdk')
const { buildSystemPrompt, buildUserPrompt, buildTitlePrompt } = require('./promptEngine')
const { streamChat, chatOnce } = require('./llmClient')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const CHUNK_SIZE = 50

exports.main = async (event) => {
  const {
    taskId,
    skeleton = '',
    style = '',
    platforms = [],
    audience = '',
    length_pref: lengthPref = 'medium',
    ref_material: refMaterial = '',
  } = event

  if (!taskId) return { code: 400, message: 'taskId is required' }

  const platform = Array.isArray(platforms) ? platforms[0] : platforms

  try {
    const systemPrompt = buildSystemPrompt(platform, style, audience, lengthPref)
    const userPrompt   = buildUserPrompt(skeleton, refMaterial)

    let accumulated  = ''
    let lastWriteLen = 0

    for await (const delta of streamChat(systemPrompt, userPrompt)) {
      accumulated += delta
      if (accumulated.length - lastWriteLen >= CHUNK_SIZE) {
        await db.collection('tasks').doc(taskId).update({
          data: { partial_content: accumulated },
        })
        lastWriteLen = accumulated.length
      }
    }

    const { content: titleRaw } = await chatOnce(
      'You are a title writing assistant. Output titles only, one per line, no numbering.',
      buildTitlePrompt(accumulated, platform),
      0.9,
    )
    const titles = titleRaw.trim().split('\n').map(t => t.trim()).filter(Boolean).slice(0, 5)

    await db.collection('tasks').doc(taskId).update({
      data: {
        partial_content: accumulated,
        status: 'done',
        results: [{ platform, content: accumulated, title_candidates: titles }],
      },
    })

    return { code: 0 }

  } catch (err) {
    await db.collection('tasks').doc(taskId)
      .update({ data: { status: 'failed', error_msg: String(err).slice(0, 500) } })
      .catch(() => {})
    return { code: 500, message: String(err) }
  }
}