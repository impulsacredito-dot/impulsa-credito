# Servidor de prueba local de Impulsa Crédito (no se publica en la web).
# Funciona como Vercel: /asesoria abre asesoria.html, /guias abre
# guias/index.html y una dirección que no existe muestra 404.html.
import http.server
import os
import socketserver
import sys

PUERTO = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Manejador(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=RAIZ, **kwargs)

    def translate_path(self, path):
        ruta = super().translate_path(path)
        if os.path.isdir(ruta):
            indice = os.path.join(ruta, "index.html")
            return indice if os.path.exists(indice) else ruta
        if not os.path.exists(ruta) and os.path.exists(ruta + ".html"):
            return ruta + ".html"
        return ruta

    def send_error(self, code, message=None, explain=None):
        pagina = os.path.join(RAIZ, "404.html")
        if code == 404 and os.path.exists(pagina):
            with open(pagina, "rb") as f:
                cuerpo = f.read()
            self.send_response(404)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(cuerpo)))
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(cuerpo)
            return
        super().send_error(code, message, explain)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


class Servidor(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


if __name__ == "__main__":
    with Servidor(("127.0.0.1", PUERTO), Manejador) as s:
        print("Impulsa Crédito en http://localhost:%d" % PUERTO, flush=True)
        s.serve_forever()
