'use strict'

const OpenAI = require('openai')

let _client = null

function getClient() {
  if (!_client) {
    _client = new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY || '',
      baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    })
  }
  return _client
}

/**
 * Call DeepSeek-V4-Pro with thinking mode enabled.
 * Returns { content, tokens } once fully complete.
 * Note: temperature is ignored in thinking mode.
 */
async function chatOnce(systemPrompt, userPrompt) {
  const client = getClient()
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-v4-pro'
  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt },
    ],
    reasoning_effort: 'high',
    thinking: { type: 'enabled' },
    stream: false,
  })
  const content = response.choices[0].message.content || ''
  const tokens = response.usage ? response.usage.total_tokens : 0
  return { content, tokens }
}

/**
 * Stream content tokens from DeepSeek-V4-Pro (thinking mode).
 * Skips reasoning_content deltas; only yields final content deltas.
 * Usage: for await (const delta of streamChat(...)) { ... }
 */
async function* streamChat(systemPrompt, userPrompt) {
  const client = getClient()
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-v4-pro'
  const stream = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt },
    ],
    reasoning_effort: 'high',
    thinking: { type: 'enabled' },
    stream: true,
  })
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content
    if (delta) yield delta
    // delta.reasoning_content (thinking tokens) are automatically skipped
  }
}

module.exports = { chatOnce, streamChat }
