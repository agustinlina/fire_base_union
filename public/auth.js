// public/auth.js
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

// Mostrar UI segura
function allowRender() {
  document.documentElement.classList.remove('auth-pending')
}

// Inyecta header con usuario y logout
function mountHeader(user) {
  const header = document.getElementById('auth-header')
  if (!header) return
  header.innerHTML = `
    <div class="d-flex justify-content-between align-items-center p-2 bg-dark text-light">
      <span>Hola, <b>${user.email}</b></span>
      <button id="logout" class="btn btn-sm btn-danger">Cerrar sesión</button>
    </div>
  `
  document.getElementById('logout')?.addEventListener('click', async () => {
    await signOut(auth)
    // Tras cerrar sesión, volvemos al login
    window.location.replace('/login.html')
  })
}

// Escucha cambios de auth
onAuthStateChanged(auth, (user) => {
  if (user) {
    mountHeader(user)
    allowRender()
  } else {
    // Si estoy en una página protegida, redirijo al login
    if (!location.pathname.endsWith('/login.html')) {
      window.location.replace('/login.html')
    } else {
      // en la página de login sí permitimos renderizar
      allowRender()
    }
  }
})
