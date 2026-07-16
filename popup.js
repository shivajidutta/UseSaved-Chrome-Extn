const SUPABASE_URL = 'https://fmxhmxnjueazlcflwudm.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZteGhteG5qdWVhemxjZmx3dWRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MzAwNTMsImV4cCI6MjA5NTMwNjA1M30.DYnMNrRxQX6CKs-COvQckTlKycfrat0DVc664YEe5d4'
const BACKEND_URL = 'https://usesaved-backend.onrender.com'

const { createClient } = window.supabase
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function getValidSession() {
  const stored = await chrome.storage.local.get(['session'])
  if (!stored.session) return null

  const { data, error } = await supabaseClient.auth.setSession({
    access_token: stored.session.access_token,
    refresh_token: stored.session.refresh_token,
  })

  if (error || !data.session) {
    await chrome.storage.local.remove(['session', 'userProfile'])
    return null
  }

  await chrome.storage.local.set({ session: data.session })
  return data.session
}

let currentUrl = ''
let currentTitle = ''

async function getCurrentTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs[0] || null)
    })
  })
}

function showLoginView() {
  document.getElementById('loading-view').style.display = 'none'
  document.getElementById('login-view').style.display = 'block'
  document.getElementById('save-view').style.display = 'none'

  const loginBtn = document.getElementById('login-btn')
  const loginForm = document.getElementById('login-form')
  const submitBtn = document.getElementById('submit-login-btn')
  const loginError = document.getElementById('login-error')
  const statusMsg = document.getElementById('status-msg')

  loginBtn.textContent = 'Sign In'
  loginBtn.disabled = false
  // Clear the inline hide applied when the Sign In button was clicked,
  // otherwise a logout in the same popup session leaves no login CTA
  loginBtn.style.display = ''
  submitBtn.textContent = 'Log In'
  submitBtn.disabled = false
  document.getElementById('email-input').value = ''
  document.getElementById('password-input').value = ''
  loginError.style.display = 'none'
  loginForm.style.display = 'none'
  statusMsg.style.display = 'none'

  const forgotLink = document.getElementById('forgot-password-link')
  if (forgotLink) forgotLink.textContent = 'Forgot password?'

  getCurrentTab().then((tab) => {
    if (tab) {
      currentUrl = tab.url || ''
      currentTitle = tab.title || ''
      document.getElementById('login-page-title').textContent = currentTitle || currentUrl
    }
  })
}

function showSaveView(profile) {
  document.getElementById('loading-view').style.display = 'none'
  document.getElementById('login-view').style.display = 'none'
  document.getElementById('save-view').style.display = 'block'

  getCurrentTab().then((tab) => {
    if (tab) {
      currentUrl = tab.url || ''
      currentTitle = tab.title || ''
      document.getElementById('page-title').textContent = currentTitle || '(No title)'
      document.getElementById('page-url').textContent = currentUrl
    }
  })

  updateCreditsDisplay(profile)
}

function updateCreditsDisplay(profile) {
  const plan = profile.plan || 'free'
  const credits = profile.credit_balance != null ? Number(profile.credit_balance) : 0
  const creditsEl = document.getElementById('credits-display')

  if (plan === 'pro') {
    creditsEl.textContent = 'Pro'
    creditsEl.className = 'us-credits pro'
  } else if (credits === 0) {
    creditsEl.textContent = '0 credits'
    creditsEl.className = 'us-credits empty'
  } else if (credits < 50) {
    creditsEl.textContent = `${credits} credit${credits !== 1 ? 's' : ''} remaining`
    creditsEl.className = 'us-credits low'
  } else {
    creditsEl.textContent = `${credits} credit${credits !== 1 ? 's' : ''} remaining`
    creditsEl.className = 'us-credits healthy'
  }
}

async function fetchProfile(token) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      const payload = await res.json()
      const me = payload.user || payload
      if (me && typeof me.credit_balance === 'number') {
        return { email: me.email, plan: me.plan || 'free', credit_balance: me.credit_balance }
      }
    }
  } catch (_) {}
  return null
}

