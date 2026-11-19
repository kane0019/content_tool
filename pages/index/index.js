Page({
  data: {
    skeleton: '',
    styleIndex: 3,
    customStyle: '',
    showCustomStyle: false,
    styleOptions: ['网文男频', '网文女频', '儿童类', '故事类', '情感类', '社科类', '节日祝语', '诗歌', '自定义'],

    platforms: ['wechat_mp'],
    platformMap: { wechat_mp: true, xiaohongshu: false, weibo: false, douyin_script: false, zhihu: false },
    platformOptions: [
      { label: '微信公众号', value: 'wechat_mp' },
      { label: '小红书',    value: 'xiaohongshu' },
      { label: '微博',      value: 'weibo' },
      { label: '抖音脚本',  value: 'douyin_script' },
      { label: '知乎',      value: 'zhihu' },
    ],

    audienceIndex: 0,
    customAudience: '',
    showCustomAudience: false,
    audienceOptions: ['职场新人', '大学生', '宝妈', '科技爱好者', '创业者', '中老年', '自定义'],

    lengthPref: 'medium',
    lengthOptions: [
      { label: '短', value: 'short', desc: '≤300字' },
      { label: '中', value: 'medium', desc: '300-800字' },
      { label: '长', value: 'long',  desc: '800字+' },
    ],

    refMaterial: '',
    showRefMaterial: false,

    templates: [],
    showTemplatePicker: false,
    generating: false,
  },

  onShow() {
    this._loadTemplates()
  },

  async _loadTemplates() {
    try {
      const userUuid = getApp().globalData.userUuid
      const res = await wx.cloud.callFunction({ name: 'templateManager', data: { action: 'list', user_uuid: userUuid } })
      if (res.result.code === 0) this.setData({ templates: res.result.data })
    } catch (e) { /* silently ignore */ }
  },

  // ── Form handlers ─────────────────────────────────────────────────────────

  onSkeletonInput(e) { this.setData({ skeleton: e.detail.value }) },

  onStyleChange(e) {
    const idx = Number(e.detail.value)
    this.setData({ styleIndex: idx, showCustomStyle: idx === this.data.styleOptions.length - 1 })
  },
  onCustomStyleInput(e) { this.setData({ customStyle: e.detail.value }) },

  togglePlatform(e) {
    const val = e.currentTarget.dataset.value
    const map = { ...this.data.platformMap }
    const list = Object.keys(map).filter(k => map[k])
    if (map[val] && list.length <= 1) return   // keep at least one
    map[val] = !map[val]
    const platforms = Object.keys(map).filter(k => map[k])
    this.setData({ platformMap: map, platforms })
  },

  onAudienceChange(e) {},
  onCustomAudienceInput(e) {},

  onLengthTap(e) { this.setData({ lengthPref: e.currentTarget.dataset.value }) },

  toggleRefMaterial() { this.setData({ showRefMaterial: !this.data.showRefMaterial }) },
  onRefInput(e) { this.setData({ refMaterial: e.detail.value }) },

  // ── Template picker ───────────────────────────────────────────────────────

  openTemplatePicker() { this.setData({ showTemplatePicker: true }) },
  closeTemplatePicker() { this.setData({ showTemplatePicker: false }) },

  applyTemplate(e) {
    const tpl = this.data.templates[e.currentTarget.dataset.index]
    const cfg = tpl.config
    const styleIdx = this.data.styleOptions.indexOf(cfg.style)
    const audIdx   = this.data.audienceOptions.indexOf(cfg.audience)
    this.setData({
      styleIndex:   styleIdx >= 0 ? styleIdx : 0,
      platformMap: Object.fromEntries(
        ['wechat_mp','xiaohongshu','weibo','douyin_script','zhihu']
          .map(k => [k, (cfg.platforms || ['wechat_mp']).includes(k)])
      ),
      platforms: cfg.platforms || ['wechat_mp'],
      lengthPref:   cfg.length_pref || 'medium',
      showTemplatePicker: false,
    })
  },

  async saveAsTemplate() {
    const name = await this._promptTemplateName()
    if (!name) return
    const cfg = {
      style:       this._currentStyle(),
      platforms:   this.data.platforms,
      length_pref: this.data.lengthPref,
    }
    await wx.cloud.callFunction({ name: 'templateManager', data: { action: 'create', name, config: cfg, user_uuid: getApp().globalData.userUuid } })
    wx.showToast({ title: '已保存', icon: 'success' })
    this._loadTemplates()
    this.setData({ showTemplatePicker: false })
  },

  _promptTemplateName() {
    return new Promise(resolve => {
      wx.showModal({
        title: '保存为模板',
        editable: true,
        placeholderText: '输入模板名称',
        success: r => resolve(r.confirm ? r.content : null),
        fail: () => resolve(null),
      })
    })
  },

  // ── Generate ──────────────────────────────────────────────────────────────

  _currentStyle() {
    const { styleOptions, styleIndex, customStyle } = this.data
    return styleIndex === styleOptions.length - 1 ? customStyle : styleOptions[styleIndex]
  },

  async generate() {
    const { skeleton, platforms, lengthPref, refMaterial } = this.data
    const style    = this._currentStyle()
    const audience = '通用读者'
    const userUuid = getApp().globalData.userUuid

    if (!skeleton.trim()) { wx.showToast({ title: '请填写内容骨架', icon: 'none' }); return }
    if (!style.trim())    { wx.showToast({ title: '请选择行文风格', icon: 'none' }); return }

    this.setData({ generating: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'createTask',
        data: { skeleton, style, platforms, audience, length_pref: lengthPref, ref_material: refMaterial, user_uuid: userUuid },
      })
      const { code, data, message } = res.result
      if (code !== 0) { wx.showToast({ title: message || '创建失败', icon: 'none' }); return }

      wx.navigateTo({ url: `/pages/result/result?taskId=${data.task_id}` })
    } catch (e) {
      wx.showToast({ title: '网络错误', icon: 'none' })
    } finally {
      this.setData({ generating: false })
    }
  },
})
