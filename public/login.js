// public/login.js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js'
import { getAuth, signInWithCustomToken, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js'

const firebaseConfig = {
  apiKey: 'AIzaSyAe42aV5wu28NddRCxFL1dz5xps-04XxMk',
  authDomain: 'union-user-live.firebaseapp.com',
  projectId: 'union-user-live',
  storageBucket: 'union-user-live.appspot.com',
  messagingSenderId: '279782141524',
  appId: '1:279782141524:web:f7579e44b2848d990e87c1'
}
const app = initializeApp(firebaseConfig)
const auth = getAuth(app)

const form = document.getElementById('login-form')
const emailInput = document.getElementById('email')
const passwordInput = document.getElementById('password')
const msg = document.getElementById('msg')

onAuthStateChanged(auth, (user) => {
  if (user) window.location.replace('./')
})

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  msg.style.display = 'none'
  const email = emailInput.value.trim()
  const password = passwordInput.value

  try {
    const resp = await fetch('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password })
    })

    if (resp.status === 409) {
      window.location.replace('./login.html?msg=Usuario%20en%20uso')
      return
    }
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}))
      throw new Error(err.error || 'Error al iniciar sesión')
    }

    const { customToken, sessionId } = await resp.json()
    await signInWithCustomToken(auth, customToken)
    localStorage.setItem('sessionId', sessionId)
    window.location.replace('./')
  } catch (error) {
    msg.textContent = error.message || 'Error al iniciar sesión'
    msg.style.display = 'block'
  }
})
