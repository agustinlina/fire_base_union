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
const pinnedBar = document.getElementById('pinned-bar')

const filtroBtns = [filtroCamion, filtroAuto, filtroTodos]

let allData = []
let stockActual = 'cordoba'

// ====== Helpers generales ======
function normalizar (str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '')
}
function clean (str) {
  return String(str || '')
    .trim()
    .toUpperCase()
}
function splitCandidates (raw) {
  if (!raw) return []
  return String(raw)
    .split('/')
    .map(s => clean(s))
    .filter(Boolean)
}
function primaryCode (raw) {
  const parts = splitCandidates(raw)
  return parts[0] || ''
}
function codeKeysOne (raw) {
  const keys = new Set()
  function addVariants (base) {
    const c = clean(base)
    if (!c) return
    keys.add(c)
    const noSep = c.replace(/[\s\-_.]/g, '')
    keys.add(noSep)

    let m = /^T(\d+)$/.exec(noSep)
    if (m) {
      const num = (m[1] || '').replace(/^0+/, '') || '0'
      keys.add(num)
      keys.add('T' + num)
      return
    }
    m = /^([A-Z])(\d+)$/.exec(noSep)
    if (m) {
      const num = (m[2] || '').replace(/^0+/, '') || '0'
      keys.add(num)
    } else {
      m = /^(\d+)$/.exec(noSep)
      if (m) {
        const num = (m[1] || '').replace(/^0+/, '') || '0'
        keys.add(num)
        keys.add('T' + num)
      }
    }
  }
  addVariants(raw)
  const noSepRaw = clean(raw).replace(/[\s\-_.]/g, '')
  if (noSepRaw.endsWith('COPIA')) addVariants(noSepRaw.slice(0, -5))
  if (noSepRaw.startsWith('LANDE')) addVariants(noSepRaw.slice(5))
  return Array.from(keys)
}
function codeKeys (raw) {
  const parts = splitCandidates(raw)
  const out = []
  const seen = new Set()
  for (const p of parts) {
    for (const k of codeKeysOne(p))
      if (!seen.has(k)) {
        seen.add(k)
        out.push(k)
      }
  }
  return out
}
function canonicalKey (raw) {
  const p = primaryCode(raw)
  const variants = codeKeysOne(p)
  return variants[0] || clean(p) || ''
}
function cssEscape (s) {
  if (window.CSS && CSS.escape) return CSS.escape(s)
  return String(s).replace(/[^a-zA-Z0-9_\-]/g, ch => '\\' + ch)
}
function esCamionImportado (rubro) {
  const n = normalizar(rubro)
  return n === 'direccion' || n === 'traccion'
}
function esAutoImportado (rubro) {
  const n = normalizar(rubro)
  const exactos = [
    'touringh7',
    'royalcomfort',
    'royalmile',
    'royaleco',
    'transerenuseco'
  ]
  if (exactos.includes(n)) return true
  return n.startsWith('royal') || n.startsWith('trans')
}
function formatPrecio (n) {
  if (n === null || n === undefined || n === '' || Number.isNaN(Number(n)))
    return ''
  return '$ ' + Number(n).toLocaleString('es-AR')
}
function parseStock (s) {
  if (s === null || s === undefined) return 0
  if (typeof s === 'number' && !Number.isNaN(s)) return s
  const cleaned = String(s).replace(/\./g, '').replace(',', '.').trim()
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : 0
}
function shorten (t, max = 36) {
  const s = String(t || '').trim()
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

// ====== Toast copiar ======
let __copyToastTimer = null
function showCopied (text = 'Copiado') {
  const toast = document.getElementById('copy-toast')
  if (!toast) return
  toast.textContent = text
  toast.classList.add('show')
  clearTimeout(__copyToastTimer)
  __copyToastTimer = setTimeout(() => toast.classList.remove('show'), 1200)
}

async function writeToClipboard (payload) {
  try {
    await navigator.clipboard.writeText(payload)
    showCopied('Copiado')
  } catch (err) {
    try {
      const ta = document.createElement('textarea')
      ta.value = payload
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      showCopied('Copiado')
    } catch (e) {
      showCopied('No se pudo copiar')
      console.error('Error al copiar:', err)
    }
  }
}

// ====== Placeholder en tabla ======
function renderPlaceholder (message = 'Escribí para buscar') {
  tableBody.innerHTML = `
    <tr class="placeholder-row">
      <td colspan="5" style="text-align:center; opacity:.7; padding:16px;">${message}</td>
    </tr>`
}

// ====== Anclados ======
const pinned = new Map() // key -> { codigo, descripcion, precio, rubro, stock }
function renderPinnedBar () {
  if (!pinnedBar) return
  if (pinned.size === 0) {
    pinnedBar.classList.remove('show')
    pinnedBar.innerHTML = ''
    return
  }
  pinnedBar.classList.add('show')
  pinnedBar.innerHTML = Array.from(pinned.values())
    .map(it => {
      const price = formatPrecio(it.precio)
      return `
      <div class="pin-chip" data-key="${it.__key}">
        <span class="pin-icon">⚓</span>
        <span class="pin-desc">${shorten(it.descripcion, 34)}</span>
        ${price ? `<span class="pin-price" style="white-space: nowrap;!important">${price}</span>` : ''}
        <button class="remove" title="Quitar" style="color:red;">×</button>
      </div>`
    })
    .join('')

  // listeners para quitar
  pinnedBar.querySelectorAll('.pin-chip .remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.closest('.pin-chip')?.dataset?.key
      if (!key) return
      pinned.delete(key)
      renderPinnedBar()
      // actualizar estado de botones ⚓ en la tabla
      document
        .querySelectorAll(`.anchor-btn[data-key="${cssEscape(key)}"]`)
        .forEach(b => {
          b.classList.remove('active')
          b.setAttribute('aria-pressed', 'false')
          b.title = 'Anclar'
        })
    })
  })
}

