const SUPABASE_URL = 'https://fmxhmxnjueazlcflwudm.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZteGhteG5qdWVhemxjZmx3dWRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MzAwNTMsImV4cCI6MjA5NTMwNjA1M30.DYnMNrRxQX6CKs-COvQckTlKycfrat0DVc664YEe5d4'
const BACKEND_URL = 'http://localhost:3002'

const { createClient } = window.supabase
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

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
      document.getElementById('preview-title').textContent = currentTitle || currentUrl
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
      document.getElementById('save-title').textContent = currentTitle || '(No title)'
      document.getElementById('save-url').textContent = currentUrl
    }
  })

  const plan = profile.plan || 'free'
  const credits = profile.credit_balance != null ? Number(profile.credit_balance) : 0
  const proBadge = document.getElementById('pro-badge')
  const creditsDisplay = document.getElementById('credits-display')

  if (plan === 'pro') {
    proBadge.style.display = 'inline'
    creditsDisplay.textContent = 'Pro — unlimited saves'
    creditsDisplay.className = 'credits-display'
  } else {
    proBadge.style.display = 'none'
    creditsDisplay.textContent = `${credits} credit${credits !== 1 ? 's' : ''} remaining`
    if (credits === 0) {
      creditsDisplay.className = 'credits-display empty'
    } else if (credits < 50) {
      creditsDisplay.className = 'credits-display low'
    } else {
      creditsDisplay.className = 'credits-display'
    }
  }
}

function showStatus(message, type) {
  const el = document.getElementById('status-msg')
  el.className = `status-msg ${type}`
  el.style.display = 'block'
  if (type === 'success') {
    el.innerHTML = '<span style="color:#166534;font-weight:600">Saved</span> <span class="tick-circle">✓</span> <span style="color:#6b7280">AI tagging in progress.</span>'
  } else {
    el.textContent = message
  }
}

document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(['session', 'profile'], (result) => {
    if (result.session && result.profile) {
      showSaveView(result.profile)
    } else {
      showLoginView()
    }
  })

  document.getElementById('login-btn').addEventListener('click', () => {
    document.getElementById('login-btn').style.display = 'none'
    document.getElementById('login-form').style.display = 'block'
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

      let profile = { plan: 'free', credit_balance: 0, email }

      // Creates user row on first login; returns credit_balance for new users
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
          profile = {
            email,
            plan: d.plan ?? 'free',
            credit_balance: typeof d.credit_balance === 'number' ? d.credit_balance : 0,
          }
        }
      } catch (_) {}

      // Authoritative current balance straight from the users table
      try {
        const meRes = await fetch(`${BACKEND_URL}/api/users/me`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (meRes.ok) {
          const me = await meRes.json()
          if (typeof me.credit_balance === 'number') profile.credit_balance = me.credit_balance
          if (me.plan) profile.plan = me.plan
        }
      } catch (_) {}

      chrome.storage.local.set({ session, profile }, () => {
        showSaveView(profile)
      })
    } catch (err) {
      errorEl.textContent = err.message || 'Sign in failed. Please try again.'
      errorEl.style.display = 'block'
      submitBtn.disabled = false
      submitBtn.textContent = 'Sign In'
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

    saveBtn.disabled = true
    showStatus('Saving…', 'loading')

    chrome.storage.local.get(['session'], async (result) => {
      if (!result.session) {
        showStatus('Session expired. Please sign in again.', 'error')
        saveBtn.disabled = false
        return
      }

      const token = result.session.access_token

      try {
        const res = await fetch(`${BACKEND_URL}/api/saves`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ url: currentUrl, save_note: saveNote }),
        })

        if (res.status === 201) {
          document.getElementById('save-note').value = ''
          showStatus('', 'success')
          setTimeout(() => window.close(), 2000)

          const data = await res.json()
          if (data.credits_remaining !== undefined) {
            chrome.storage.local.get(['profile'], (r) => {
              const updated = { ...(r.profile || {}), credit_balance: data.credits_remaining }
              chrome.storage.local.set({ profile: updated }, () => {
                showSaveView(updated)
                showStatus('', 'success')
              })
            })
          }
        } else if (res.status === 402) {
          showStatus('No credits remaining. Upgrade to Pro to keep saving.', 'error')
        } else {
          const err = await res.json().catch(() => ({}))
          showStatus(err.error || 'Save failed. Please try again.', 'error')
        }
      } catch (_) {
        showStatus('Network error. Check your connection.', 'error')
      }

      saveBtn.disabled = false
    })
  })

  document.getElementById('open-search-btn').addEventListener('click', async () => {
    const tab = await getCurrentTab()
    if (tab) {
      chrome.sidePanel.open({ windowId: tab.windowId })
      window.close()
    }
  })

  document.getElementById('logout-link').addEventListener('click', async (e) => {
    e.preventDefault()
    await supabaseClient.auth.signOut()
    chrome.storage.local.remove(['session', 'profile'], () => {
      showLoginView()
    })
  })
})
