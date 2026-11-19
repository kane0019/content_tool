const POLL_INTERVAL = 2000

Page({
  data: {
    taskId: '',
    status: 'running',   // running | done | failed
    partialContent: '',
    content: '',
    contentLength: 0,
    titleCandidates: [],
    platform: '',
    errorMsg: '',

    // Refine
    refineAction: '',     // expand | shorten | polish
    refineResult: '',
    refining: false,
    showRefineSheet: false,

    polishPresets: [
      { label: '去除AI腔',   instruction: '' },
      { label: '更口语化',   instruction: '将文章改得更口语化，像朋友随口说话一样自然，可以有语气词、不完整的句子，甚至主动停顿' },
      { label: '提升节奏感', instruction: '调整句子长短节奏，用极短的句子制造停顿和张力，打破连续的长句，让文章读起来有弹性' },
      { label: '增加细节',   instruction: '在关键论点处补充具体的细节、数字、场景或感受描写，减少「效果很好」「非常重要」这类空洞表述' },
      { label: '情感更真实', instruction: '让情感表达更克制但更真实：不直接说出情绪，用细节和场景让读者自己感受；避免夸张和鼓动' },
      { label: '减少废话',   instruction: '删掉所有没有实际信息量的过渡句、套话和空洞总结，只留有密度的内容，宁可显得跳跃也不要废话' },
      { label: '自定义',     instruction: '__custom__' },
    ],
    selectedPolishMap: { 0: true },
    showCustomPolishInput: false,
    customPolishInstruction: '',
  },

  _pollTimer: null,

  onLoad(options) {
    const taskId = options.taskId || ''
    this.setData({ taskId })
    this._startPoll(taskId)
  },

  onUnload() {
    this._stopPoll()
  },

  // ── Polling ───────────────────────────────────────────────────────────────

  _startPoll(taskId) {
    this._pollTimer = setInterval(() => this._fetchTask(taskId), POLL_INTERVAL)
    this._fetchTask(taskId) // immediate first check
  },

  _stopPoll() {
    if (this._pollTimer) { clearInterval(this._pollTimer); this._pollTimer = null }
  },

  async _fetchTask(taskId) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'taskManager',
        data: { action: 'get', task_id: taskId },
      })
      if (res.result.code !== 0) return
      const task = res.result.data

      this.setData({
        status: task.status,
        partialContent: task.partial_content || '',
      })

      if (task.status === 'done') {
        this._stopPoll()
        const result = task.results?.[0] || {}
        this.setData({
          content: result.content || task.partial_content || '',
          contentLength: (result.content || task.partial_content || '').length,
          titleCandidates: result.title_candidates || [],
          platform: result.platform || '',
        })
      }
      if (task.status === 'failed') {
        this._stopPoll()
        this.setData({ errorMsg: task.error_msg || '生成失败' })
      }
    } catch (e) { /* keep polling */ }
  },

  // ── Copy ─────────────────────────────────────────────────────────────────

  copyContent() {
    wx.setClipboardData({ data: this.data.content,
      success: () => wx.showToast({ title: '已复制', icon: 'success' }) })
  },

  copyTitle(e) {
    const title = this.data.titleCandidates[e.currentTarget.dataset.index]
    wx.setClipboardData({ data: title,
      success: () => wx.showToast({ title: '标题已复制', icon: 'success' }) })
  },

  // ── Refine ────────────────────────────────────────────────────────────────

  openRefineSheet(e) {
    this.setData({ showRefineSheet: true, refineAction: e.currentTarget.dataset.action,
      refineResult: '', selectedPolishMap: { 0: true },
      showCustomPolishInput: false, customPolishInstruction: '' })
  },
  closeRefineSheet() {
    this.setData({ showRefineSheet: false })
  },

  selectPolishPreset(e) {
    const idx = e.currentTarget.dataset.index
    const map = { ...this.data.selectedPolishMap }
    const selected = Object.keys(map).filter(k => map[k])
    if (map[idx] && selected.length <= 1) return   // keep at least one
    map[idx] = !map[idx]
    // show custom input if the custom preset (instruction === '__custom__') is selected
    const showCustom = this.data.polishPresets.some(
      (p, i) => map[i] && p.instruction === '__custom__'
    )
    this.setData({ selectedPolishMap: map, showCustomPolishInput: showCustom })
  },
  onCustomPolishInput(e) {
    this.setData({ customPolishInstruction: e.detail.value })
  },

  async doRefine() {
    const { taskId, content, platform, refineAction,
            polishPresets, selectedPolishMap, customPolishInstruction } = this.data
    if (!content) return

    let polishInstruction = ''
    if (refineAction === 'polish') {
      const instructions = []
      polishPresets.forEach((preset, idx) => {
        if (!selectedPolishMap[idx]) return
        if (preset.instruction === '__custom__') {
          if (customPolishInstruction.trim()) instructions.push(customPolishInstruction.trim())
        } else if (preset.instruction) {
          instructions.push(preset.instruction)
        }
        // empty instruction = '去除AI腔' = use default 10-rule prompt, no text added
      })
      polishInstruction = instructions.join('\n同时，')
    }

    this.setData({ refining: true, refineResult: '' })
    try {
      const res = await wx.cloud.callFunction({
        name: 'refineContent',
        data: { platform, selected_text: content.slice(0, 2000),
                action: refineAction, polish_instruction: polishInstruction },
      })
      if (res.result.code === 0) {
        this.setData({ refineResult: res.result.data.content })
      } else {
        wx.showToast({ title: res.result.message || '优化失败', icon: 'none' })
      }
    } catch (e) {
      wx.showToast({ title: '网络错误', icon: 'none' })
    } finally {
      this.setData({ refining: false })
    }
  },

  applyRefineResult() {
    const content = this.data.refineResult
    this.setData({ content, contentLength: content.length, showRefineSheet: false, refineResult: '' })
  },

  copyRefineResult() {
    wx.setClipboardData({ data: this.data.refineResult,
      success: () => wx.showToast({ title: '已复制', icon: 'success' }) })
  },
})