function togglePin (item) {
  const key = canonicalKey(item?.codigo)
  if (!key) return
  if (pinned.has(key)) {
    pinned.delete(key)
  } else {
    pinned.set(key, { ...item, __key: key })
  }
  renderPinnedBar()
  // reflejar en todos los botones de esa key
  document
    .querySelectorAll(`.anchor-btn[data-key="${cssEscape(key)}"]`)
    .forEach(b => {
      const on = pinned.has(key)
      b.classList.toggle('active', on)
      b.setAttribute('aria-pressed', on ? 'true' : 'false')
      b.title = on ? 'Desanclar' : 'Anclar'
    })
}

// ====== Mini-menú / Modal responsive (popover en desktop, modal centrada en phone) ======
let anchorMenuOverlay = null
let anchorMenuPanel = null

function ensureAnchorMenu () {
  if (anchorMenuOverlay && anchorMenuPanel) return { overlay: anchorMenuOverlay, panel: anchorMenuPanel }

  // Overlay
  const overlay = document.createElement('div')
  overlay.id = 'anchor-menu-overlay'
  overlay.style.position = 'fixed'
  overlay.style.inset = '0'
  overlay.style.display = 'none'
  overlay.style.zIndex = '10000'
  overlay.style.background = 'transparent' // en desktop será transparente; en phone, semi
  overlay.style.alignItems = 'center'
  overlay.style.justifyContent = 'center'

  // Panel
  const panel = document.createElement('div')
  panel.id = 'anchor-menu-panel'
  panel.style.minWidth = '180px'
  panel.style.maxWidth = '92vw'
  panel.style.background = 'var(--background)'
  panel.style.border = '1px solid var(--card)'
  panel.style.borderRadius = '12px'
  panel.style.boxShadow = '0 10px 28px rgba(0,0,0,.45)'
  panel.style.padding = '6px'
  panel.style.display = 'flex'
  panel.style.flexDirection = 'column'
  panel.style.gap = '4px'

  panel.innerHTML = `
    <button data-action="copy" style="width:100%;text-align:left;background:none;border:0;color:var(--text);padding:10px 12px;border-radius:10px;">📋 Copiar cubierta</button>
    <button data-action="pin"  style="width:100%;text-align:left;background:none;border:0;color:var(--text);padding:10px 12px;border-radius:10px;">⚓ Anclar</button>
  `

  // Hover con --card
  panel.addEventListener('mouseover', e => {
    const b = e.target.closest('button')
    if (b) b.style.background = 'var(--card)'
  })
  panel.addEventListener('mouseout', e => {
    const b = e.target.closest('button')
    if (b) b.style.background = 'transparent'
  })

  overlay.appendChild(panel)
  document.body.appendChild(overlay)

  // cerrar con click fuera o ESC
  overlay.addEventListener('click', e => {
    if (e.target === overlay) hideAnchorMenu()
  })
  window.addEventListener('keydown', e => {
    if (overlay.style.display === 'flex' && e.key === 'Escape') hideAnchorMenu()
  })

  anchorMenuOverlay = overlay
  anchorMenuPanel = panel
  return { overlay, panel }
}

