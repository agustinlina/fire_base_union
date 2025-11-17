document.addEventListener('DOMContentLoaded', () => {
  const invoiceDateInput = document.getElementById('invoiceDate')
  const chequeList = document.getElementById('chequeList')
  const addButton = document.createElement('button')
  addButton.textContent = '+ Agregar cheque'
  addButton.id = 'addChequeButton'
  addButton.style.color = "white"
  addButton.style.fontWeight = '400'
  addButton.style.marginTop = '12px'

  let chequeCount = 0

  // Celdas de la tabla de resumen
  const sumCells = {
    '0-30': document.getElementById('sum-0-30'),
    '31-60': document.getElementById('sum-31-60'),
    '61-90': document.getElementById('sum-61-90'),
    '91-120': document.getElementById('sum-91-120'),
    '121-150': document.getElementById('sum-121-150'),
    '151-180': document.getElementById('sum-151-180')
  }

  function formatAmount (value) {
    if (!Number.isFinite(value) || value <= 0) return '$ 0'
    return '$ ' + value.toLocaleString('es-AR', { maximumFractionDigits: 0 })
  }

  function resetSummary () {
    Object.values(sumCells).forEach(cell => {
      cell.textContent = '$ 0'
    })
  }

  function getBucketForDays (daysDiff) {
    if (daysDiff >= 0 && daysDiff <= 30) return '0-30'
    if (daysDiff >= 31 && daysDiff <= 60) return '31-60'
    if (daysDiff >= 61 && daysDiff <= 90) return '61-90'
    if (daysDiff >= 91 && daysDiff <= 120) return '91-120'
    if (daysDiff >= 121 && daysDiff <= 150) return '121-150'
    if (daysDiff >= 151 && daysDiff <= 180) return '151-180'
    return null // Fuera de los rangos pedidos
  }

  function createChequeItem (index) {
    const div = document.createElement('div')
    div.classList.add('cheque-item')
    div.dataset.index = index
    div.style.marginTop = '8px'
    div.style.display = 'flex'
    div.style.flexWrap = 'wrap'
    div.style.gap = '8px'
    div.style.alignItems = 'center'

    const label = document.createElement('label')
    label.textContent = `Cheque ${index}:`
    label.style.minWidth = '90px'

    const inputDate = document.createElement('input')
    inputDate.type = 'date'
    inputDate.classList.add('cheque-date')
    inputDate.addEventListener('input', updateDaysRemaining)

    // Nuevo: input de monto
    const inputAmount = document.createElement('input')
    inputAmount.type = 'number'
    inputAmount.min = '0'
    inputAmount.step = '0.01'
    inputAmount.placeholder = 'Monto'
    inputAmount.classList.add('cheque-amount')
    inputAmount.style.width = '80%'
    inputAmount.style.padding = '16px'

    inputAmount.addEventListener('input', updateDaysRemaining)

    const span = document.createElement('span')
    span.classList.add('days-remaining')

    // Botón para borrar la fecha del cheque
    const deleteButton = document.createElement('button')
    deleteButton.innerHTML =
      '<div class="btn_delete d-flex gap-2 font-bold"><img width="22px" src="./media/goma.png" alt="">Borrar valores</div>'
    deleteButton.style.backgroundRepeat = 'no-repeat'
    deleteButton.classList.add('delete-cheque-button')
    deleteButton.style.width = 'fit-content'
    deleteButton.style.backgroundPosition = 'center'
    deleteButton.style.backgroundColor = '#16245a'
    deleteButton.style.borderColor = 'transparent'
    deleteButton.style.borderRadius = '8px'
    deleteButton.style.padding = '16px 8px'
    deleteButton.addEventListener('click', () => {
      inputDate.value = '' // borra la fecha
      inputAmount.value = '' // borra el monto
      span.textContent = '' // limpia el texto de días
      updateDaysRemaining() // recalcula los totales de los rangos
    })

    div.appendChild(label)
    div.appendChild(inputDate)
    div.appendChild(inputAmount)
    div.appendChild(span)
    div.appendChild(deleteButton)

    return div
  }

  function updateDaysRemaining () {
    const invoiceDateValue = invoiceDateInput.value

    // Si no hay fecha de factura, limpiamos mensajes y resumen
    if (!invoiceDateValue) {
      document.querySelectorAll('.days-remaining').forEach(span => {
        span.textContent = ''
      })
      resetSummary()
      return
    }

    const invoiceDate = new Date(invoiceDateValue)
    const chequeItems = document.querySelectorAll('.cheque-item')

    // Totales por rango
    const totals = {
      '0-30': 0,
      '31-60': 0,
      '61-90': 0,
      '91-120': 0,
      '121-150': 0,
      '151-180': 0
    }

    chequeItems.forEach(item => {
      const chequeInput = item.querySelector('.cheque-date')
      const amountInput = item.querySelector('.cheque-amount')
      const daysText = item.querySelector('.days-remaining')

      const chequeDateValue = chequeInput.value

      if (chequeDateValue) {
        const chequeDate = new Date(chequeDateValue)
        const timeDiff = chequeDate - invoiceDate
        const daysDiff = Math.floor(timeDiff / (1000 * 60 * 60 * 24))

        if (daysDiff > 180) {
          daysText.innerHTML = `<div style="color:red;">${daysDiff} días 😡</div>`
        } else if (daysDiff >= 0) {
          daysText.innerHTML = `<div style="color:rgba(25, 245, 39, 0.8);font-weight:bold">${daysDiff} días</div>`
        } else {
          daysText.innerHTML = `<div style="color:yellow;">Cheque al día 👍🏻</div>`
        }

        // Sumar al rango si corresponde y si hay monto
        const bucket = getBucketForDays(daysDiff)
        if (bucket) {
          const rawAmount = (amountInput.value || '')
            .toString()
            .replace(',', '.')
          const amount = Number(rawAmount)
          if (Number.isFinite(amount) && amount > 0) {
            totals[bucket] += amount
          }
        }
      } else {
        daysText.textContent = ''
      }
    })

    // Actualizar la tabla de resumen
    Object.entries(totals).forEach(([range, total]) => {
      const cell = sumCells[range]
      if (cell) {
        cell.textContent = formatAmount(total)
      }
    })
  }

  function initializeCheques (initialCount = 7) {
    chequeList.innerHTML = '' // Limpiar lista antes de inicializar
    for (let i = 1; i <= initialCount; i++) {
      chequeList.appendChild(createChequeItem(i))
    }
    chequeCount = initialCount
    if (!document.getElementById('addChequeButton')) {
      chequeList.after(addButton)
    }
  }

  addButton.addEventListener('click', () => {
    if (chequeCount >= 20) return
    chequeCount++
    chequeList.appendChild(createChequeItem(chequeCount))
    updateDaysRemaining()
  })

  invoiceDateInput.addEventListener('input', updateDaysRemaining)

  // Inicializar 7 cheques
  initializeCheques(7)
})
