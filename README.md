# PDF y Word Fácil

App de escritorio de código abierto, sin anuncios y sin internet.

- **Word a PDF:** usa LibreOffice si lo tienes instalado (mejor calidad). Si no, usa un motor básico incluido (solo .docx).
- **PDF a Word:** si el PDF trae texto, usa pdf2docx (conserva tablas, imágenes y distribución). Si es un escaneo, usa OCR (español e inglés incluidos) y sale solo el texto.

Para compilar el .exe usa la receta de GitHub Actions `build-convertidor.yml`
(crea el motor `pdf2docx-cli.exe` con PyInstaller y luego el instalador con electron-builder).

Ver THIRD-PARTY.md para licencias, incluido el aviso sobre PyMuPDF (AGPL-3.0).
