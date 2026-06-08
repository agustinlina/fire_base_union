// stock.js

// ====== Dólar tomado únicamente desde Excel ======
// Se lee desde ofertas.xlsx:
// A1: dolar
// A2: valor del dólar
let DOLAR_TOTAL = 0

function withCacheBuster (url) {
  const u = new URL(url, window.location.href)
  u.searchParams.set('_ts', Date.now().toString())
  return u.toString()
}

async function fetchJson (url) {
  const finalUrl = withCacheBuster(url)

  const res = await fetch(finalUrl, {
    cache: 'no-store',
    credentials: 'omit',
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0'
    }
  })

  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
  return await res.json()
}

// ====== Stock desde CSV ======
// El archivo debe estar en public/stock.csv
const STOCK_CSV_URLS = [
  './stock.csv',
  './Stock.csv',
  './STOCK.csv',
  '/stock.csv',
  '/Stock.csv',
  '/STOCK.csv'
]

// ====== Precios base en USD ======
const PRICES_URL =
  'https://corsproxy.io/?https://api-prices-nu.vercel.app/api/prices'

// ====== Fallback local solo para precios ======
const LOCAL_ENDPOINTS = {
  prices: './local_prices.json'
}

// ====== Referencias DOM ======
const tableBody = document.querySelector('#stock-table tbody')
const loading = document.getElementById('loading')
const error = document.getElementById('error')
const buscador = document.getElementById('buscador')
const clearBuscador = document.getElementById('clear-buscador')
const filtroCamion = document.getElementById('filtro-camion')
const filtroAuto = document.getElementById('filtro-auto')
const filtroTodos = document.getElementById('filtro-todos')
const stockSelect = document.getElementById('stock-select')
const pinnedBar = document.getElementById('pinned-bar')

// ====== Override de cantidades opcional ======
const CODIGOS_OVERRIDE = []
let CANTIDAD_OVERRIDE = 1

function aplicarOverrideCantidad (data) {
  const setCodigos = new Set(
    CODIGOS_OVERRIDE.map(c =>
      String(c || '')
        .trim()
        .toUpperCase()
    )
  )

  return (Array.isArray(data) ? data : []).map(item => {
    const codigoNormalizado = String(item.codigo || '')
      .trim()
      .toUpperCase()

    if (setCodigos.has(codigoNormalizado)) {
      return {
        ...item,
        stock: CANTIDAD_OVERRIDE
      }
    }

    return item
  })
}

const filtroBtns = [filtroCamion, filtroAuto, filtroTodos]

let allData = []
let stockActual = 'cordoba'

// ====== Estado de cotización desde Excel ======
let usdRate = null

const isManualDollar = () =>
  Number(DOLAR_TOTAL) > 0 && Number.isFinite(Number(DOLAR_TOTAL))

const effectiveUsdRate = () => Number(DOLAR_TOTAL) || null

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

  if (noSepRaw.endsWith('COPIA')) {
    addVariants(noSepRaw.slice(0, -5))
  }

  if (noSepRaw.startsWith('LANDE')) {
    addVariants(noSepRaw.slice(5))
  }

  return Array.from(keys)
}

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