function showAnchorMenu (btn, { item, copyText }) {
  const { overlay, panel } = ensureAnchorMenu()
  const key = canonicalKey(item.codigo)
  overlay.dataset.key = key
  overlay.dataset.copy = copyText

  // label dinámico pin
  const isPinned = pinned.has(key)
  const pinBtn = panel.querySelector('[data-action="pin"]')
  pinBtn.textContent = isPinned ? '✖ Desanclar' : '⚓ Anclar'

  // Decide layout: phone (≤ 640) => modal centrada; desktop => popover cerca del botón
  const isPhone = window.innerWidth <= 640

  if (isPhone) {
    // Modal centrada
    overlay.style.background = 'rgba(0,0,0,.45)'
    overlay.style.display = 'flex'
    panel.style.position = 'static'
    panel.style.transform = 'none'
  } else {
    // Popover anclado al botón
    overlay.style.background = 'transparent'
    overlay.style.display = 'block' // solo para “contener” el panel y cerrar al click fuera
    const r = btn.getBoundingClientRect()
    const margin = 6
    panel.style.position = 'fixed'
    panel.style.left = Math.min(window.innerWidth - panel.offsetWidth - 8, Math.max(8, r.left)) + 'px'
    panel.style.top = (r.bottom + margin) + 'px'
    panel.style.transform = 'none'
  }

  // manejar acciones
  panel.onclick = e => {
    const actionBtn = e.target.closest('button[data-action]')
    if (!actionBtn) return
    const action = actionBtn.dataset.action
    const key = overlay.dataset.key
    const copy = overlay.dataset.copy || ''
    hideAnchorMenu()
    if (action === 'copy') {
      writeToClipboard(copy)
      return
    }
    if (action === 'pin') {
      const it = (tableBody._lastRowMap && tableBody._lastRowMap.get(key)) || item
      togglePin(it)
    }
  }
}

function hideAnchorMenu () {
  if (!anchorMenuOverlay) return
  anchorMenuOverlay.style.display = 'none'
}

// ====== Render tabla ======
function renderTable (data) {
  tableBody.innerHTML = ''
  if (!data || data.length === 0) {
    renderPlaceholder('Sin resultados. Refiná tu búsqueda.')
    return
  }

  const rowItemByKey = new Map()

  data.forEach(item => {
    const tr = document.createElement('tr')
    tr.classList.add('copy-row')
    tr.tabIndex = 0

    const codigoDisplay = primaryCode(item.codigo)
    const precioFmt = formatPrecio(item.precio)
    const stockNum = parseStock(item.stock)
    const stockDisplay = stockNum > 100 ? 100 : stockNum
    const key = canonicalKey(item.codigo)

    const copyText = [codigoDisplay, item.descripcion || '', precioFmt]
      .filter(Boolean).join(' ').trim()

    tr.dataset.copy = copyText
    tr.dataset.key = key

    const anchorBtnHTML = `
      <button class="anchor-btn ${pinned.has(key) ? 'active' : ''}" 
              title="${pinned.has(key) ? 'Desanclar' : 'Anclar'}" 
              aria-pressed="${pinned.has(key) ? 'true' : 'false'}"
              data-key="${key}"><img src="./media/3dots.png"></button>`

    tr.innerHTML = `
      <td class="descycode"><span>${item.descripcion || ''}</span><span style="height:16px"></span><span style="font-size:12px">Código:<code> ${item.codigo}</code></span></td>
      <td>${item.rubro || ''}</td>
      <td>${stockDisplay}</td>
      <td style="white-space: nowrap;">${precioFmt}${anchorBtnHTML}</td>
    `
    tableBody.appendChild(tr)

    rowItemByKey.set(key, { ...item })
  })

  if (!tableBody.__delegated) {
    tableBody.__delegated = true

    // Click
    tableBody.addEventListener('click', e => {
      const anchorBtn = e.target.closest('.anchor-btn')
      if (anchorBtn) {
        e.stopPropagation()
        const k = anchorBtn.dataset.key
        const row = anchorBtn.closest('tr')
        const copyText = row?.dataset?.copy || ''
        const it =
          (tableBody._lastRowMap && tableBody._lastRowMap.get(k)) ||
          { codigo: k, descripcion: row?.querySelector('td')?.innerText || '', precio: null }
        showAnchorMenu(anchorBtn, { item: it, copyText })
        return
      }

      const tr = e.target.closest('tr')
      if (!tr || !tr.dataset.copy) return
      tr.classList.remove('copy-flash'); void tr.offsetWidth; tr.classList.add('copy-flash')
      writeToClipboard(tr.dataset.copy)
      tr.focus?.()
    })

    // Teclado (Enter o Espacio) = copiar; M = abrir menú
    tableBody.addEventListener('keydown', e => {
      const tr = e.target.closest('tr.copy-row')
      if (!tr) return
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        tr.classList.remove('copy-flash'); void tr.offsetWidth; tr.classList.add('copy-flash')
        writeToClipboard(tr.dataset.copy || '')
      }
      if (e.key.toLowerCase() === 'm') {
        const btn = tr.querySelector('.anchor-btn')
        if (btn) {
          const k = tr.dataset.key
          const it =
            (tableBody._lastRowMap && tableBody._lastRowMap.get(k)) ||
            { codigo: k, descripcion: tr.querySelector('td')?.innerText || '', precio: null }
          showAnchorMenu(btn, { item: it, copyText: tr.dataset.copy || '' })
        }
      }
    })

    // Re-posicionar/convertir menú al cambiar tamaño (si está abierto)
    window.addEventListener('resize', () => {
      if (!anchorMenuOverlay || anchorMenuOverlay.style.display === 'none') return
      hideAnchorMenu()
    })
  }

  tableBody._lastRowMap = rowItemByKey
}

