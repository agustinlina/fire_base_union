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

function makeSessionId () {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

// Traductor de errores de Firebase Auth → mensajes en español
function traducirErrorAuth (err) {
  const code = (err && err.code) || ''
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials': // algunas versiones usan este
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Usuario o contraseña incorrectos.'
    case 'auth/invalid-email':
      return 'El correo electrónico no es válido.'
    case 'auth/too-many-requests':
      return 'Demasiados intentos. Intenta nuevamente más tarde.'
    case 'auth/network-request-failed':
      return 'Error de red. Revisa tu conexión a Internet.'
    default:
      return 'No se pudo iniciar sesión.'
  }
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

      if (snap.exists()) {
        const data = snap.data() || {}
        const serverSessionId = data.sessionId || ''
        const active = !!data.active

        // Si ya hay una sesión activa → BLOQUEAR
        if (active && serverSessionId) {
          throw new Error('LOCK_HELD')
        }
      }

      // Tomo el lock para mí
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
      // Caso de “usuario en uso”
      try { await signOut(auth) } catch {}
      msg.textContent = 'Actualmente hay alguien conectado con ese usuario.'
    } else {
      // Errores de credenciales, email inválido, etc.
      msg.textContent = traducirErrorAuth(err)
    }
    msg.style.display = 'block'
    localStorage.removeItem('sessionId')
  }
})
