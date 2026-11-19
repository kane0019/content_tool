'use strict'

/**
 * Cloud function: testDeepSeek
 *
 * Verifies DeepSeek API connectivity and measures response latency.
 * Requires env vars: DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL
 *
 * Returns:
 *   { code: 0, data: { reply, model, tokens, latency_ms } }
 */

const { OpenAI } = require('openai')

exports.main = async () => {
  const apiKey  = process.env.DEEPSEEK_API_KEY  || ''
  const baseURL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'
  const model   = process.env.DEEPSEEK_MODEL    || 'deepseek-chat'

  if (!apiKey) return { code: 400, message: 'DEEPSEEK_API_KEY env var is not set' }

  const client = new OpenAI({ apiKey, baseURL })
  const start = Date.now()

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: 'Reply with exactly: "DeepSeek API connection OK"' }],
      max_tokens: 20,
      stream: false,
    })

    return {
      code: 0,
      data: {
        reply: response.choices[0].message.content,
        model: response.model,
        tokens: response.usage?.total_tokens ?? 0,
        latency_ms: Date.now() - start,
      },
    }
  } catch (err) {
    return { code: 500, message: String(err) }
  }
}
