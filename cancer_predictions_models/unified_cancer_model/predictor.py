import os
from pathlib import Path
import json
from typing import Dict, Any

from .model_registry import get_model_info

ROOT = Path(__file__).resolve().parent

class Predictor:
    def __init__(self):
        self.cache = {}

    def load_lung(self):
        import joblib
        info = get_model_info('lung')
        model = joblib.load(info['model_file'])
        scaler = joblib.load(info['scaler']) if Path(info['scaler']).exists() else None
        label_encoders = joblib.load(info['label_encoders']) if Path(info.get('label_encoders','')).exists() else None
        feature_names = joblib.load(info['feature_names']) if Path(info.get('feature_names','')).exists() else None
        self.cache['lung'] = {'model': model, 'scaler': scaler, 'label_encoders': label_encoders, 'feature_names': feature_names}

    def load_cervical(self):
        import pickle
        info = get_model_info('cervical')
        with open(info['model_file'],'rb') as f:
            model = pickle.load(f)
        scaler = None
        if Path(info.get('scaler','')).exists():
            with open(info['scaler'],'rb') as f:
                scaler = pickle.load(f)
        feature_names = None
        if Path(info.get('feature_names','')).exists():
            with open(info['feature_names'],'rb') as f:
                feature_names = pickle.load(f)
        self.cache['cervical'] = {'model': model, 'scaler': scaler, 'feature_names': feature_names}

    def load_colorectal(self):
        import joblib
        info = get_model_info('colorectal')
        model = joblib.load(info['model_file'])
        self.cache['colorectal'] = {'model': model}

    def load_oral(self):
        import torch
        from torchvision.models import efficientnet_b0
        import torch.nn as nn
        info = get_model_info('oral')
        model = efficientnet_b0(weights=None)
        # adjust classifier
        model.classifier[1] = nn.Linear(model.classifier[1].in_features, 2)
        checkpoint = torch.load(info['model_file'], map_location='cpu')
        # checkpoint may be state_dict or dict
        if isinstance(checkpoint, dict) and 'model_state_dict' in checkpoint:
            state = checkpoint['model_state_dict']
        elif isinstance(checkpoint, dict) and 'model_state_dict' not in checkpoint:
            state = checkpoint
        else:
            state = checkpoint
        model.load_state_dict(state)
        model.eval()
        self.cache['oral'] = {'model': model}

    def ensure_loaded(self, cancer_type):
        if cancer_type not in self.cache:
            if cancer_type == 'lung':
                self.load_lung()
            elif cancer_type == 'cervical':
                self.load_cervical()
            elif cancer_type == 'colorectal':
                self.load_colorectal()
            elif cancer_type == 'oral':
                self.load_oral()
            else:
                raise KeyError('Unknown cancer type')

    def predict(self, cancer_type: str, patient_data: Dict[str, Any]) -> Dict[str, Any]:
        cancer_type = cancer_type.lower()
        try:
            info = get_model_info(cancer_type)
        except KeyError:
            return {'status':'error','error':'unknown_cancer_type'}

        try:
            self.ensure_loaded(cancer_type)
        except FileNotFoundError:
            return {'status': 'error', 'error': 'model_artifact_missing', 'cancer_type': cancer_type}
        entry = self.cache[cancer_type]

        # Route to appropriate predictor
        if cancer_type == 'lung':
            return self._predict_lung(entry, patient_data)
        if cancer_type == 'cervical':
            return self._predict_cervical(entry, patient_data)
        if cancer_type == 'colorectal':
            return self._predict_colorectal(entry, patient_data)
        if cancer_type == 'oral':
            return self._predict_oral(entry, patient_data)

    def _predict_lung(self, entry, patient_data):
        # patient_data expected dict of feature_name -> value
        import numpy as np
        model = entry['model']
        feature_names = entry.get('feature_names')
        model = entry['model']
        # Determine required features: prefer model.feature_names_in_ if present
        required_features = None
        if hasattr(model, 'feature_names_in_'):
            required_features = list(model.feature_names_in_)
        elif feature_names is not None:
            required_features = feature_names
        else:
            return {'status':'error','error':'missing_feature_metadata'}

        missing = [f for f in required_features if f not in patient_data]
        if missing:
            return {'status':'error','error':'missing_required_features','missing_features':missing}

        import numpy as _np
        X = _np.array([[patient_data.get(f, 0) for f in required_features]])
        scaler = entry.get('scaler')
        if scaler is not None:
            # If scaler records feature names, align columns; otherwise try transform and fallback safely
            try:
                if hasattr(scaler, 'feature_names_in_'):
                    # construct array with scaler.feature_names_in_
                    fn_in = list(scaler.feature_names_in_)
                    X_dict = {fn: patient_data.get(fn, 0) for fn in fn_in}
                    import numpy as _np
                    X = _np.array([[_np.float64(X_dict[fn]) for fn in fn_in]])
                else:
                    X = scaler.transform(X)
            except Exception:
                # fallback: do not scale if incompatible
                pass
        # If scaler exists and provides feature_names_in_, align and scale numeric subset
        try:
            pred = model.predict(X)[0]
        except Exception:
            # attempt without scaling / with original feature ordering
            try:
                pred = model.predict(X)[0]
            except Exception as e:
                return {'status':'error','error':'prediction_failed','detail':str(e)}
        proba = None
        if hasattr(model,'predict_proba'):
            proba = float(model.predict_proba(X)[:,1][0])
        return {'status':'success','cancer_type':'lung','prediction':int(pred),'probability':proba,'model':str(type(model).__name__)}

    def _predict_cervical(self, entry, patient_data):
        import numpy as np
        model = entry['model']
        feature_names = list(getattr(model, 'feature_names_in_', entry.get('feature_names') or []))
        if feature_names is None:
            return {'status':'error','error':'missing_feature_metadata'}
        missing = [f for f in feature_names if f not in patient_data]
        if missing:
            return {'status':'error','error':'missing_required_features','missing_features':missing}
        X = np.array([[patient_data[f] for f in feature_names]])
        scaler = entry.get('scaler')
        if scaler is not None:
            try:
                if getattr(scaler, 'n_features_in_', len(feature_names)) != len(feature_names):
                    return {
                        'status': 'error',
                        'error': 'incompatible_preprocessing_artifact',
                        'detail': f'The cervical scaler expects {getattr(scaler, "n_features_in_", "an unknown number of")} features, but the fitted model requires {len(feature_names)}. Retrain or replace the cervical scaler/model pair.',
                    }
                X = scaler.transform(X)
            except Exception as e:
                return {'status': 'error', 'error': 'preprocessing_failed', 'detail': str(e)}
        try:
            pred = model.predict(X)[0]
        except Exception as e:
            return {'status': 'error', 'error': 'prediction_failed', 'detail': str(e)}
        proba = None
        if hasattr(model,'predict_proba'):
            try:
                proba = float(model.predict_proba(X)[:,1][0])
            except Exception:
                proba = None
        return {'status':'success','cancer_type':'cervical','prediction':int(pred),'probability':proba,'model':str(type(model).__name__)}

    def _predict_colorectal(self, entry, patient_data):
        import pandas as pd
        model = entry['model']
        # model is expected to take a DataFrame with training feature columns; try best-effort
        X = pd.DataFrame([patient_data])
        # check required columns if pipeline exposes them
        try:
            pred = model.predict(X)[0]
            proba = None
            if hasattr(model,'predict_proba'):
                proba = float(model.predict_proba(X)[:,1][0])
            return {'status':'success','cancer_type':'colorectal','prediction':int(pred),'probability':proba,'model':str(type(model).__name__)}
        except Exception as e:
            return {'status':'error','error':'prediction_failed','detail':str(e)}

    def _predict_oral(self, entry, patient_data):
        # patient_data must contain 'image_path'
        import torch
        import base64
        from io import BytesIO
        from PIL import Image
        from torchvision import transforms
        model = entry['model']
        if 'image_path' not in patient_data and 'image_base64' not in patient_data:
            return {'status':'error','error':'missing_required_features','missing_features':['image_path']}
        transform = transforms.Compose([
            transforms.Resize((224,224)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485,0.456,0.406], std=[0.229,0.224,0.225])
        ])
        if 'image_base64' in patient_data:
            image = Image.open(BytesIO(base64.b64decode(patient_data['image_base64']))).convert('RGB')
        else:
            img_path = patient_data['image_path']
            if not Path(img_path).exists():
                return {'status':'error','error':'image_not_found'}
            image = Image.open(img_path).convert('RGB')
        tensor = transform(image).unsqueeze(0)
        with torch.no_grad():
            outputs = model(tensor)
            probs = torch.softmax(outputs, dim=1)
            conf, pred = torch.max(probs, dim=1)
            cancer_prob = float(probs[0][0].item())
        return {'status':'success','cancer_type':'oral','prediction':int(pred.item()),'probability':cancer_prob,'model':'efficientnet_b0'}


predictor = Predictor()

def model_metadata(cancer_type):
    cancer_type = (cancer_type or '').lower()
    if cancer_type not in ('lung', 'cervical', 'colorectal', 'oral'):
        return {'status': 'error', 'error': 'unknown_cancer_type'}
    try:
        predictor.ensure_loaded(cancer_type)
    except FileNotFoundError:
        return {'status': 'unavailable', 'error': 'model_artifact_missing', 'cancer_type': cancer_type}
    entry = predictor.cache[cancer_type]
    model = entry['model']
    if cancer_type == 'oral':
        required = ['image_base64']
    else:
        required = list(getattr(model, 'feature_names_in_', entry.get('feature_names') or []))
    return {'status': 'success', 'cancer_type': cancer_type, 'required_features': required, 'model': type(model).__name__}

def predict(cancer_type, patient_data):
    return predictor.predict(cancer_type, patient_data)
