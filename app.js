App({
  globalData: { userUuid: '' },

  onLaunch() {
    wx.cloud.init({
      env: 'content-tool-d6grria7va47a6f90',
      traceUser: true,
    })
    let uuid = wx.getStorageSync('user_uuid')
    if (!uuid) {
      uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
      })
      wx.setStorageSync('user_uuid', uuid)
    }
    this.globalData.userUuid = uuid
  },
})
