import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js'
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js'

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

function allowRender () { document.documentElement.classList.remove('auth-pending') }

function mountHeader (user) {
  const header = document.getElementById('auth-header')
  if (!header) return
  header.innerHTML = `
    <div class="d-flex justify-content-between align-items-center p-2 bg-dark text-light">
      <span>Hola, <b>${user.email}</b></span>
      <button id="logout" class="btn btn-sm btn-danger">Cerrar sesión</button>
    </div>`
  document.getElementById('logout')?.addEventListener('click', async () => {
    await signOut(auth)
    window.location.replace('/login.html')
  })
}

onAuthStateChanged(auth, (user) => {
  const path = location.pathname
  const isAuthPage = path.endsWith('/login.html') || path.endsWith('/register.html')

  if (user) {
    if (isAuthPage) {
      // si ya está logueado y entra a login/register, mandalo al home
      window.location.replace('/')
      return
    }
    mountHeader(user)
    allowRender()
  } else {
    if (!isAuthPage) {
      window.location.replace('/login.html')
      return
    }
    allowRender() // en login/register sí mostramos
  }
})
