# Componentes de código abierto incluidos

| Componente | Para qué se usa | Licencia |
|---|---|---|
| Electron | Ventana de la app | MIT |
| pdf.js (Mozilla) | Leer PDFs y extraer texto | Apache-2.0 |
| Tesseract.js + tesseract.js-core | OCR (reconocimiento de texto) | Apache-2.0 |
| Datos de idioma Tesseract (spa, eng) | OCR en español e inglés | Apache-2.0 |
| docx | Crear archivos de Word (modo solo texto) | MIT |
| mammoth | Leer .docx en el motor básico de Word a PDF | BSD-2-Clause |
| pdf2docx | PDF a Word con tablas e imágenes | MIT |
| PyMuPDF | Lo usa pdf2docx para leer PDFs | AGPL-3.0 (o licencia comercial de Artifex) |
| NumPy, OpenCV (headless), fontTools, python-docx | Dependencias de pdf2docx | BSD / Apache-2.0 / MIT |
| LibreOffice (opcional, instalado aparte) | Word a PDF de alta calidad | MPL-2.0 |

## Aviso sobre PyMuPDF (AGPL-3.0)

El programa para Windows incluye PyMuPDF, que se distribuye bajo AGPL-3.0. Por eso, si compartes
el instalador o el portable con otras personas, debes ofrecerles también el código fuente de esta
aplicación (por ejemplo, manteniendo público este repositorio) y respetar los términos de la AGPL-3.0:
https://www.gnu.org/licenses/agpl-3.0.html

El código propio de esta carpeta se publica bajo MIT (ver LICENSE).
