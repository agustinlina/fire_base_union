// public/login.js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js'
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js'
import { getFirestore, doc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js'

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

// Si ya hay sesión, mandá al home
onAuthStateChanged(auth, (user) => {
  if (user) {
    window.location.replace('./')
  }
})

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

    const cred = await signInWithEmailAndPassword(auth, email, password)

    // Generar y guardar sessionId local + publicar en Firestore
    const sessionId = makeSessionId()
    localStorage.setItem('sessionId', sessionId)

    await setDoc(
      doc(db, 'userSessions', cred.user.uid),
      { sessionId, updatedAt: serverTimestamp() },
      { merge: true }
    )

    // Ir al home (replace para no volver con "atrás")
    window.location.replace('./')
  } catch (err) {
    msg.textContent = err.message || 'Error al iniciar sesión'
    msg.style.display = 'block'
  }
})
