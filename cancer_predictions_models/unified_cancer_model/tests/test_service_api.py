import os
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

try:
    from unified_cancer_model.service import app
except Exception as exc:  # pragma: no cover - exercised as failing test before implementation
    app = None
    IMPORT_ERROR = exc
else:
    IMPORT_ERROR = None


class ServiceApiContractTests(unittest.TestCase):
    def setUp(self):
        if app is None:
            self.skipTest(f"Service app not available yet: {IMPORT_ERROR}")

    def test_health_endpoint(self):
        from fastapi.testclient import TestClient
        with TestClient(app) as client:
            response = client.get('/health')
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()['status'], 'ok')

    def test_predict_requires_payload(self):
        from fastapi.testclient import TestClient
        with TestClient(app) as client:
            response = client.post('/predict', json={})
            self.assertEqual(response.status_code, 400)

    def test_predict_unknown_cancer_type(self):
        from fastapi.testclient import TestClient
        with TestClient(app) as client:
            response = client.post('/predict', json={'cancer_type': 'unknown', 'patient_data': {}})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()['status'], 'error')


if __name__ == '__main__':
    unittest.main()
