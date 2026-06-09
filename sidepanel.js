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

function capitalise(str) {
  if (!str) return str
  return str.charAt(0).toUpperCase() + str.slice(1)
}

async function getCurrentTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs[0] || null)
    })
  })
}

function showLoginView() {
  document.getElementById('sp-login-view').style.display = 'flex'
  document.getElementById('sp-main-view').style.display = 'none'

  getCurrentTab().then((tab) => {
    if (tab && tab.url) {
      document.getElementById('sp-current-title').textContent = tab.title || tab.url
      document.getElementById('sp-current-url').textContent = tab.url
    }
  })
}

function showMainView(profile) {
  document.getElementById('sp-login-view').style.display = 'none'
  const mainView = document.getElementById('sp-main-view')
  mainView.style.display = 'flex'
  mainView.style.flexDirection = 'column'
  mainView.style.height = '100%'

  const email = profile.email || ''
  const name = capitalise(email.split('@')[0])
  document.getElementById('sp-greeting').textContent = `Welcome back, ${name}`
}

function renderResults(results) {
  const list = document.getElementById('sp-results-list')
  list.innerHTML = ''

  if (!results || results.length === 0) {
    list.innerHTML = '<p style="font-size:13px;color:#9ca3af;text-align:center;padding:24px 0;">No saves matched that description.</p>'
    return
  }

  results.forEach((item) => {
    const card = document.createElement('div')
    card.className = 'sp-result-card'

    const title = document.createElement('div')
    title.className = 'sp-result-title'
    title.textContent = item.title || item.url || 'Untitled'
    card.appendChild(title)

    if (item.url) {
      const url = document.createElement('div')
      url.className = 'sp-result-url'
      url.textContent = item.url
      card.appendChild(url)
    }

    const badges = document.createElement('div')
    badges.className = 'sp-badges'

    if (typeof item.similarity === 'number') {
      const b = document.createElement('span')
      b.className = 'sp-badge sp-badge-match'
      b.textContent = `${Math.round(item.similarity * 100)}% match`
      badges.appendChild(b)
    } else if (item.topic_domain) {
      const b = document.createElement('span')
      b.className = 'sp-badge sp-badge-match'
      b.textContent = item.topic_domain
      badges.appendChild(b)
    }

    if (item.source_platform) {
      const b = document.createElement('span')
      b.className = 'sp-badge sp-badge-platform'
      b.textContent = item.source_platform
      badges.appendChild(b)
    }

    if (badges.children.length > 0) card.appendChild(badges)

    if (item.summary) {
      const summary = document.createElement('div')
      summary.className = 'sp-result-summary'
      summary.textContent = item.summary
      card.appendChild(summary)
    }

    card.addEventListener('click', () => {
      if (item.url) chrome.tabs.create({ url: item.url })
    })

    list.appendChild(card)
  })
}

async function doSearch() {
  const query = document.getElementById('sp-search-input').value.trim()
  const searchBtn = document.getElementById('sp-search-btn')
  const resultsList = document.getElementById('sp-results-list')
  const resultsHint = document.getElementById('sp-results-hint')

  if (!query) return

  const session = await getValidSession()
  if (!session) {
    resultsHint.textContent = 'Please log in again. Inactivity over 7 days leads to auto logout for your account security.'
    resultsHint.style.display = 'block'
    setTimeout(() => {
      resultsHint.style.display = 'none'
      showLoginView()
    }, 3000)
    return
  }

  const token = session.access_token
  searchBtn.disabled = true
  searchBtn.textContent = 'Searching…'
  resultsHint.style.display = 'none'
  resultsList.innerHTML = ''

  try {
    const res = await fetch(`${BACKEND_URL}/api/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query }),
    })

    if (res.ok) {
      const data = await res.json()
      renderResults(data.results || data)
    } else {
      const err = await res.json().catch(() => ({}))
      resultsList.innerHTML = `<p style="font-size:13px;color:#dc2626;text-align:center;padding:16px 0;">${err.error || 'Search failed. Please try again.'}</p>`
    }
  } catch (_) {
    resultsList.innerHTML = '<p style="font-size:13px;color:#dc2626;text-align:center;padding:16px 0;">Network error. Check your connection.</p>'
  }

  searchBtn.disabled = false
  searchBtn.textContent = 'Search'
}

document.addEventListener('DOMContentLoaded', async () => {
  const session = await getValidSession()
  if (session) {
    const stored = await chrome.storage.local.get(['userProfile'])
    if (stored.userProfile) {
      showMainView(stored.userProfile)
    } else {
      showLoginView()
    }
  } else {
    showLoginView()
  }

  document.getElementById('sp-login-btn').addEventListener('click', () => {
    document.getElementById('sp-login-btn').style.display = 'none'
    document.getElementById('sp-login-form').style.display = 'flex'
    document.getElementById('sp-email').focus()
  })

  document.getElementById('sp-submit-login').addEventListener('click', async () => {
    const email = document.getElementById('sp-email').value.trim()
    const password = document.getElementById('sp-password').value
    const errorEl = document.getElementById('sp-login-error')
    const submitBtn = document.getElementById('sp-submit-login')

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
          userProfile.credit_balance = d.credit_balance ?? 0
          userProfile.plan = d.plan ?? 'free'
        }
      } catch (_) {}

      await chrome.storage.local.set({ session, userProfile })
      await supabaseClient.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      })
      showMainView(userProfile)
    } catch (err) {
      errorEl.textContent = err.message || 'Sign in failed. Please try again.'
      errorEl.style.display = 'block'
      submitBtn.disabled = false
      submitBtn.textContent = 'Log In'
    }
  })

  document.getElementById('sp-email').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('sp-submit-login').click()
  })

  document.getElementById('sp-password').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('sp-submit-login').click()
  })

  document.getElementById('sp-search-btn').addEventListener('click', doSearch)

  document.getElementById('sp-search-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      doSearch()
    }
  })

  document.getElementById('sp-dashboard-btn').addEventListener('click', async () => {
    const session = await getValidSession()
    if (session) {
      const params = `access_token=${session.access_token}&refresh_token=${session.refresh_token}&type=session`
      chrome.tabs.create({ url: `https://app.usesaved.com/#${params}` })
    } else {
      chrome.tabs.create({ url: 'https://app.usesaved.com' })
    }
  })
})
