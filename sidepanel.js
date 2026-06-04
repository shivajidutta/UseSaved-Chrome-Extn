const SUPABASE_URL = 'https://fmxhmxnjueazlcflwudm.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZteGhteG5qdWVhemxjZmx3dWRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MzAwNTMsImV4cCI6MjA5NTMwNjA1M30.DYnMNrRxQX6CKs-COvQckTlKycfrat0DVc664YEe5d4'
const BACKEND_URL = 'http://localhost:3002'

const { createClient } = window.supabase
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

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
      const box = document.getElementById('sp-current-page-box')
      document.getElementById('sp-current-title').textContent = tab.title || tab.url
      document.getElementById('sp-current-url').textContent = tab.url
      box.style.display = 'block'
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
  const container = document.getElementById('sp-results')
  container.innerHTML = ''

  if (!results || results.length === 0) {
    container.innerHTML = '<p style="font-size:13px; color:#9ca3af; text-align:center; padding:24px 0;">No results found. Try a different search.</p>'
    return
  }

  results.forEach((item) => {
    const card = document.createElement('div')
    card.className = 'sp-result-card'

    const title = document.createElement('div')
    title.className = 'sp-result-title'
    title.textContent = item.title || item.url || 'Untitled'

    const url = document.createElement('div')
    url.className = 'sp-result-url'
    url.textContent = item.url || ''

    const badges = document.createElement('div')
    badges.className = 'sp-badges'

    if (item.topic_domain) {
      const b = document.createElement('span')
      b.className = 'sp-badge-match'
      b.textContent = item.topic_domain
      badges.appendChild(b)
    }

    if (item.source_platform) {
      const b = document.createElement('span')
      b.className = 'sp-badge-platform'
      b.textContent = item.source_platform
      badges.appendChild(b)
    }

    card.appendChild(title)
    card.appendChild(url)
    if (badges.children.length > 0) card.appendChild(badges)

    card.addEventListener('click', () => {
      if (item.url) chrome.tabs.create({ url: item.url })
    })

    container.appendChild(card)
  })
}

async function doSearch() {
  const query = document.getElementById('sp-search-input').value.trim()
  const errorEl = document.getElementById('sp-search-error')
  const searchBtn = document.getElementById('sp-search-btn')

  errorEl.style.display = 'none'

  if (!query) return

  chrome.storage.local.get(['session'], async (result) => {
    if (!result.session) {
      errorEl.textContent = 'Session expired. Please sign in again.'
      errorEl.style.display = 'block'
      return
    }

    const token = result.session.access_token
    searchBtn.disabled = true
    searchBtn.textContent = 'Searching…'

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
        errorEl.textContent = err.error || 'Search failed. Please try again.'
        errorEl.style.display = 'block'
      }
    } catch (_) {
      errorEl.textContent = 'Network error. Check your connection.'
      errorEl.style.display = 'block'
    }

    searchBtn.disabled = false
    searchBtn.textContent = 'Search'
  })
}

document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(['session', 'profile'], (result) => {
    if (result.session && result.profile) {
      showMainView(result.profile)
    } else {
      showLoginView()
    }
  })

  document.getElementById('sp-login-btn').addEventListener('click', () => {
    document.getElementById('sp-login-btn').style.display = 'none'
    document.getElementById('sp-login-form').style.display = 'block'
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

      let profile = { plan: 'free', credit_balance: 0, email }

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
          const regData = await regRes.json()
          profile.credit_balance = regData.credit_balance ?? 0
          profile.plan = regData.plan ?? 'free'
        }
      } catch (_) {
        // Registration endpoint may 409 for existing users — ignore
      }

      chrome.storage.local.set({ session, profile }, () => {
        showMainView(profile)
      })
    } catch (err) {
      errorEl.textContent = err.message || 'Sign in failed. Please try again.'
      errorEl.style.display = 'block'
      submitBtn.disabled = false
      submitBtn.textContent = 'Sign In'
    }
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

  document.getElementById('sp-dashboard-btn').addEventListener('click', () => {
    chrome.tabs.create({ url: 'http://localhost:3000' })
  })
})
