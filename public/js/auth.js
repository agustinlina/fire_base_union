;(function () {
  // Detectar si estamos en /login o /login.html
  var path = location.pathname
  var isLogin = /\/login(?:\.html)?$/.test(path)

  // Cargar sesión
  var raw = null,
    session = null
  try {
    raw = localStorage.getItem('sessionUser')
    session = raw ? JSON.parse(raw) : null
  } catch (e) {
    session = null
  }

  // Construir URL absoluta de login
  var loginURL = new URL('/login.html', window.location.origin).toString()

  // Si NO hay sesión y NO es login -> redirigimos YA
  if (!session && !isLogin) {
    try {
      sessionStorage.setItem(
        'nextAfterLogin',
        location.pathname + location.search
      )
    } catch {}
    location.replace(loginURL)
    return
  }

  // Si HAY sesión y estamos en login -> volver a donde quería ir o al home
  if (session && isLogin) {
    var next = sessionStorage.getItem('nextAfterLogin') || '/'
    try {
      sessionStorage.removeItem('nextAfterLogin')
    } catch {}
    location.replace(next)
    return
  }

  // Mostrar documento
  try {
    document.documentElement.style.visibility = 'visible'
  } catch (e) {}

  // ---------- NUEVO HEADER ----------
  if (session && !isLogin) {
    // Usuario (izquierda)
    var userBox = document.createElement('div')
    userBox.style.display = 'flex'
    userBox.style.alignItems = 'center'
    userBox.style.gap = '8px'
    userBox.style.color = 'rgb(60, 146, 231)'
    userBox.style.fontWeight = '600'

    var userImg = new Image()
    userImg.src = './media/account.svg'
    userImg.alt = 'Usuario'
    userImg.style.width = '26px'
    userImg.style.height = '26px'
    userImg.style.pointerEvents = 'none'

    var userName = document.createElement('span')
    var usuario = (session && session.usuario) ? String(session.usuario).trim() : 'Usuario'
    userName.textContent = usuario

    userBox.appendChild(userImg)
    userBox.appendChild(userName)

    // Botón cerrar sesión (derecha)
    var btn = document.createElement('button')
    btn.style.display = 'flex'
    btn.style.alignItems = 'center'
    btn.style.gap = '6px'
    btn.style.padding = '4px 8px'
    btn.style.border = '2px solid rgb(60, 146, 231)'
    btn.style.borderRadius = '8px'
    btn.style.backgroundColor = 'transparent'
    btn.style.color = 'rgb(60, 146, 231)'
    btn.style.cursor = 'pointer'
    btn.style.outline = 'none'

    var exitImg = new Image()
    exitImg.src = './media/exit.svg'
    exitImg.alt = 'Cerrar sesión'
    exitImg.style.height = '20px'
    exitImg.style.width = '20px'
    exitImg.style.pointerEvents = 'none'

    var text = document.createElement('span')
    text.textContent = 'Cerrar sesión'

    btn.appendChild(exitImg)
    btn.appendChild(text)

    btn.addEventListener('mouseenter', function () {
      btn.style.color = 'rgb(100, 146, 231)'
      btn.style.borderColor = 'rgb(100, 146, 231)'
      exitImg.style.opacity = '0.75'
    })
    btn.addEventListener('mouseleave', function () {
      btn.style.color = 'rgb(60, 146, 231)'
      btn.style.borderColor = 'rgb(60, 146, 231)'
      exitImg.style.opacity = '1'
    })
    btn.addEventListener('click', function () {
      try { localStorage.removeItem('sessionUser') } catch {}
      try { sessionStorage.removeItem('nextAfterLogin') } catch {}
      location.replace(loginURL)
    })

    function mount () {
      var wrap = document.getElementById('session-wrap')
      if (!wrap) {
        wrap = document.createElement('div')
        wrap.id = 'session-wrap'
        wrap.className = 'w-100 d-flex justify-content-between align-items-center'
        wrap.style.backgroundColor = 'transparent'
        wrap.style.borderBottom = '1px solid hsl(210, 59%, 72%, 20%)'
        wrap.style.padding = '6px 10px'
        wrap.style.minHeight = '44px'
        document.body.prepend(wrap)
      }
      wrap.innerHTML = ''
      wrap.appendChild(userBox)
      wrap.appendChild(btn)
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mount)
    } else {
      mount()
    }
  }
})()
