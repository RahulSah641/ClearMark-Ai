"""Serve the bundled ClearMark Ai locally using Python 3."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading
import webbrowser

class Handler(SimpleHTTPRequestHandler):
    extensions_map = dict(SimpleHTTPRequestHandler.extensions_map, **{'.mjs': 'text/javascript', '.js': 'text/javascript'})

if __name__ == '__main__':
    folder = Path(__file__).resolve().parent / 'dist'
    if not (folder / 'index.html').is_file():
        raise SystemExit('Please extract the entire ZIP before running this file.')
    try:
        server = ThreadingHTTPServer(('127.0.0.1', 8000), partial(Handler, directory=str(folder)))
    except OSError:
        raise SystemExit('Port 8000 is already in use. Close the other local server and try again.')
    print('ClearMark Ai: http://localhost:8000')
    print('Press Ctrl+C to stop. Files stay on this computer.')
    opener = threading.Timer(0.5, lambda: webbrowser.open('http://localhost:8000'))
    opener.daemon = True
    opener.start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nServer stopped.')
    finally:
        server.server_close()
