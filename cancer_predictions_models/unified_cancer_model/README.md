# Unified Cancer Prediction Package

This package provides a unified prediction router that exposes four independent cancer prediction models: lung, cervical, colorectal, and oral. It does not retrain or modify any model artifacts; it uses the validated artifacts in the repository.

Installation
1. Create a Python environment (recommended Python 3.10+).
2. Install dependencies:

```bash
pip install -r requirements.txt
```

Initialization
```python
from unified_cancer_model.predictor import Predictor, predict
p = Predictor()
# or use predict helper
res = predict('lung', patient_data)
```

Selecting a cancer model
- `lung`, `cervical`, `colorectal`, `oral`

Required inputs per model
- lung: dictionary with numeric features matching the original `feature_names` in `backend/trained_models/feature_names.pkl`.
- cervical: dictionary with numeric features matching `backend/trained_models/cervical/feature_names.pkl`.
- colorectal: dictionary with feature names expected by the original training pipeline.
- oral: `{'image_path': '/path/to/image.jpg'}` pointing to an image file.

Output format
- `status`: `success` or `error`
- `cancer_type`: requested cancer
- `prediction`: numeric class label (as in underlying model)
- `probability`: when supported by the model
- `model`: model identifier

Model metrics and limitations
See `MODEL_REPORT.md` for validated metrics. Limitations are documented there and must be reviewed before deployment.

Compatibility
- Models were validated in this repository's environment. scikit-learn pickled artifacts may require compatible scikit-learn versions.
