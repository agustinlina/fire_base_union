// public/auth.js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js'
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js'
import {
  getFirestore, doc, onSnapshot, updateDoc, setDoc, serverTimestamp, getDoc
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js'

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
let heartbeatTimer = null

const SESSION_TTL_MS = 2 * 60 * 1000; // 2 minutos
const HEARTBEAT_MS = 30 * 1000; // cada 30s

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
    await safeReleaseAndSignOut()
  })
}

async function safeReleaseAndSignOut () {
  try {
    const user = auth.currentUser
    const mySessionId = localStorage.getItem('sessionId') || ''
    if (user && mySessionId) {
      const ref = doc(db, 'userSessions', user.uid)
      const snap = await getDoc(ref)
      const data = snap.data() || {}
      // Solo libero si sigo siendo yo el dueño del lock
      if (data.sessionId === mySessionId) {
        await setDoc(ref, { active: false, updatedAt: serverTimestamp() }, { merge: true })
      }
    }
  } catch {}
  try { await signOut(auth) } catch {}
  localStorage.removeItem('sessionId')
  window.location.replace('./login.html')
}

function startHeartbeat (user) {
  stopHeartbeat()
  const ref = doc(db, 'userSessions', user.uid)
  const mySessionId = localStorage.getItem('sessionId') || ''

  heartbeatTimer = setInterval(async () => {
    try {
      const snap = await getDoc(ref)
      const data = snap.data() || {}
      // Solo refresco si sigo teniendo el lock
      if (data.sessionId === mySessionId && data.active === true) {
        await updateDoc(ref, { updatedAt: serverTimestamp() })
      } else {
        // Perdí el lock → cerrar
        await safeReleaseAndSignOut()
      }
    } catch {
      // Si falla, intento cerrar sesión limpia
      await safeReleaseAndSignOut()
    }
  }, HEARTBEAT_MS)
}

function stopHeartbeat () {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
}

function watchLock (user) {
  const mySessionId = localStorage.getItem('sessionId') || ''
  const ref = doc(db, 'userSessions', user.uid)

  if (unsubSessionDoc) unsubSessionDoc()
  unsubSessionDoc = onSnapshot(ref, async (snap) => {
    if (!snap.exists()) {
      // Si desaparece el doc, mejor salir
      await safeReleaseAndSignOut()
      return
    }
    const data = snap.data() || {}
    const serverSessionId = data.sessionId || ''
    const active = data.active === true
    const updatedAt = data.updatedAt?.toMillis?.() || 0
    const fresh = (Date.now() - updatedAt) < SESSION_TTL_MS

    // Si el lock no es mío y está activo y fresco → expulsar
    if (serverSessionId !== mySessionId && active && fresh) {
      await safeReleaseAndSignOut()
    }
  })
}

onAuthStateChanged(auth, async (user) => {
  if (user) {
    if (isAuthPage()) {
      window.location.replace('./')
      return
    }
    mountHeader(user)
    watchLock(user)
    startHeartbeat(user)
    allowRender()

    // Protección extra al cerrar pestaña
    window.addEventListener('beforeunload', () => {
      // No confiable 100%, pero ayuda a marcar inactive
      const uid = user?.uid
      const mySessionId = localStorage.getItem('sessionId') || ''
      if (uid && mySessionId) {
        navigator.sendBeacon?.(
          '/__noop', // endpoint dummy (no hace falta que exista)
          '' // solo para disparar el evento de salida
        )
      }
    })
  } else {
    stopHeartbeat()
    if (!isAuthPage()) {
      window.location.replace('./login.html')
      return
    }
    allowRender()
  }
})
