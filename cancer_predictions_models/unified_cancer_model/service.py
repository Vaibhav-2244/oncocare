from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Dict

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from unified_cancer_model.predictor import model_metadata, predict as run_prediction

app = FastAPI(
    title='OncoCare Cancer Prediction Service',
    version='1.0.0',
    description='Separate Python backend for cancer risk prediction models.',
)


class PredictionRequest(BaseModel):
    cancer_type: str | None = Field(default=None, alias='cancerType')
    patient_data: Dict[str, Any] | None = Field(default=None, alias='patientData')

    model_config = ConfigDict(populate_by_name=True, arbitrary_types_allowed=True)


@app.get('/health')
def health() -> dict[str, Any]:
    return {
        'status': 'ok',
        'service': 'oncocare-cancer-model',
        'supported_cancers': ['lung', 'cervical', 'colorectal', 'oral'],
    }


@app.get('/metadata/{cancer_type}')
def metadata(cancer_type: str) -> dict[str, Any]:
    return model_metadata(cancer_type)


@app.post('/predict')
def predict(request: PredictionRequest) -> dict[str, Any]:
    cancer_type = (request.cancer_type or '').strip()
    patient_data = request.patient_data or {}

    if not request or not cancer_type:
        raise HTTPException(status_code=400, detail='cancer_type is required.')
    if not isinstance(patient_data, dict):
        raise HTTPException(status_code=400, detail='patient_data must be an object.')

    result = run_prediction(cancer_type, patient_data)
    return result


if __name__ == '__main__':
    import uvicorn

    uvicorn.run('unified_cancer_model.service:app', host='0.0.0.0', port=8001, reload=False)