// ====== Filtros ======
function setActiveBtn (btn) {
  filtroBtns.forEach(b => b && b.classList.remove('active'))
  if (btn) btn.classList.add('active')
}
function aplicarFiltros () {
  const valor = buscador.value.trim().toLowerCase()
  if (!valor) {
    renderPlaceholder('Utiliza la barra de búsqueda para ver resultados')
    return
  }

  let datos = [...allData]
  if (window.filtroActivo === 'camion')
    datos = datos.filter(it => esCamionImportado(it.rubro))
  else if (window.filtroActivo === 'auto')
    datos = datos.filter(it => esAutoImportado(it.rubro))

  datos = datos.filter(
    it =>
      (it.codigo && String(it.codigo).toLowerCase().includes(valor)) ||
      (it.descripcion && it.descripcion.toLowerCase().includes(valor))
  )
  renderTable(datos)
}

// ====== Carga y merge ======
function mergeStocksSum (arrA, arrB) {
  const map = new Map()
  function upsert (it) {
    const key = canonicalKey(it?.codigo)
    if (!key) return
    const curr = map.get(key)
    const stockNum = parseStock(it?.stock)
    if (!curr) map.set(key, { ...it, stock: stockNum })
    else {
      curr.stock = parseStock(curr.stock) + stockNum
      if (!curr.descripcion && it.descripcion) curr.descripcion = it.descripcion
      if (!curr.rubro && it.rubro) curr.rubro = it.rubro
    }
  }
  ;(Array.isArray(arrA) ? arrA : []).forEach(upsert)
  ;(Array.isArray(arrB) ? arrB : []).forEach(upsert)
  return Array.from(map.values())
}

async function cargarDatos (stock) {
  loading && (loading.style.display = '')
  if (error) error.textContent = ''
  window.filtroActivo = null
  setActiveBtn(null)

  try {
    const pricesPromise = fetch(PRICES_URL).then(r => r.json())

    let dataStock
    if (stock === 'cordoba') {
      const [dataCba, dataPolo] = await Promise.all([
        fetch(ENDPOINTS.cordoba).then(r => r.json()),
        fetch(ENDPOINTS.polo).then(r => r.json())
      ])
      dataStock = mergeStocksSum(dataCba, dataPolo)
    } else {
      dataStock = await fetch(ENDPOINTS[stock]).then(r => r.json())
    }

    const dataPrices = await pricesPromise

    const priceMap = new Map()
    ;(Array.isArray(dataPrices) ? dataPrices : []).forEach(p => {
      const precio = p?.precio ?? null
      codeKeysOne(p?.codigo).forEach(k => {
        if (!priceMap.has(k)) priceMap.set(k, precio)
      })
    })

    allData = (Array.isArray(dataStock) ? dataStock : []).map(item => {
      const keys = codeKeys(item?.codigo)
      let precio = null
      for (const k of keys)
        if (priceMap.has(k)) {
          precio = priceMap.get(k)
          break
        }
      return { ...item, precio }
    })

    if (loading) loading.style.display = 'none'
    aplicarFiltros()
  } catch (err) {
    console.error('Error al cargar datos:', err)
    if (loading) loading.style.display = 'none'
    if (error) error.textContent = 'Error al cargar datos'
    renderPlaceholder('No pudimos cargar los datos.')
  }
}

// ====== Listeners ======
buscador && buscador.addEventListener('input', aplicarFiltros)
filtroCamion &&
  filtroCamion.addEventListener('click', () => {
    window.filtroActivo = 'camion'
    setActiveBtn(filtroCamion)
    aplicarFiltros()
  })
filtroAuto &&
  filtroAuto.addEventListener('click', () => {
    window.filtroActivo = 'auto'
    setActiveBtn(filtroAuto)
    aplicarFiltros()
  })
filtroTodos &&
  filtroTodos.addEventListener('click', () => {
    window.filtroActivo = null
    setActiveBtn(filtroTodos)
    aplicarFiltros()
  })
stockSelect &&
  stockSelect.addEventListener('change', e => {
    stockActual = e.target.value
    cargarDatos(stockActual)
  })

// ====== Inicial ======
window.addEventListener('DOMContentLoaded', () => {
  setActiveBtn(filtroTodos)
  renderPlaceholder('Utiliza la barra de busqueda para en encontrar cubiertas')
  renderPinnedBar()
  cargarDatos(stockActual)
})
