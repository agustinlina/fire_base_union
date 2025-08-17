import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js'
import { getAuth, signInWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js'
import { getFirestore, doc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js'

// Config
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

const form = document.getElementById('login-form')
const emailInput = document.getElementById('email')
const passwordInput = document.getElementById('password')
const msg = document.getElementById('msg')

function makeSessionId() {
  // id corto aleatorio (podés usar crypto si el navegador lo soporta)
  return (crypto?.randomUUID?.() || Math.random().toString(36).slice(2)) + Date.now().toString(36)
}

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  msg.style.display = 'none'
  try {
    const email = emailInput.value.trim()
    const password = passwordInput.value
    const cred = await signInWithEmailAndPassword(auth, email, password)

    // Generar e informar sessionId a Firestore
    const sessionId = makeSessionId()
    localStorage.setItem('sessionId', sessionId)

    await setDoc(
      doc(db, 'userSessions', cred.user.uid),
      { sessionId, updatedAt: serverTimestamp() },
      { merge: true }
    )

    // Ir al home (replace para no volver con “atrás”)
    window.location.replace('./')
  } catch (err) {
    msg.textContent = err.message
    msg.style.display = 'block'
  }
})
