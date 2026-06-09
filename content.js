chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SET_SESSION') {
    try {
      const sessionData = {
        access_token: message.session.access_token,
        refresh_token: message.session.refresh_token,
        expires_at: message.session.expires_at,
        expires_in: message.session.expires_in,
        token_type: message.session.token_type || 'bearer',
        user: message.session.user
      }
      localStorage.setItem(
        'sb-fmxhmxnjueazlcflwudm-auth-token',
        JSON.stringify(sessionData)
      )
      window.location.reload()
      sendResponse({ success: true })
    } catch (e) {
      console.error('UseSaved session sync error:', e)
      sendResponse({ success: false })
    }
  }
  return true
})
