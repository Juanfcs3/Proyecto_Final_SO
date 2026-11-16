import os

from flask import Flask, jsonify
from prometheus_client import Counter, Histogram, make_wsgi_app
from werkzeug.middleware.dispatcher import DispatcherMiddleware

app = Flask(__name__)
instance_id = os.environ.get("INSTANCE_ID", "backend-local")

requests = Counter("backend_http_requests_total", "Solicitudes HTTP al backend")
latency = Histogram(
    "backend_http_request_duration_seconds",
    "Latencia HTTP del backend en segundos",
    buckets=(0.00005, 0.0001, 0.00025, 0.0005, 0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10),
)


@app.get("/")
@latency.time()
def index():
    requests.inc()
    return jsonify(instance=instance_id)


application = DispatcherMiddleware(app, {"/metrics": make_wsgi_app()})
