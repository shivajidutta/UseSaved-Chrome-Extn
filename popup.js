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
  document.getElementById('login-view').style.display = 'block'
  document.getElementById('save-view').style.display = 'none'
  getCurrentTab().then((tab) => {
    if (tab) {
      currentUrl = tab.url || ''
      currentTitle = tab.title || ''
      document.getElementById('login-page-title').textContent = currentTitle || currentUrl
    }
  })
}

function showSaveView(profile) {
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
    const stored = await chrome.storage.local.get(['userProfile'])
    if (stored.userProfile) {
      showSaveView(stored.userProfile)
    } else {
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
          const me = await meRes.json()
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

  document.getElementById('save-btn').addEventListener('click', async () => {
    const saveBtn = document.getElementById('save-btn')
    const saveNote = document.getElementById('save-note').value.trim()
    const statusEl = document.getElementById('status-msg')

    saveBtn.textContent = 'Saving...'
    saveBtn.disabled = true
    statusEl.style.display = 'none'

    const session = await getValidSession()
    if (!session) {
      statusEl.innerHTML = 'Please log in again. Inactivity over 30 days leads to auto logout for your account security.'
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
        body: JSON.stringify({ url: currentUrl, save_note: saveNote }),
      })

      if (res.ok) {
        const data = await res.json()
        document.getElementById('save-note').value = ''
        showStatus('', 'success')
        saveBtn.disabled = false
        saveBtn.textContent = 'Save This Page'
        setTimeout(window.close, 2000)

        if (data.credits_remaining !== undefined) {
          chrome.storage.local.get(['userProfile'], (r) => {
            const updated = { ...(r.userProfile || {}), credit_balance: data.credits_remaining }
            chrome.storage.local.set({ userProfile: updated })
          })
        }
      } else if (res.status === 402) {
        showStatus('No credits remaining. Upgrade to Pro to keep saving.', 'error')
        saveBtn.disabled = false
        saveBtn.textContent = 'Save This Page'
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

  document.getElementById('logout-link').addEventListener('click', async (e) => {
    e.preventDefault()
    await supabaseClient.auth.signOut()
    await chrome.storage.local.remove(['session', 'userProfile'])
    showLoginView()
  })
})
