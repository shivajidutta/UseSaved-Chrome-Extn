(async () => {
  try {
    const stored = await chrome.storage.local.get(['session'])
    if (!stored.session) return

    const session = stored.session
    if (!session.access_token || !session.refresh_token) return

    // Check if dashboard already has a valid session
    const existing = localStorage.getItem('sb-fmxhmxnjueazlcflwudm-auth-token')
    if (existing) {
      try {
        const parsed = JSON.parse(existing)
        if (parsed.access_token === session.access_token) return
      } catch (e) {}
    }

    // Write extension session to dashboard localStorage
    localStorage.setItem(
      'sb-fmxhmxnjueazlcflwudm-auth-token',
      JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
        expires_in: session.expires_in,
        token_type: session.token_type || 'bearer',
        user: session.user
      })
    )

    // Reload once to let Supabase pick up the session
    // Only reload if page just loaded (not already reloaded)
    if (!sessionStorage.getItem('us-session-synced')) {
      sessionStorage.setItem('us-session-synced', '1')
      window.location.reload()
    }
  } catch (e) {
    console.error('UseSaved content script error:', e)
  }
})()
