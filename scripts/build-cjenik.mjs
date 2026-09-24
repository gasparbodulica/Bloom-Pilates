// Generates public/cjenik-bloom-pilates.xlsx from src/data/pricing.json.
// The page table reads the same JSON, so the sheet and the site can't drift.
// Run: npm run build:cjenik
import ExcelJS from 'exceljs'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const data = JSON.parse(await readFile(path.join(root, 'src/data/pricing.json'), 'utf8'))

if (data.placeholder) {
  console.error('\n  Refusing to build: src/data/pricing.json is still placeholder data.')
  console.error('  Fill in real prices, set validFrom and vatNote, then set "placeholder": false.\n')
  process.exit(1)
}

const BROWN = 'FF3D2B1F'
const CREAM = 'FFECE6D8'

const wb = new ExcelJS.Workbook()
wb.creator = 'Bloom Pilates Studio'
wb.created = new Date()
const ws = wb.addWorksheet('Cjenik', {
  pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
})

ws.columns = [
  { key: 'service', width: 42 },
  { key: 'detail', width: 22 },
  { key: 'price', width: 16 },
]

const title = ws.addRow(['Bloom Pilates Studio — Cjenik usluga'])
ws.mergeCells(title.number, 1, title.number, 3)
title.font = { name: 'Calibri', size: 16, bold: true, color: { argb: BROWN } }
title.height = 26

const addr = ws.addRow(['Istarsko naselje 3a, Mursko Središće'])
ws.mergeCells(addr.number, 1, addr.number, 3)
addr.font = { name: 'Calibri', size: 10, color: { argb: 'FF7A6558' } }

const valid = ws.addRow([`Cjenik vrijedi od: ${data.validFrom}`])
ws.mergeCells(valid.number, 1, valid.number, 3)
valid.font = { name: 'Calibri', size: 10, color: { argb: 'FF7A6558' } }

ws.addRow([])

const head = ws.addRow(['Usluga', 'Trajanje', `Cijena (${data.currency})`])
head.eachCell(cell => {
  cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: BROWN } }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CREAM } }
  cell.border = { bottom: { style: 'thin', color: { argb: 'FFAC9A7C' } } }
  cell.alignment = { vertical: 'middle' }
})
head.height = 20

for (const row of data.rows) {
  const r = ws.addRow([row.service, row.detail ?? '', row.price])
  r.getCell(3).numFmt = `#,##0.00 "${data.currency}"`
  r.getCell(3).alignment = { horizontal: 'right' }
  r.eachCell(cell => {
    cell.font = { name: 'Calibri', size: 11 }
    cell.border = { bottom: { style: 'hair', color: { argb: 'FFD9CCB6' } } }
    cell.alignment = { ...cell.alignment, vertical: 'middle' }
  })
  r.height = 18
}

ws.addRow([])
const vatText = data.vatNote === 'included'
  ? 'Cijene su izražene u EUR s uključenim PDV-om.'
  : 'Cijene su izražene u EUR. Bloom Pilates Studio nije u sustavu PDV-a.'
const note = ws.addRow([vatText])
ws.mergeCells(note.number, 1, note.number, 3)
note.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF7A6558' } }

ws.views = [{ state: 'frozen', ySplit: head.number }]

const out = path.join(root, 'public/cjenik-bloom-pilates.xlsx')
await wb.xlsx.writeFile(out)
console.log(`  Wrote ${path.relative(root, out)} — ${data.rows.length} services, valid from ${data.validFrom}`)
