// public/login.js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js'
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js'
import {
  getFirestore, doc, runTransaction, serverTimestamp
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

// --- UI ---
const form = document.getElementById('login-form')
const emailInput = document.getElementById('email')
const passwordInput = document.getElementById('password')
const msg = document.getElementById('msg')

// Si ya hay sesión, al home
onAuthStateChanged(auth, (user) => {
  if (user) window.location.replace('./')
})

function makeSessionId () {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

// Consideramos "activa" si tuvo heartbeat en los últimos N ms
const SESSION_TTL_MS = 2 * 60 * 1000; // 2 minutos

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  msg.style.display = 'none'
  try {
    const email = emailInput.value.trim()
    const password = passwordInput.value

    const cred = await signInWithEmailAndPassword(auth, email, password)
    const uid = cred.user.uid
    const sessionId = makeSessionId()

    // Guardamos temporalmente por si logramos tomar el lock
    localStorage.setItem('sessionId', sessionId)

    // Intentar tomar el "lock" en Firestore: si existe y está fresco → denegar
    await runTransaction(db, async (tx) => {
      const ref = doc(db, 'userSessions', uid)
      const snap = await tx.get(ref)

      const now = Date.now()
      if (snap.exists()) {
        const data = snap.data() || {}
        const serverSessionId = data.sessionId || ''
        const updatedAt = data.updatedAt?.toMillis?.() || 0
        const fresh = (now - updatedAt) < SESSION_TTL_MS
        const active = data.active === true

        // Si hay una sesión activa y fresca que NO es la mía → denegar
        if (active && fresh && serverSessionId && serverSessionId !== sessionId) {
          throw new Error('LOCK_HELD') // otro conectado
        }
      }

      // Tomar/renovar lock para esta sesión
      tx.set(ref, {
        sessionId,
        active: true,
        updatedAt: serverTimestamp()
      }, { merge: true })
    })

    // Lock tomado → entrar
    window.location.replace('./')
  } catch (err) {
    // Si falló por lock, cerrar auth (estaba autenticado pero sin lock)
    if (err && err.message === 'LOCK_HELD') {
      try { await signOut(auth) } catch {}
      msg.textContent = 'Actualmente hay alguien conectado con ese usuario.'
    } else {
      msg.textContent = err?.message || 'Error al iniciar sesión'
    }
    msg.style.display = 'block'
    localStorage.removeItem('sessionId') // limpiar si no conseguimos lock
  }
})
