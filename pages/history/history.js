const PAGE_SIZE = 20

Page({
  data: {
    tasks: [],
    total: 0,
    page: 1,
    loading: false,
    hasMore: true,
  },

  onShow() {
    this.setData({ tasks: [], page: 1, hasMore: true })
    this._loadTasks(1)
  },

  async _loadTasks(page) {
    if (this.data.loading) return
    this.setData({ loading: true })
    const userUuid = getApp().globalData.userUuid
    try {
      const res = await wx.cloud.callFunction({
        name: 'taskManager',
        data: { action: 'list', page, page_size: PAGE_SIZE, user_uuid: userUuid },
      })
      if (res.result.code !== 0) return
      const { total, items } = res.result.data
      const tasks = page === 1 ? items : [...this.data.tasks, ...items]
      this.setData({ tasks, total, page, hasMore: tasks.length < total })
    } finally {
      this.setData({ loading: false })
      wx.stopPullDownRefresh()
    }
  },

  onPullDownRefresh() {
    this.setData({ tasks: [], page: 1, hasMore: true })
    this._loadTasks(1)
  },

  onReachBottom() {
    if (this.data.hasMore) this._loadTasks(this.data.page + 1)
  },

  goToResult(e) {
    const taskId = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/result/result?taskId=${taskId}` })
  },

  async deleteTask(e) {
    const taskId = e.currentTarget.dataset.id
    const { confirm } = await wx.showModal({ title: '删除记录', content: '确定删除这条记录？', confirmColor: '#FF3B30' })
    if (!confirm) return
    const userUuid = getApp().globalData.userUuid
    await wx.cloud.callFunction({ name: 'taskManager', data: { action: 'delete', task_id: taskId, user_uuid: userUuid } })
    this.setData({ tasks: this.data.tasks.filter(t => t.task_id !== taskId), total: this.data.total - 1 })
  },

  formatDate(iso) {
    if (!iso) return ''
    const d = new Date(iso)
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
  },
})
