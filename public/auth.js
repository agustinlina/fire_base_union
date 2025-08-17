// public/auth.js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js'
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js'
import { getFirestore, doc, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js'

// --- CONFIG FIREBASE ---
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

let unsubSessionDoc = null

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
    <div class="d-flex justify-content-between align-items-center p-2 bg-dark text-light" style="gap:12px;">
      <span class="small m-0">Hola, <b>${user.email}</b></span>
      <button id="logout" class="btn btn-sm btn-danger">Cerrar sesión</button>
    </div>
  `
  document.getElementById('logout')?.addEventListener('click', async () => {
    try { await signOut(auth) } finally {
      // Al cerrar sesión invalidamos nuestro sessionId local
      localStorage.removeItem('sessionId')
      window.location.replace('./login.html')
    }
  })
}

function watchUniqueSession (user) {
  // Escucha el doc userSessions/{uid} y se auto-cierra si cambia el sessionId
  const mySessionId = localStorage.getItem('sessionId') || ''
  const ref = doc(db, 'userSessions', user.uid)

  if (unsubSessionDoc) unsubSessionDoc()
  unsubSessionDoc = onSnapshot(ref, async (snap) => {
    if (!snap.exists()) return
    const serverSessionId = snap.data()?.sessionId || ''
    if (!serverSessionId) return

    if (serverSessionId !== mySessionId) {
      // Otra sesión tomó el control → nos vamos
      try { await signOut(auth) } catch {}
      localStorage.removeItem('sessionId')
      const url = new URL('./login.html', location.href)
      url.searchParams.set('msg', 'Tu cuenta se abrió en otro dispositivo.')
      window.location.replace(url.toString())
    }
  })
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    if (isAuthPage()) {
      // Si ya está logueado y viene al login/register, lo mandamos al home
      window.location.replace('./')
      return
    }
    mountHeader(user)
    watchUniqueSession(user)
    allowRender()
  } else {
    // Sin sesión → a login (excepto si ya estamos en login/register)
    if (!isAuthPage()) {
      window.location.replace('./login.html')
      return
    }
    allowRender()
  }
})
