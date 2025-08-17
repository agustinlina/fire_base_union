import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js'
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js'

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
  try {
    await signInWithEmailAndPassword(auth, emailInput.value.trim(), passwordInput.value)

    // Leer claim de sesión que puso la blocking function
    const t = await auth.currentUser.getIdTokenResult(true)
    const sid = t.claims?.sessionId
    if (sid) localStorage.setItem('sessionId', sid)

    window.location.replace('./')
  } catch (err) {
    const txt = String(err?.message || '').toLowerCase()
    if (txt.includes('usuario en uso') || txt.includes('already-exists')) {
      msg.textContent = 'Usuario en uso (ya hay una sesión activa con este correo).'
    } else {
      msg.textContent = 'No se pudo iniciar sesión.'
    }
    msg.style.display = 'block'
    localStorage.removeItem('sessionId')
  }
})
