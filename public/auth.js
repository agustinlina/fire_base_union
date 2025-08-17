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

let unsubSession = null

function allowRender () {
  document.documentElement.classList.remove('auth-pending')
}

function mountHeader (user) {
  const header = document.getElementById('auth-header')
  if (!header) return
  header.innerHTML = `
    <div class="d-flex justify-content-between align-items-center p-2 bg-dark text-light">
      <span>Hola, <b>${user.email}</b></span>
      <button id="logout" class="btn btn-sm btn-danger">Cerrar sesión</button>
    </div>
  `
  document.getElementById('logout')?.addEventListener('click', async () => {
    try { await signOut(auth) } finally {
      window.location.replace('./login.html')
    }
  })
}

async function handleKickIfSessionChanged(user) {
  // Escucha el doc de sesión y compara
  const mySessionId = localStorage.getItem('sessionId') || ''
  const ref = doc(db, 'userSessions', user.uid)

  if (unsubSession) unsubSession()
  unsubSession = onSnapshot(ref, async (snap) => {
    const serverSessionId = snap.exists() ? snap.data()?.sessionId : null
    if (!serverSessionId) return // aún no seteado

    if (serverSessionId !== mySessionId) {
      // Mi pestaña/dispositivo ya no es la sesión activa → cerrar
      await signOut(auth).catch(() => {})
      // Mensaje opcional
      const url = new URL('./login.html', location.href)
      url.searchParams.set('msg', 'Tu cuenta se abrió en otro dispositivo.')
      window.location.replace(url.toString())
    }
  })
}

onAuthStateChanged(auth, (user) => {
  const path = location.pathname
  const isAuthPage = path.endsWith('/login.html') || path.endsWith('/register.html')

  if (user) {
    if (isAuthPage) {
      window.location.replace('./')
      return
    }
    mountHeader(user)
    handleKickIfSessionChanged(user)
    allowRender()
  } else {
    if (!isAuthPage) {
      window.location.replace('./login.html')
      return
    }
    allowRender()
  }
})
