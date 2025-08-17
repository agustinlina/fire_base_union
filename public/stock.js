// stock.js

const ENDPOINTS = {
  olavarria:
    'https://corsproxy.io/?https://api-stock-live.vercel.app/api/stock_olav',
  cordoba:
    'https://corsproxy.io/?https://api-stock-live.vercel.app/api/stock_cba',
  polo: 'https://corsproxy.io/?https://api-stock-live.vercel.app/api/stock_polo'
}

// Endpoint de precios (via proxy CORS)
const PRICES_URL =
  'https://corsproxy.io/?https://api-prices-nu.vercel.app/api/prices'

const tableBody = document.querySelector('#stock-table tbody')
const loading = document.getElementById('loading')
const error = document.getElementById('error')
const buscador = document.getElementById('buscador')
const filtroCamion = document.getElementById('filtro-camion')
const filtroAuto = document.getElementById('filtro-auto')
const filtroTodos = document.getElementById('filtro-todos')
const stockSelect = document.getElementById('stock-select')
const filtroBtns = [filtroCamion, filtroAuto, filtroTodos]

let allData = []
let stockActual = 'cordoba'

// -------------------- Utilidades --------------------

function normalizar (str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '')
}

function clean (str) {
  return String(str || '').trim().toUpperCase()
}

// Divide "A/B/C" en ["A","B","C"]
function splitCandidates (raw) {
  if (!raw) return []
  return String(raw)
    .split('/')
    .map(s => clean(s))
    .filter(Boolean)
}

// Primer código visible/copiable
function primaryCode (raw) {
  const parts = splitCandidates(raw)
  return parts[0] || ''
}

/**
 * Variantes equivalentes para un único código.
 * Cubre: quitar separadores, T#### ↔ ####, letra+num → num, y normaliza ceros.
 */
function codeKeysOne (raw) {
  const c = clean(raw)
  const keys = new Set([c])

  const noSep = c.replace(/[\s\-_.]/g, '')
  if (noSep !== c) keys.add(noSep)

  // T + dígitos
  let m = /^T(\d+)$/.exec(c)
  if (m) {
    const num = (m[1] || '').replace(/^0+/, '') || '0'
    keys.add(num)
    keys.add('T' + num)
    return Array.from(keys)
  }

  // Letra + dígitos
  m = /^([A-Z])(\d+)$/.exec(c)
  if (m) {
    const num = (m[2] || '').replace(/^0+/, '') || '0'
    keys.add(num)
  } else {
    // Solo dígitos
    m = /^(\d+)$/.exec(c)
    if (m) {
      const num = (m[1] || '').replace(/^0+/, '') || '0'
      keys.add(num)
      keys.add('T' + num)
    }
  }

  return Array.from(keys)
}

/**
 * Claves en orden de prioridad para un campo "F42 / F68".
 * Primero F42 (con sus variantes), luego F68, etc.
 */
function codeKeys (raw) {
  const parts = splitCandidates(raw)
  const out = []
  const seen = new Set()
  for (const p of parts) {
    for (const k of codeKeysOne(p)) {
      if (!seen.has(k)) {
        seen.add(k)
        out.push(k)
      }
    }
  }
  return out
}

// Clave canónica de un item para fusionar (la primera variante del primer código)
function canonicalKey (raw) {
  const p = primaryCode(raw)
  const variants = codeKeysOne(p)
  return variants[0] || clean(p) || ''
}

function esCamionImportado (rubro) {
  const normal = normalizar(rubro)
  return normal === 'direccion' || normal === 'traccion'
}

function esAutoImportado (rubro) {
  const normal = normalizar(rubro)
  const exactos = [
    'touringh7',
    'royalcomfort',
    'royalmile',
    'royaleco',
    'transerenuseco'
  ]
  if (exactos.includes(normal)) return true
  return normal.startsWith('royal') || normal.startsWith('trans')
}

function formatPrecio (n) {
  if (n === null || n === undefined || n === '' || Number.isNaN(Number(n)))
    return ''
  return '$ ' + Number(n).toLocaleString('es-AR')
}

// Convierte campo stock a número seguro
function parseStock (s) {
  if (s === null || s === undefined) return 0
  if (typeof s === 'number' && !Number.isNaN(s)) return s
  const cleaned = String(s).replace(/\./g, '').replace(',', '.').trim()
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : 0
}

// -------------------- Render --------------------

function renderTable (data) {
  tableBody.innerHTML = ''
  if (!data || data.length === 0) return

  data.forEach(item => {
    const tr = document.createElement('tr')

    const codigoDisplay = primaryCode(item.codigo)
    const buttonHTML = `
      <button 
        class="copy-btn" 
        title="Copiar código: ${codigoDisplay}" 
        data-codigo="${codigoDisplay}"
        style="background:none;border:none;cursor:pointer;padding:0;">
        <img width="18px" src="./media/content-copy.svg" alt="Copiar">
      </button>
    `

    tr.innerHTML = `
      <td>${buttonHTML} ${item.descripcion || ''}</td>
      <td>${item.rubro || ''}</td>
      <td>${item.stock ?? ''}</td>
      <td style="white-space: nowrap;">${formatPrecio(item.precio)}</td>
    `

    tableBody.appendChild(tr)
  })

  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const codigo = btn.getAttribute('data-codigo')
      navigator.clipboard
        .writeText(codigo)
        .then(() => console.log(`Código ${codigo} copiado al portapapeles`))
        .catch(err => console.error('Error al copiar:', err))
    })
  })
}

