"""Convierte un PDF a Word conservando tablas, imágenes y distribución (usa pdf2docx)."""
import sys


def main():
    if len(sys.argv) < 3:
        sys.stderr.write("Uso: pdf2docx-cli entrada.pdf salida.docx\n")
        return 2
    src, dst = sys.argv[1], sys.argv[2]
    try:
        from pdf2docx import Converter
        cv = Converter(src)
        try:
            cv.convert(dst)
        finally:
            cv.close()
    except Exception as e:  # noqa: BLE001
        sys.stderr.write("Error: %s\n" % e)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
