'use strict'

/**
 * Cloud function: refineContent
 *
 * Input (event):
 *   platform       string  Target platform (required)
 *   selected_text  string  Text to refine (required)
 *   action         string  expand / shorten / polish (required)
 *
 * Returns:
 *   { code: 0, data: { content: '...' } }
 */

const cloud = require('wx-server-sdk')
const { buildRefinePrompt } = require('./promptEngine')
const { chatOnce } = require('./llmClient')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const VALID_ACTIONS = new Set(['expand', 'shorten', 'polish'])

exports.main = async (event) => {
  const {
    platform = '',
    selected_text: selectedText = '',
    action = '',
    polish_instruction: polishInstruction = '',
  } = event

  if (!platform.trim()) return { code: 400, message: 'platform 不能为空' }
  if (!selectedText.trim()) return { code: 400, message: 'selected_text 不能为空' }
  if (!VALID_ACTIONS.has(action)) return { code: 400, message: 'action 仅支持 expand / shorten / polish' }

  try {
    const systemPrompt = '你是专业内容优化助手，直接输出优化后的文本，不做任何解释。'
    const userPrompt = buildRefinePrompt(selectedText, action, platform, polishInstruction)
    const { content } = await chatOnce(systemPrompt, userPrompt, 0.5)
    return { code: 0, data: { content } }
  } catch (err) {
    return { code: 500, message: String(err) }
  }
}
