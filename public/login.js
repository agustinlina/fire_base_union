// public/login.js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js'
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js'
import { getFirestore, doc, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js'

// ---------- CONFIG ----------
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

// ---------- UI ----------
const form = document.getElementById('login-form')
const emailInput = document.getElementById('email')
const passwordInput = document.getElementById('password')
const msg = document.getElementById('msg')

// Si ya hay sesión, ir al home
onAuthStateChanged(auth, (user) => {
  if (user) window.location.replace('./')
})

// Tiempo que consideramos una sesión "activa/fresca"
const SESSION_TTL_MS = 2 * 60 * 1000 // 2 minutos

function makeSessionId () {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  msg.style.display = 'none'

  try {
    const email = emailInput.value.trim()
    const password = passwordInput.value

    // 1) Autenticar
    const cred = await signInWithEmailAndPassword(auth, email, password)
    const uid = cred.user.uid

    // 2) Intentar tomar lock en transacción (ANTES de escribir nada)
    const mySessionId = makeSessionId()

    await runTransaction(db, async (tx) => {
      const ref = doc(db, 'userSessions', uid)
      const snap = await tx.get(ref)

      const now = Date.now()
      if (snap.exists()) {
        const data = snap.data() || {}
        const updatedAt = data.updatedAt?.toMillis?.() || 0
        const fresh = (now - updatedAt) < SESSION_TTL_MS
        const active = !!data.active
        const serverSessionId = data.sessionId || ''

        // Si hay otra sesión activa y fresca distinta de la mía → BLOQUEAR
        if (active && fresh && serverSessionId) {
          throw new Error('LOCK_HELD')
        }
      }

      // Si no hay lock activo (o está vencido), tomarlo para mí
      tx.set(ref, {
        sessionId: mySessionId,
        active: true,
        updatedAt: serverTimestamp()
      }, { merge: true })
    })

    // 3) Guardar mi sessionId local y entrar
    localStorage.setItem('sessionId', mySessionId)
    window.location.replace('./')
  } catch (err) {
    if (err && err.message === 'LOCK_HELD') {
      // Había alguien conectado → me deslogueo y muestro aviso
      try { await signOut(auth) } catch {}
      msg.textContent = 'Actualmente hay alguien conectado con ese usuario.'
    } else {
      msg.textContent = err?.message || 'Error al iniciar sesión'
    }
    msg.style.display = 'block'
    localStorage.removeItem('sessionId')
  }
})
