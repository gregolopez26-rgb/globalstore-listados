# Listados Global Store

Sitio estático con los listados de precios de Global Store. Lee dos hojas publicadas
de la planilla **Stock Maestro** (Google Sheets) y se actualiza solo.

| Página | Qué muestra |
|---|---|
| `index.html` | Catálogo al público de Global Store (precio minorista). |
| `mayorista.html` | Lista mayorista por escalas (+3 / +10 grandes, +3 / +12 / +24 miniaturas). |
| `<local>.html` | Catálogo público de un local en consignación, con su estética y su recargo. |
| `<local>-lista.html` | Lista interna del local: lo que paga, lo que tiene consignado y el precio sugerido. |
| `publico.html?l=slug` · `local.html?l=slug` | Lo mismo para cualquier local dado de alta en la hoja LOCALES. |

Configuración: `config.js` (links CSV publicados, contacto de Global Store).
Datos de prueba: agregando `?src=test` a cualquier página se usan `test-publico.csv` y `test-locales.csv`.