// ====== Mostrar solo pesos en productos promocionales ======
function isSoloPesosItem (item) {
  return Boolean(item?.enPromocion)
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

// ====== Ofertas y dólar desde Excel ======
// Archivo esperado: ofertas.xlsx
//
// A1: dolar
// A2: valor del dólar
//
// A3: codigo
// B3: descripcion
// C3: precio
//
// Desde fila 4:
// Columna A: codigo
// Columna B: descripcion interna, solo referencia
// Columna C: precio promocional en pesos

const OFERTAS_EXCEL_URL = './ofertas.xlsx'

function parseNumeroExcel (value) {
  if (value === null || value === undefined || value === '') return null

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  const texto = String(value).trim().replace(/\$/g, '').replace(/\s/g, '')

  if (!texto) return null

  let normalizado = texto

  if (texto.includes('.') && texto.includes(',')) {
    normalizado = texto.replace(/\./g, '').replace(',', '.')
  } else if (texto.includes(',')) {
    normalizado = texto.replace(',', '.')
  } else if (/^\d{1,3}(\.\d{3})+$/.test(texto)) {
    normalizado = texto.replace(/\./g, '')
  }

  const numero = Number(normalizado)

  return Number.isFinite(numero) ? numero : null
}

async function loadOfertasConfig () {
  try {
    if (typeof XLSX === 'undefined') {
      console.warn('No está cargada la librería XLSX.')
      return []
    }

    const res = await fetch(withCacheBuster(OFERTAS_EXCEL_URL), {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
        Pragma: 'no-cache',
        Expires: '0'
      }
    })

    if (!res.ok) {
      console.warn('No se pudo cargar ofertas.xlsx')
      return []
    }

    const buffer = await res.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array' })

    const firstSheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[firstSheetName]

    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: ''
    })

    const dolarExcel = parseNumeroExcel(rows?.[1]?.[0])

    if (dolarExcel && dolarExcel > 0) {
      DOLAR_TOTAL = dolarExcel
      usdRate = dolarExcel
      updateUsdInlineUIFromExcel()
    } else {
      DOLAR_TOTAL = 0
      usdRate = null

      const refs = usdLineRef || ensureUsdInline()
      refs.precio.textContent = '—'
      refs.label.textContent = 'Excel'
      refs.updated.textContent = 'Sin valor en ofertas.xlsx'
    }

    const filasOfertas = rows.slice(3)

    return filasOfertas
      .filter(row => Array.isArray(row) && row.length >= 3)
      .map(row => {
        const codigo = String(row[0] || '').trim()
        const precio = parseNumeroExcel(row[2])

        return {
          codigo,
          precio,
          moneda: 'ars'
        }
      })
      .filter(item => {
        const codigoNormalizado = item.codigo.toLowerCase()

        const esEncabezado =
          codigoNormalizado === 'codigo' ||
          codigoNormalizado === 'código' ||
          codigoNormalizado === 'dolar' ||
          codigoNormalizado === 'dólar'

        const codigoValido = item.codigo && !esEncabezado
        const precioValido = Number.isFinite(item.precio) && item.precio > 0

        return codigoValido && precioValido
      })
  } catch (e) {
    console.warn('No se pudo cargar ofertas desde Excel:', e)

    DOLAR_TOTAL = 0
    usdRate = null

    const refs = usdLineRef || ensureUsdInline()
    refs.precio.textContent = '—'
    refs.label.textContent = 'Excel'
    refs.updated.textContent = 'Error al leer ofertas.xlsx'

    return []
  }
}

function buildOfertasMap (ofertasRaw) {
  const map = new Map()
  const arr = Array.isArray(ofertasRaw) ? ofertasRaw : []

  arr.forEach(o => {
    let codigo
    let precio
    let moneda

    if (Array.isArray(o)) {
      ;[codigo, precio, moneda] = o
    } else if (o && typeof o === 'object') {
      codigo = o.codigo ?? o[0]
      precio = o.precio ?? o.valor ?? o[1]
      moneda = o.moneda ?? o.tipo ?? o.currency ?? o[2]
    }

    if (!codigo || precio == null) return

    const numPrecio = Number(precio)
    if (!Number.isFinite(numPrecio) || numPrecio <= 0) return

    const tipo = String(moneda || 'ars').toLowerCase() === 'usd' ? 'usd' : 'ars'

    codeKeysOne(codigo).forEach(k => {
      if (!map.has(k)) {
        map.set(k, { precio: numPrecio, tipo })
      }
    })
  })

  return map
}

// ====== Formateos ======
function fmtARS (n) {
  if (n === null || n === undefined || n === '' || Number.isNaN(Number(n))) {
    return ''
  }

  return '$ ' + Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 })
}

function fmtUSD (n) {
  if (n === null || n === undefined || n === '' || Number.isNaN(Number(n))) {
    return ''
  }

  return (
    'US$ ' +
    Number(n).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
  )
}

function parseStock (s) {
  if (s === null || s === undefined) return 0
  if (typeof s === 'number' && Number.isFinite(s)) return s

  const cleaned = String(s).replace(/[^\d]/g, '').trim()

  if (!cleaned) return 0

  const n = Number(cleaned)

  return Number.isFinite(n) ? n : 0
}