async function openDashboard() {
  const session = await getValidSession()
  if (!session) {
    chrome.tabs.create({ url: 'https://app.usesaved.com' })
    return
  }
  // Single-use handoff code instead of raw tokens: the URL (and browser
  // history) never contains anything that works twice or outlives 60 seconds
  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/handoff`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (res.ok) {
      const { code } = await res.json()
      chrome.tabs.create({ url: `https://app.usesaved.com/#handoff_code=${code}` })
      return
    }
  } catch (_) {}
  chrome.tabs.create({ url: 'https://app.usesaved.com' })
}

function showStatus(message, type) {
  const el = document.getElementById('status-msg')
  el.className = `us-status ${type}`
  el.style.display = 'flex'
  if (type === 'success') {
    el.innerHTML = '<span class="saved-word">Saved</span> <span class="tick-circle">✓</span> <span class="tagging-text">AI tagging in progress.</span>'
  } else {
    el.textContent = message
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const session = await getValidSession()
  if (session) {
    // Show the cached profile instantly, then correct it with the server's
    // number — credits can change from the dashboard or other devices
    const stored = await chrome.storage.local.get(['userProfile'])
    if (stored.userProfile) showSaveView(stored.userProfile)

    const fresh = await fetchProfile(session.access_token)
    if (fresh) {
      await chrome.storage.local.set({ userProfile: fresh })
      showSaveView(fresh)
    } else if (!stored.userProfile) {
      showLoginView()
    }
  } else {
    showLoginView()
  }

  document.getElementById('login-btn').addEventListener('click', () => {
    document.getElementById('login-btn').style.display = 'none'
    document.getElementById('login-form').style.display = 'flex'
    document.getElementById('email-input').focus()
  })

  document.getElementById('submit-login-btn').addEventListener('click', async () => {
    const email = document.getElementById('email-input').value.trim()
    const password = document.getElementById('password-input').value
    const errorEl = document.getElementById('login-error')
    const submitBtn = document.getElementById('submit-login-btn')

    errorEl.style.display = 'none'

    if (!email || !password) {
      errorEl.textContent = 'Please enter email and password.'
      errorEl.style.display = 'block'
      return
    }

    submitBtn.disabled = true
    submitBtn.textContent = 'Signing in…'

    try {
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password })
      if (error) throw error

      const session = data.session
      const token = session.access_token

      let userProfile = { plan: 'free', credit_balance: 0, email }

      // Register / fetch beta credits on first login
      try {
        const regRes = await fetch(`${BACKEND_URL}/api/users/register`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ email }),
        })
        if (regRes.ok) {
          const d = await regRes.json()
          userProfile = {
            email,
            plan: d.plan ?? 'free',
            credit_balance: typeof d.credit_balance === 'number' ? d.credit_balance : 0,
          }
        }
      } catch (_) {}

      // Authoritative current balance from users table
      try {
        const meRes = await fetch(`${BACKEND_URL}/api/users/me`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (meRes.ok) {
          const payload = await meRes.json()
          const me = payload.user || payload
          if (typeof me.credit_balance === 'number') userProfile.credit_balance = me.credit_balance
          if (me.plan) userProfile.plan = me.plan
        }
      } catch (_) {}

      await chrome.storage.local.set({ session, userProfile })
      await supabaseClient.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      })
      showSaveView(userProfile)
    } catch (err) {
      errorEl.textContent = err.message || 'Sign in failed. Please try again.'
      errorEl.style.display = 'block'
      submitBtn.disabled = false
      submitBtn.textContent = 'Log In'
    }
  })

  document.getElementById('email-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('submit-login-btn').click()
  })

  document.getElementById('password-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('submit-login-btn').click()
  })

  document.getElementById('forgot-password-link').addEventListener('click', async (e) => {
    e.preventDefault()
    const link = e.target
    const email = document.getElementById('email-input').value.trim()
    const errorEl = document.getElementById('login-error')
    if (!email || !email.includes('@')) {
      errorEl.textContent = 'Enter your email above first, then click Forgot password.'
      errorEl.style.display = 'block'
      return
    }
    errorEl.style.display = 'none'
    link.textContent = 'Sending…'
    try {
      await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: 'https://app.usesaved.com/reset-password',
      })
      link.textContent = 'Reset link sent. Check your email.'
    } catch (_) {
      link.textContent = 'Could not send. Try again.'
    }
  })

  const noteSearchableToggle = document.getElementById('note-searchable')
  if (noteSearchableToggle) {
    noteSearchableToggle.addEventListener('change', () => {
      const off = !noteSearchableToggle.checked
      const warn = document.getElementById('note-private-warning')
      const hint = document.querySelector('.us-note-hint')
      if (warn) warn.style.display = off ? 'block' : 'none'
      if (hint) hint.style.display = off ? 'none' : 'block'
    })
  }

  document.getElementById('save-btn').addEventListener('click', async () => {
    const saveBtn = document.getElementById('save-btn')
    const saveNote = document.getElementById('save-note').value.trim()
    const noteSearchable = document.getElementById('note-searchable').checked
    const statusEl = document.getElementById('status-msg')

    saveBtn.textContent = 'Saving...'
    saveBtn.disabled = true
    statusEl.style.display = 'none'

    const session = await getValidSession()
    if (!session) {
      statusEl.innerHTML = 'Please log in again. Inactivity over 7 days leads to auto logout for your account security.'
      statusEl.className = 'us-status error'
      statusEl.style.display = 'block'
      setTimeout(() => {
        statusEl.style.display = 'none'
        saveBtn.disabled = false
        saveBtn.textContent = 'Save This Page'
        showLoginView()
      }, 3000)
      return
    }

    const token = session.access_token

    try {
      const res = await fetch(`${BACKEND_URL}/api/saves`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ url: currentUrl, save_note: saveNote, note_searchable: noteSearchable }),
      })

      if (res.ok) {
        const data = await res.json()
        document.getElementById('save-note').value = ''
        const nsToggle = document.getElementById('note-searchable')
        if (nsToggle) { nsToggle.checked = true; nsToggle.dispatchEvent(new Event('change')) }
        saveBtn.disabled = false
        saveBtn.textContent = 'Save This Page'

        if (data.tagging === false) {
          // Save stored, but tagging skipped: keep the popup open so the user sees why
          showStatus('Saved, but not tagged. You are out of credits.', 'error')
        } else {
          showStatus('', 'success')
          setTimeout(window.close, 2000)
        }

        if (typeof data.credit_balance === 'number') {
          // Balance is read before the async tag charge, so show the post-charge number
          const willCharge = data.tagging !== false && data.plan !== 'pro'
          const newBalance = willCharge ? Math.max(0, data.credit_balance - 1) : data.credit_balance
          chrome.storage.local.get(['userProfile'], (r) => {
            const updated = { ...(r.userProfile || {}), credit_balance: newBalance }
            chrome.storage.local.set({ userProfile: updated })
            updateCreditsDisplay(updated)
          })
        }
      } else if (res.status === 401) {
        statusEl.innerHTML = 'Please log in again. Inactivity over 7 days leads to auto logout. It is inconvenient. But it protects your account.'
        statusEl.className = 'us-status error'
        statusEl.style.display = 'block'
        saveBtn.disabled = false
        saveBtn.textContent = 'Save This Page'
        setTimeout(() => {
          statusEl.style.display = 'none'
          showLoginView()
        }, 3000)
      } else {
        const err = await res.json().catch(() => ({}))
        showStatus(err.error || 'Save failed. Please try again.', 'error')
        saveBtn.disabled = false
        saveBtn.textContent = 'Save This Page'
      }
    } catch (_) {
      showStatus('Network error. Check your connection.', 'error')
      saveBtn.disabled = false
      saveBtn.textContent = 'Save This Page'
    }
  })

  document.getElementById('open-search-btn').addEventListener('click', async () => {
    const session = await getValidSession()
    if (!session) {
      showLoginView()
      return
    }
    const tab = await getCurrentTab()
    if (tab) {
      chrome.sidePanel.open({ windowId: tab.windowId })
      window.close()
    }
  })

  document.getElementById('dashboard-link').addEventListener('click', async (e) => {
    e.preventDefault()
    await openDashboard()
  })

  document.getElementById('logout-link').addEventListener('click', async (e) => {
    e.preventDefault()
    // scope:'local' — only end THIS surface's session. The default ('global')
    // revokes every session the user has, silently logging them out of the
    // dashboard and any other device.
    await supabaseClient.auth.signOut({ scope: 'local' })
    await chrome.storage.local.remove(['session', 'userProfile'])
    showLoginView()
  })
})
