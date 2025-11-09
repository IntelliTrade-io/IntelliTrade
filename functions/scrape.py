from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import json

from scraper.runner import run

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            # Parse query parameters
            parsed = urlparse(self.path)
            params = parse_qs(parsed.query)
            
            # Extract parameters with defaults
            since = int(params.get('since', ['0'])[0])
            until = int(params.get('until', ['15'])[0])
            central_banks = params.get('central_banks', ['true'])[0].lower() == 'true'
            include_global = params.get('global', ['true'])[0].lower() == 'true'
            
            # Run scraper
            events = run(
                since_days=since,
                until_days=until,
                include_central_banks=central_banks,
                include_global=include_global
            )
            
            body = json.dumps(events, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))