function shorten (t, max = 36) {
  const s = String(t || '').trim()
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

const fmtISOToLocal = iso => {
  if (!iso) return '—'

  const d = new Date(iso)

  if (isNaN(d)) return '—'

  return d.toLocaleString('es-AR', {
    dateStyle: 'medium',
    timeStyle: 'short'
  })
}

// ====== Texto de copiado ======
function buildCopyTextForItem (item = {}) {
  const desc = (item.descripcion || '').trim()
  let price = ''

  const preferArs =
    item.precioArsOverride != null ? item.precioArsOverride : item.precioArs

  if (preferArs != null && !Number.isNaN(Number(preferArs))) {
    price = fmtARS(preferArs)
  } else if (item.precioUsd != null && !Number.isNaN(Number(item.precioUsd))) {
    price = fmtUSD(item.precioUsd)
  }

  const code = primaryCode(item.codigo || item.__key || '')
  const parts = []

  if (desc) parts.push(desc)
  if (price) parts.push(price)
  if (code) parts.push(`Código: ${code}`)

  return parts.join(' ').trim()
}

function buildPinnedListText () {
  if (!pinned.size) return ''

  return Array.from(pinned.values())
    .map(it => buildCopyTextForItem(it))
    .filter(Boolean)
    .join('\n')
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

// ====== Placeholder tabla ======
function renderPlaceholder (message = 'Escribí para buscar') {
  tableBody.innerHTML = `
    <tr class="placeholder-row">
      <td colspan="5" style="text-align:center; opacity:.7; padding:16px;">${message}</td>
    </tr>`
}

// ====== Estilos label promoción ======
function ensurePromoLabelStyles () {
  if (document.getElementById('promo-label-styles')) return

  const style = document.createElement('style')
  style.id = 'promo-label-styles'
  style.textContent = `
    .promo-label {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      margin-left: 6px;
      padding: 2px 6px;
      border-radius: 999px;
      background: #ffd54a;
      color: #1b1b1b;
      font-size: 10px;
      font-weight: 700;
      line-height: 1;
      text-transform: uppercase;
      box-shadow: 0 2px 6px rgba(0,0,0,.25);
      pointer-events: none;
      vertical-align: middle;
      white-space: nowrap;
    }
  `

  document.head.appendChild(style)
}

// ====== Anclados ======
const pinned = new Map()

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
      const soloPesos = isSoloPesosItem(it)
      const ars = it.precioArs != null ? fmtARS(it.precioArs) : ''

      const usd =
        !soloPesos && it.precioUsd != null
          ? ` <small style="opacity:.7">(${fmtUSD(it.precioUsd)})</small>`
          : ''

      return `
      <div class="pin-chip" data-key="${it.__key}">
        <span class="pin-icon">⚓</span>
        <span class="pin-desc">${shorten(it.descripcion, 34)}</span>
        ${
          ars
            ? `<span class="pin-price" style="white-space: nowrap;">${ars}${usd}</span>`
            : usd
            ? `<span class="pin-price" style="white-space: nowrap;">${usd}</span>`
            : ''
        }
        <button class="remove" title="Quitar" style="color:red;">×</button>
      </div>`
    })
    .join('')

  pinnedBar.querySelectorAll('.pin-chip .remove').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation()

      const key = btn.closest('.pin-chip')?.dataset?.key

      if (!key) return

      pinned.delete(key)
      renderPinnedBar()

      document
        .querySelectorAll(`.anchor-btn[data-key="${cssEscape(key)}"]`)
        .forEach(b => {
          b.classList.remove('active')
          b.setAttribute('aria-pressed', 'false')
          b.title = 'Anclar'
        })
    })
  })

  pinnedBar.querySelectorAll('.pin-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const payload = buildPinnedListText()

      if (!payload) {
        showCopied('No hay productos anclados')
        return
      }

      writeToClipboard(payload)
    })
  })
}

function togglePin (item) {
  const key = canonicalKey(item?.codigo)

  if (!key) return

  const toSave = {
    ...item,
    __key: key,
    enPromocion: Boolean(item?.enPromocion)
  }

  const rate = effectiveUsdRate()

  if (rate && item?.precioUsd != null && item.precioArs == null) {
    toSave.precioArs = Math.round(Number(item.precioUsd) * rate)
  }

  if (pinned.has(key)) {
    pinned.delete(key)
  } else {
    pinned.set(key, toSave)
  }

  renderPinnedBar()

  document
    .querySelectorAll(`.anchor-btn[data-key="${cssEscape(key)}"]`)
    .forEach(b => {
      const on = pinned.has(key)
      b.classList.toggle('active', on)
      b.setAttribute('aria-pressed', on ? 'true' : 'false')
      b.title = on ? 'Desanclar' : 'Anclar'
    })
}

