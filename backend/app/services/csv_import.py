"""
Utilidades compartidas para importar CSV (inventario, proveedores, ventas).

El objetivo es tolerar archivos "de la vida real": distintos delimitadores,
cabeceras con acentos/mayúsculas y nombres de columna variados (alias). El
router de ventas mantiene su propia copia histórica de estas funciones; los
importadores nuevos (productos y proveedores) reutilizan este módulo.
"""
import csv
import io
import unicodedata


def norm(texto: str) -> str:
    """Normaliza una cabecera: sin acentos, minúsculas, separadores -> '_'."""
    t = unicodedata.normalize("NFKD", texto or "")
    t = "".join(c for c in t if not unicodedata.combining(c))
    t = t.strip().lower()
    for ch in (" ", "-", ".", "/", "\\"):
        t = t.replace(ch, "_")
    while "__" in t:
        t = t.replace("__", "_")
    return t.strip("_")


def decodificar(content: bytes) -> str:
    """Decodifica el archivo tolerando BOM (Excel/UTF-8) y Latin-1 (Windows)."""
    try:
        return content.decode("utf-8-sig")
    except UnicodeDecodeError:
        return content.decode("latin-1")


def leer_csv(text: str, campos_alias: dict[str, list[str]]):
    """Detecta el delimitador y mapea cada campo canónico a su cabecera real.

    Devuelve (filas, mapa, valor) donde `mapa` es {campo_canónico: cabecera_original}
    (resuelto a partir de los alias, primer alias presente gana) y
    `valor(row, campo)` lee ese campo tolerando mayúsculas/acentos/separadores.
    """
    muestra = "\n".join(text.splitlines()[:5])
    try:
        dialecto = csv.Sniffer().sniff(muestra, delimiters=",;\t|")
    except csv.Error:
        dialecto = csv.excel  # coma por defecto

    reader = csv.DictReader(io.StringIO(text), dialect=dialecto)
    filas = list(reader)

    # cabecera normalizada -> cabecera original
    presentes = {norm(h): h for h in (reader.fieldnames or [])}
    # campo canónico -> cabecera original (primer alias presente gana)
    mapa: dict[str, str] = {}
    for campo, alias in campos_alias.items():
        for a in alias:
            if a in presentes:
                mapa[campo] = presentes[a]
                break

    def valor(row: dict, campo: str) -> str:
        h = mapa.get(campo)
        return (row.get(h) or "").strip() if h else ""

    return filas, mapa, valor


def parse_int(valor: str) -> int:
    """Convierte '3' o '3.0' a int. Lanza ValueError si no es un número."""
    return int(float(valor.strip()))


def parse_float(valor: str) -> float:
    """Convierte a float tolerando la coma decimal ('29,90' -> 29.90)."""
    return float(valor.strip().replace(",", "."))
