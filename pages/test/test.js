// pages/test/test.js  --  Temporary test page, remove before production
const db = wx.cloud.database()

Page({
  data: { log: '', content: '', taskId: '', status: '' },
  _pollTimer: null,

  log(msg) {
    const line = `[${new Date().toLocaleTimeString()}] ${msg}`
    console.log(line)
    this.setData({ log: line + '\n' + this.data.log })
  },

  call(name, data) {
    return wx.cloud.callFunction({ name, data })
      .then(r => r.result)
      .catch(err => { throw new Error(err.errMsg || err.message || JSON.stringify(err)) })
  },

  // 1. DeepSeek connectivity
  async testDeepSeek() {
    this.log('=== [deepseek] connectivity test ===')
    try {
      const res = await this.call('testDeepSeek', {})
      if (res.code === 0) {
        this.log(`OK | reply: ${res.data.reply} | model: ${res.data.model} | tokens: ${res.data.tokens} | ${res.data.latency_ms}ms`)
      } else {
        this.log('FAIL: ' + res.message)
      }
    } catch (e) { this.log('ERROR: ' + e.message) }
  },

  // 2. Full generation flow: createTask -> poll
  async testGenerate() {
    if (this._pollTimer) { clearInterval(this._pollTimer); this._pollTimer = null }
    this.setData({ content: '', taskId: '', status: 'creating...' })
    this.log('=== [generate] createTask + poll ===')
    try {
      const res = await this.call('createTask', {
        skeleton: '1. AI trends\n2. Milestones\n3. Outlook',
        style: '干货科普',
        platforms: ['wechat_mp'],
        audience: 'tech enthusiasts',
        length_pref: 'short',
      })
      if (res.code !== 0) { this.log('createTask failed: ' + res.message); return }

      const taskId = res.data.task_id
      this.setData({ taskId, status: 'polling...' })
      this.log('task_id: ' + taskId)

      this._pollTimer = setInterval(async () => {
        try {
          const r = await this.call('taskManager', { action: 'get', task_id: taskId })
          if (r.code !== 0) return
          const t = r.data
          const len = (t.partial_content || '').length
          this.setData({ content: t.partial_content || '', status: t.status })
          this.log(`[poll] ${t.status} | ${len} chars`)
          if (t.status === 'done') {
            clearInterval(this._pollTimer); this._pollTimer = null
            this.log('titles: ' + JSON.stringify(t.results?.[0]?.title_candidates))
          }
          if (t.status === 'failed') {
            clearInterval(this._pollTimer); this._pollTimer = null
            this.log('failed: ' + t.error_msg)
          }
        } catch (e) { this.log('poll error: ' + e.message) }
      }, 2000)
    } catch (e) { this.log('ERROR: ' + e.message) }
  },

  // 3. Refine last generated content
  async testRefine() {
    if (!this.data.taskId) { this.log('run [generate] first'); return }
    this.log('=== [refine] expand ===')
    try {
      const res = await this.call('refineContent', {
        platform: 'wechat_mp',
        selected_text: this.data.content.slice(0, 120) || 'AI is transforming industries.',
        action: 'expand',
      })
      this.log(res.code === 0 ? 'result: ' + res.data.content.slice(0, 120) : 'failed: ' + res.message)
    } catch (e) { this.log('ERROR: ' + e.message) }
  },

  // 4. List recent tasks
  async testListTasks() {
    this.log('=== [tasks] list ===')
    try {
      const res = await this.call('taskManager', { action: 'list', page: 1, page_size: 5 })
      this.log(`total: ${res.data?.total} | recent: ` +
        JSON.stringify(res.data?.items?.map(t => ({ id: t.task_id.slice(-6), status: t.status }))))
    } catch (e) { this.log('ERROR: ' + e.message) }
  },

  // 5. Template CRUD
  async testTemplates() {
    this.log('=== [templates] create -> list -> delete ===')
    try {
      const created = await this.call('templateManager', {
        action: 'create', name: 'Test',
        config: { style: '干货科普', platforms: ['wechat_mp'], audience: 'devs', length_pref: 'medium' },
      })
      this.log('created id: ' + created.data?.id)
      const list = await this.call('templateManager', { action: 'list' })
      this.log('count: ' + list.data?.length)
      if (created.data?.id) {
        await this.call('templateManager', { action: 'delete', id: created.data.id })
        this.log('deleted')
      }
    } catch (e) { this.log('ERROR: ' + e.message) }
  },

  clearLog() { this.setData({ log: '', content: '', status: '', taskId: '' }) },
  onUnload() { if (this._pollTimer) clearInterval(this._pollTimer) },
})