// -------------------- Filtros --------------------

function setActiveBtn (btn) {
  filtroBtns.forEach(b => b.classList.remove('active'))
  if (btn) btn.classList.add('active')
}

function aplicarFiltros () {
  // Si el buscador está vacío, NO mostramos nada
  const valor = buscador.value.trim().toLowerCase()
  if (!valor) {
    renderTable([])
    return
  }

  let datos = [...allData]

  if (window.filtroActivo === 'camion') {
    datos = datos.filter(item => esCamionImportado(item.rubro))
  } else if (window.filtroActivo === 'auto') {
    datos = datos.filter(item => esAutoImportado(item.rubro))
  }

  datos = datos.filter(
    item =>
      (item.codigo && String(item.codigo).toLowerCase().includes(valor)) ||
      (item.descripcion && item.descripcion.toLowerCase().includes(valor))
  )

  renderTable(datos)
}

// -------------------- Carga y Merge --------------------

// Fusiona arrays de stock sumando "stock" cuando coinciden por canonicalKey
function mergeStocksSum (arrA, arrB) {
  const map = new Map()

  function upsert (it) {
    const key = canonicalKey(it?.codigo)
    if (!key) return
    const curr = map.get(key)
    const stockNum = parseStock(it?.stock)

    if (!curr) {
      // guardamos el primero que aparece
      map.set(key, { ...it, stock: stockNum })
    } else {
      // sumamos stock y completamos descripciones vacías si hace falta
      curr.stock = parseStock(curr.stock) + stockNum
      if (!curr.descripcion && it.descripcion) curr.descripcion = it.descripcion
      if (!curr.rubro && it.rubro) curr.rubro = it.rubro
      // mantener el "codigo" visible como el primer código original
      // (sin cambios)
    }
  }

  ;(Array.isArray(arrA) ? arrA : []).forEach(upsert)
  ;(Array.isArray(arrB) ? arrB : []).forEach(upsert)

  return Array.from(map.values())
}

async function cargarDatos (stock) {
  loading.style.display = ''
  error.textContent = ''
  window.filtroActivo = null
  setActiveBtn(null)

  try {
    // 1) Traer precios siempre
    const pricesPromise = fetch(PRICES_URL).then(r => r.json())

    let dataStock

    if (stock === 'cordoba') {
      // 2) Córdoba unificado: Córdoba + Polo (sumando duplicados)
      const [dataCba, dataPolo] = await Promise.all([
        fetch(ENDPOINTS.cordoba).then(r => r.json()),
        fetch(ENDPOINTS.polo).then(r => r.json())
      ])
      dataStock = mergeStocksSum(dataCba, dataPolo)
    } else {
      // 2) Cualquier otro depósito: tal cual
      dataStock = await fetch(ENDPOINTS[stock]).then(r => r.json())
    }

    const dataPrices = await pricesPromise

    // 3) Construir mapa de precios por variantes
    const priceMap = new Map()
    ;(Array.isArray(dataPrices) ? dataPrices : []).forEach(p => {
      const precio = p?.precio ?? null
      codeKeysOne(p?.codigo).forEach(k => {
        if (!priceMap.has(k)) priceMap.set(k, precio)
      })
    })

    // 4) Merge de precios por orden de prioridad de claves
    allData = (Array.isArray(dataStock) ? dataStock : []).map(item => {
      const keys = codeKeys(item?.codigo)
      let precio = null
      for (const k of keys) {
        if (priceMap.has(k)) {
          precio = priceMap.get(k)
          break
        }
      }
      return { ...item, precio }
    })

    loading.style.display = 'none'
    aplicarFiltros() // solo muestra si hay búsqueda
  } catch (err) {
    console.error('Error al cargar datos:', err)
    loading.style.display = 'none'
    error.textContent = 'Error al cargar datos'
    renderTable([]) // asegurar tabla vacía en error
  }
}

// -------------------- Listeners --------------------

buscador.addEventListener('input', aplicarFiltros)

filtroCamion.addEventListener('click', () => {
  window.filtroActivo = 'camion'
  setActiveBtn(filtroCamion)
  aplicarFiltros()
})

filtroAuto.addEventListener('click', () => {
  window.filtroActivo = 'auto'
  setActiveBtn(filtroAuto)
  aplicarFiltros()
})

filtroTodos.addEventListener('click', () => {
  window.filtroActivo = null
  setActiveBtn(filtroTodos)
  aplicarFiltros()
})

stockSelect.addEventListener('change', e => {
  stockActual = e.target.value
  cargarDatos(stockActual)
})

// Inicial
window.addEventListener('DOMContentLoaded', () => {
  setActiveBtn(filtroTodos)
  renderTable([])     // tabla vacía de entrada
  cargarDatos(stockActual)
})
