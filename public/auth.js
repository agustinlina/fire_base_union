// public/auth.js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js'
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js'
import { getFirestore, doc, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js'

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
const db = getFirestore(app)

let unsub = null

function allowRender () {
  document.documentElement.classList.remove('auth-pending')
}
function isAuthPage () {
  const p = location.pathname
  return p.endsWith('/login.html') || p.endsWith('/register.html')
}

function mountHeader (user) {
  const header = document.getElementById('auth-header')
  if (!header) return
  header.innerHTML = `
    <div class="d-flex justify-content-between align-items-center p-2 bg-dark text-light">
      <span>Hola, <b>${user.email}</b></span>
      <button id="logout" class="btn btn-sm btn-danger">Cerrar sesión</button>
    </div>`
  document.getElementById('logout')?.addEventListener('click', async () => {
    await doLogout()
  })
}

async function doLogout () {
  try {
    const user = auth.currentUser
    const sessionId = localStorage.getItem('sessionId') || ''
    if (user && sessionId) {
      await fetch('/api/logout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ uid: user.uid, sessionId })
      }).catch(() => {})
    }
  } finally {
    localStorage.removeItem('sessionId')
    try { await signOut(auth) } catch {}
    window.location.replace('./login.html')
  }
}

// Defensivo: si por algún motivo el lock cambia a otro sessionId activo, cerramos esta pestaña.
function watchLock (user) {
  if (unsub) unsub()
  const mySessionId = localStorage.getItem('sessionId') || ''
  unsub = onSnapshot(doc(db, 'userSessions', user.uid), (snap) => {
    const data = snap.exists() ? (snap.data() || {}) : {}
    const active = !!data.active
    const serverSessionId = data.sessionId || ''
    if (active && serverSessionId && serverSessionId !== mySessionId) {
      doLogout()
    }
  })
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    if (isAuthPage()) { window.location.replace('./'); return }
    mountHeader(user)
    watchLock(user)
    allowRender()
  } else {
    if (!isAuthPage()) { window.location.replace('./login.html'); return }
    allowRender()
  }
})