// ====== Mini menú ======
let anchorMenuOverlay = null
let anchorMenuPanel = null

function ensureAnchorMenu () {
  if (anchorMenuOverlay && anchorMenuPanel) {
    return { overlay: anchorMenuOverlay, panel: anchorMenuPanel }
  }

  const overlay = document.createElement('div')
  overlay.id = 'anchor-menu-overlay'
  overlay.style.position = 'fixed'
  overlay.style.inset = '0'
  overlay.style.display = 'none'
  overlay.style.zIndex = '10000'
  overlay.style.background = 'transparent'
  overlay.style.alignItems = 'center'
  overlay.style.justifyContent = 'center'

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
    <button data-action="copy-all" style="width:100%;text-align:left;background:none;border:0;color:var(--text);padding:10px 12px;border-radius:10px;">📋 Copiar ancladas</button>
    <button data-action="pin" style="width:100%;text-align:left;background:none;border:0;color:var(--text);padding:10px 12px;border-radius:10px;">⚓ Anclar</button>
  `

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

  overlay.addEventListener('click', e => {
    if (e.target === overlay) hideAnchorMenu()
  })

  window.addEventListener('keydown', e => {
    if (overlay.style.display === 'flex' && e.key === 'Escape') {
      hideAnchorMenu()
    }
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

  const isPinned = pinned.has(key)
  const pinBtn = panel.querySelector('[data-action="pin"]')

  pinBtn.textContent = isPinned ? '✖ Desanclar' : '⚓ Anclar'

  const isPhone = window.innerWidth <= 640

  if (isPhone) {
    overlay.style.background = 'rgba(0,0,0,.45)'
    overlay.style.display = 'flex'
    panel.style.position = 'static'
    panel.style.transform = 'none'
  } else {
    overlay.style.background = 'transparent'
    overlay.style.display = 'block'

    const r = btn.getBoundingClientRect()
    const margin = 6

    panel.style.position = 'fixed'
    panel.style.left =
      Math.min(window.innerWidth - panel.offsetWidth - 8, Math.max(8, r.left)) +
      'px'

    panel.style.top = r.bottom + margin + 'px'
    panel.style.transform = 'none'
  }

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

    if (action === 'copy-all') {
      const payload = buildPinnedListText()

      if (payload) writeToClipboard(payload)
      else showCopied('No hay productos anclados')

      return
    }

    if (action === 'pin') {
      const it =
        (tableBody._lastRowMap && tableBody._lastRowMap.get(key)) || item

      togglePin(it)
    }
  }
}

function hideAnchorMenu () {
  if (!anchorMenuOverlay) return
  anchorMenuOverlay.style.display = 'none'
}

// ====== Fetch con fallback local ======
function isNonEmptyArray (j) {
  return Array.isArray(j) && j.length > 0
}

async function fetchPreferRemoteThenLocal ({
  remoteUrl,
  localUrl,
  label = '',
  expectArray = true
}) {
  try {
    const json = await fetchJson(remoteUrl)

    if (!expectArray) return json
    if (isNonEmptyArray(json)) return json

    console.warn(`[fallback] ${label}: remoto vacío, uso local`)
  } catch (e) {
    console.warn(`[fallback] ${label}: remoto falló, uso local`, e)
  }

  if (!localUrl) {
    return expectArray ? [] : null
  }

  try {
    const jsonLocal = await fetchJson(localUrl)

    if (!expectArray) return jsonLocal
    if (Array.isArray(jsonLocal)) return jsonLocal

    return []
  } catch (e) {
    console.warn(`[fallback] ${label}: local falló`, e)
    return expectArray ? [] : null
  }
}

// ====== CSV helpers ======
function limpiarTextoCsv (text) {
  return String(text || '')
    .replace(/^\uFEFF/, '')
    .replace(/\0/g, '')
}

function limpiarValorCsv (value) {
  let texto = String(value || '').trim()

  // Limpia valores exportados por Excel como ="F77"
  if (texto.startsWith('="') && texto.endsWith('"')) {
    texto = texto.slice(2, -1)
  }

  // Limpia comillas externas
  if (texto.startsWith('"') && texto.endsWith('"')) {
    texto = texto.slice(1, -1)
  }

  return texto.trim()
}

function detectCsvDelimiter (text) {
  const cleanText = limpiarTextoCsv(text)

  const firstLine =
    cleanText.split(/\r?\n/).find(line => line.trim() !== '') || ''

  const semicolonCount = (firstLine.match(/;/g) || []).length
  const tabCount = (firstLine.match(/\t/g) || []).length
  const commaCount = (firstLine.match(/,/g) || []).length

  if (semicolonCount >= commaCount && semicolonCount >= tabCount) return ';'
  if (tabCount >= commaCount && tabCount >= semicolonCount) return '\t'

  return ','
}

function parseCsvLine (line, delimiter) {
  const result = []
  let current = ''
  let insideQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const next = line[i + 1]

    if (char === '"' && insideQuotes && next === '"') {
      current += '"'
      i++
      continue
    }

    if (char === '"') {
      insideQuotes = !insideQuotes
      current += char
      continue
    }

    if (char === delimiter && !insideQuotes) {
      result.push(limpiarValorCsv(current))
      current = ''
      continue
    }

    current += char
  }

  result.push(limpiarValorCsv(current))

  return result
}

function parseCsv (text) {
  const cleanText = limpiarTextoCsv(text)
  const delimiter = detectCsvDelimiter(cleanText)

  console.log(
    '[stock.csv] Delimitador detectado:',
    delimiter === '\t' ? 'TAB' : delimiter
  )

  return cleanText.split(/\r?\n/).map(line => parseCsvLine(line, delimiter))
}

function parseStockCsvNumber (value) {
  if (value === null || value === undefined || value === '') return 0

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  const texto = limpiarValorCsv(value)
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.')

  const numero = Number(texto)

  return Number.isFinite(numero) ? numero : 0
}

async function fetchStockCsvText () {
  let lastError = null

  for (const url of STOCK_CSV_URLS) {
    try {
      console.log('[stock.csv] Intentando cargar:', url)

      const res = await fetch(withCacheBuster(url), {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
          Pragma: 'no-cache',
          Expires: '0'
        }
      })

      if (res.ok) {
        const buffer = await res.arrayBuffer()

        let text = new TextDecoder('utf-8').decode(buffer)

        // Si aparece el carácter �, probablemente el CSV está en ANSI / Windows-1252
        if (text.includes('�')) {
          text = new TextDecoder('windows-1252').decode(buffer)
        }

        console.log('[stock.csv] Cargado correctamente:', url)
        console.log('[stock.csv] Primeros caracteres:', text.slice(0, 200))

        return text
      }

      lastError = new Error(`${url} respondió HTTP ${res.status}`)
      console.warn('[stock.csv]', lastError.message)
    } catch (e) {
      lastError = e
      console.warn('[stock.csv] Error cargando:', url, e)
    }
  }

  throw lastError || new Error('No se pudo cargar stock.csv')
}

function isEmptyCsvRow (row) {
  return (
    !Array.isArray(row) || row.every(cell => String(cell || '').trim() === '')
  )
}

function normalizarHeader (value) {
  return limpiarValorCsv(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/�/g, '')
    .trim()
}

function findHeaderIndex (rows) {
  return rows.findIndex(row => {
    const colA = normalizarHeader(row?.[0])
    const colB = normalizarHeader(row?.[1])

    const esCodigo =
      colA === 'codigo' || colA.includes('codigo') || colA.includes('cdigo')

    const esArticulo =
      colB === 'articulo' ||
      colB.includes('articulo') ||
      colB.includes('artculo')

    return esCodigo && esArticulo
  })
}

async function fetchStockFromCsv(stock) {
  const csvText = await fetchStockCsvText()
  const rows = parseCsv(csvText)

  console.log('[stock.csv] Total filas leídas:', rows.length)
  console.log('[stock.csv] Primeras filas:', rows.slice(0, 5))

  const headerIndex = findHeaderIndex(rows)

  if (headerIndex === -1) {
    console.error('[stock.csv] No se encontró encabezado Código / Artículo')
    console.error('[stock.csv] Filas detectadas:', rows.slice(0, 10))

    throw new Error(
      'No se encontró el encabezado Código / Artículo en stock.csv'
    )
  }

  console.log('[stock.csv] Encabezado encontrado en fila:', headerIndex + 1)

  const productRows = rows
    .slice(headerIndex + 1)
    .filter(row => !isEmptyCsvRow(row))

  const data = productRows
    .map(row => {
      // Columnas según tu CSV:
      // A = Código        índice 0
      // B = Artículo      índice 1
      // D = Rubro         índice 3
      // K = TRUCK CBA     índice 10
      // L = OLAVARRIA     índice 11
      // M = POLO          índice 12

      const codigo = limpiarValorCsv(row[0])
      const descripcion = limpiarValorCsv(row[1])
      const rubro = limpiarValorCsv(row[3])

      const truckCba = parseStockCsvNumber(row[10])
      const olavarria = parseStockCsvNumber(row[11])
      const polo = parseStockCsvNumber(row[12])

      let stockFinal = 0

      if (stock === 'cordoba') {
        stockFinal = truckCba + polo
      } else if (stock === 'olavarria') {
        stockFinal = olavarria
      }

      return {
        codigo,
        descripcion,
        rubro,
        stock: stockFinal,
        stockTruckCba: truckCba,
        stockOlavarria: olavarria,
        stockPolo: polo
      }
    })
    .filter(item => {
      const codigoNormalizado = normalizarHeader(item.codigo)

      const codigoValido =
        item.codigo &&
        codigoNormalizado !== 'codigo' &&
        codigoNormalizado !== 'cod' &&
        codigoNormalizado !== 'código'

      const descripcionValida = Boolean(item.descripcion)

      return codigoValido && descripcionValida
    })
    .filter(item => {
      // No mostrar productos sin stock en el depósito seleccionado.
      // Depósito 1: TRUCK CBA + POLO.
      // Depósito 2: OLAVARRIA.
      return Number(item.stock) > 0
    })

  console.log('[stock.csv] Productos procesados:', data.length)
  console.log('[stock.csv] Primeros productos:', data.slice(0, 5))

  if (!data.length) {
    throw new Error('stock.csv fue leído, pero no hay productos con stock para este depósito')
  }

  return data
}

// ====== Render tabla ======
function renderTable (data) {
  tableBody.innerHTML = ''

  if (!data || data.length === 0) {
    renderPlaceholder('Sin resultados. Refiná tu búsqueda.')
    return
  }

  const rowItemByKey = new Map()
  const rate = effectiveUsdRate()

  data.forEach(item => {
    const tr = document.createElement('tr')
    tr.classList.add('copy-row')
    tr.tabIndex = 0

    const stockNum = parseStock(item.stock)
    const stockDisplay = stockNum > 100 ? 100 : stockNum

    const key = canonicalKey(item.codigo)

    const precioUsd = item.precioUsd != null ? Number(item.precioUsd) : null

    let precioArs = null

    if (
      item.precioArsOverride != null &&
      !Number.isNaN(Number(item.precioArsOverride))
    ) {
      precioArs = Number(item.precioArsOverride)
    } else if (rate && precioUsd != null) {
      precioArs = Math.round(precioUsd * rate)
    }

    const soloPesos = isSoloPesosItem(item)

    const priceHtml =
      precioUsd != null || precioArs != null
        ? `<div class="price-wrap" style="display:flex;flex-direction:column;gap:2px;align-items:flex-end;">
           ${
             precioArs != null
               ? `<span class="price-ars" style="font-weight:600;">${fmtARS(
                   precioArs
                 )}</span>`
               : ''
           }
           ${
             !soloPesos && precioUsd != null
               ? `<span class="price-usd" style="opacity:.8;">${fmtUSD(
                   precioUsd
                 )}</span>`
               : ''
           }
         </div>`
        : ''

    const copyText = buildCopyTextForItem({
      codigo: item.codigo,
      descripcion: item.descripcion,
      precioUsd,
      precioArs,
      precioArsOverride: item.precioArsOverride
    })

    tr.dataset.copy = copyText
    tr.dataset.key = key

    const anchorBtnHTML = `
      <button class="anchor-btn ${pinned.has(key) ? 'active' : ''}" 
              title="${pinned.has(key) ? 'Desanclar' : 'Anclar'}" 
              aria-pressed="${pinned.has(key) ? 'true' : 'false'}"
              data-key="${key}"><img src="./media/3dots.png"></button>`

    const promoLabelHTML = item.enPromocion
      ? `<span class="promo-label" title="Producto en promoción">★ Promo</span>`
      : ''

    tr.innerHTML = `
      <td class="descycode">
        <span>${item.descripcion || ''}</span>
        <span style="height:16px"></span>
        <span style="font-size:12px">
          Código:<code> ${item.codigo}</code>
          ${promoLabelHTML}
        </span>
      </td>
      <td>${item.rubro || ''}</td>
      <td>${stockDisplay}</td>
      <td style="white-space: nowrap;display:flex;justify-content:flex-end;gap:8px;align-items:center;">${priceHtml}${anchorBtnHTML}</td>
    `

    tableBody.appendChild(tr)

    rowItemByKey.set(key, { ...item, precioUsd, precioArs })
  })

  if (!tableBody.__delegated) {
    tableBody.__delegated = true

    tableBody.addEventListener('click', e => {
      const anchorBtn = e.target.closest('.anchor-btn')

      if (anchorBtn) {
        e.stopPropagation()

        const k = anchorBtn.dataset.key
        const row = anchorBtn.closest('tr')
        const copyText = row?.dataset?.copy || ''

        const it = (tableBody._lastRowMap && tableBody._lastRowMap.get(k)) || {
          codigo: k,
          descripcion: row?.querySelector('td')?.innerText || '',
          precioUsd: null,
          precioArs: null
        }

        showAnchorMenu(anchorBtn, { item: it, copyText })
        return
      }

      const tr = e.target.closest('tr')

      if (!tr || !tr.dataset.copy) return

      tr.classList.remove('copy-flash')
      void tr.offsetWidth
      tr.classList.add('copy-flash')

      writeToClipboard(tr.dataset.copy)

      tr.focus?.()
    })

    tableBody.addEventListener('keydown', e => {
      const tr = e.target.closest('tr.copy-row')

      if (!tr) return

      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()

        tr.classList.remove('copy-flash')
        void tr.offsetWidth
        tr.classList.add('copy-flash')

        writeToClipboard(tr.dataset.copy || '')
      }

      if (e.key.toLowerCase() === 'm') {
        const btn = tr.querySelector('.anchor-btn')

        if (btn) {
          const k = tr.dataset.key

          const it = (tableBody._lastRowMap &&
            tableBody._lastRowMap.get(k)) || {
            codigo: k,
            descripcion: tr.querySelector('td')?.innerText || '',
            precioUsd: null,
            precioArs: null
          }

          showAnchorMenu(btn, {
            item: it,
            copyText: tr.dataset.copy || ''
          })
        }
      }
    })

    window.addEventListener('resize', () => {
      if (!anchorMenuOverlay || anchorMenuOverlay.style.display === 'none') {
        return
      }

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

  if (window.filtroActivo === 'camion') {
    datos = datos.filter(it => esCamionImportado(it.rubro))
  } else if (window.filtroActivo === 'auto') {
    datos = datos.filter(it => esAutoImportado(it.rubro))
  }

  datos = datos.filter(
    it =>
      (it.codigo && String(it.codigo).toLowerCase().includes(valor)) ||
      (it.descripcion && it.descripcion.toLowerCase().includes(valor))
  )

  renderTable(datos)
}

// ====== Carga principal ======
async function cargarDatos (stock) {
  loading && (loading.style.display = '')

  if (error) error.textContent = ''

  window.filtroActivo = null
  setActiveBtn(null)

  try {
    const [dataPrices, ofertas] = await Promise.all([
      fetchPreferRemoteThenLocal({
        remoteUrl: PRICES_URL,
        localUrl: LOCAL_ENDPOINTS.prices,
        label: 'PRICES',
        expectArray: true
      }),
      loadOfertasConfig()
    ])

    const ofertasMap = buildOfertasMap(ofertas)

    let dataStock = await fetchStockFromCsv(stock)

    dataStock = aplicarOverrideCantidad(dataStock)

    const priceMap = new Map()

    ;(Array.isArray(dataPrices) ? dataPrices : []).forEach(p => {
      const precio = p?.precio ?? null

      codeKeysOne(p?.codigo).forEach(k => {
        if (!priceMap.has(k)) {
          priceMap.set(k, precio)
        }
      })
    })

    allData = (Array.isArray(dataStock) ? dataStock : []).map(item => {
      const keys = codeKeys(item?.codigo)
      let precioUsd = null
      let precioArsOverride = null
      let enPromocion = false

      // Precio base desde API de precios en USD
      for (const k of keys) {
        if (priceMap.has(k)) {
          precioUsd = priceMap.get(k)
          break
        }
      }

      // Oferta desde Excel pisa el precio normal
      for (const k of keys) {
        if (ofertasMap.has(k)) {
          const of = ofertasMap.get(k)

          enPromocion = true

          if (of.tipo === 'usd') {
            precioUsd = of.precio
            precioArsOverride = null
          } else {
            precioArsOverride = of.precio
          }

          break
        }
      }

      return {
        ...item,
        precioUsd,
        precioArsOverride,
        enPromocion
      }
    })

    if (loading) loading.style.display = 'none'

    aplicarFiltros()
    renderPinnedBar()
  } catch (err) {
    console.error('Error al cargar datos desde stock.csv:', err)

    if (loading) loading.style.display = 'none'

    const mensaje = err?.message || 'Error desconocido al cargar stock.csv'

    if (error) {
      error.textContent = `Error al cargar stock.csv: ${mensaje}`
    }

    renderPlaceholder(`No pudimos cargar stock.csv: ${mensaje}`)
  }
}

// ====== UI Cotización ======
let usdLineRef = null

function ensureUsdInline () {
  if (usdLineRef) return usdLineRef

  const container = document.querySelector('main') || document.body

  if (!document.getElementById('usd-inline-styles')) {
    const style = document.createElement('style')
    style.id = 'usd-inline-styles'
    style.textContent = `
      .usd-inline {
        display:block;
        width:100%;
        font-size:.95rem;
        line-height:1.3;
        padding:6px 0;
        margin:4px 0 10px 0;
        color:var(--text,#eee);
      }

      .usd-inline .muted {
        opacity:.75;
      }

      .usd-inline .strong {
        font-weight:700;
      }

      .usd-inline .sep {
        opacity:.5;
        padding:0 6px;
      }
    `

    document.head.appendChild(style)
  }

  const line = document.createElement('div')
  line.className = 'usd-inline'
  line.id = 'usd-inline'
  line.innerHTML = `
    <span class="muted">Dólar:</span>
    <span id="usd-inline-precio" class="strong">—</span>
    <span class="muted">(<span id="usd-inline-label">Excel</span>)</span>
    <span class="sep">—</span>
    <span class="muted">Actualizado:</span>
    <span id="usd-inline-updated">—</span>
  `

  container.prepend(line)

  usdLineRef = {
    precio: line.querySelector('#usd-inline-precio'),
    updated: line.querySelector('#usd-inline-updated'),
    label: line.querySelector('#usd-inline-label')
  }

  return usdLineRef
}

function updateUsdInlineUIFromExcel () {
  const refs = ensureUsdInline()

  refs.precio.textContent = DOLAR_TOTAL > 0 ? fmtARS(Number(DOLAR_TOTAL)) : '—'

  refs.label.textContent = 'Excel'

  refs.updated.textContent = fmtISOToLocal(new Date().toISOString())
}

function fetchUsdRate () {
  if (isManualDollar()) {
    usdRate = Number(DOLAR_TOTAL)
    updateUsdInlineUIFromExcel()
    return
  }

  const refs = usdLineRef || ensureUsdInline()

  refs.precio.textContent = '—'
  refs.label.textContent = 'Excel'
  refs.updated.textContent = 'Sin valor en ofertas.xlsx'
}

// ====== Listeners ======
function updateClearBtn () {
  if (!clearBuscador) return

  const has = (buscador?.value || '').length > 0

  clearBuscador.style.display = has ? 'block' : 'none'
}

buscador &&
  buscador.addEventListener('input', () => {
    updateClearBtn()
    aplicarFiltros()
  })

clearBuscador &&
  clearBuscador.addEventListener('click', () => {
    buscador.value = ''

    updateClearBtn()
    aplicarFiltros()
    buscador.focus()
  })

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
  ensureUsdInline()
  ensurePromoLabelStyles()

  // El valor real del dólar se carga desde ofertas.xlsx dentro de cargarDatos().
  fetchUsdRate()

  cargarDatos(stockActual)
  updateClearBtn()
})
