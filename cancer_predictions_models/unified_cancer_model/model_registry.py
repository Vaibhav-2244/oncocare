from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _candidate_paths(*parts: str) -> list[Path]:
    base = ROOT
    candidates = [base.joinpath(*parts)]
    if len(parts) > 1 and parts[0] == 'trained_models':
        candidates.append(base.joinpath('trained_models', *parts[1:]))
    return [path.resolve() for path in candidates if path.exists()]


def _find_file(filename_candidates, search_roots):
    for filename in filename_candidates:
        for root in search_roots:
            match = root.rglob(filename)
            for found in match:
                if found.is_file():
                    return found.resolve()
    return None


MODEL_PATHS = {
    'lung': {
        'model_file': _find_file(['lung_cancer_model.pkl'], [ROOT / 'trained_models', ROOT / 'datasets']),
        'scaler': _find_file(['scaler.pkl'], [ROOT / 'trained_models', ROOT / 'datasets']),
        'label_encoders': _find_file(['label_encoders.pkl'], [ROOT / 'trained_models', ROOT / 'datasets']),
        'feature_names': _find_file(['feature_names.pkl'], [ROOT / 'trained_models', ROOT / 'datasets']),
        'feature_config': _find_file(['feature_config.pkl'], [ROOT / 'trained_models', ROOT / 'datasets']),
    },
    'cervical': {
        'model_file': _find_file(['cervical_cancer_model.pkl'], [ROOT / 'trained_models', ROOT / 'datasets']),
        'scaler': _find_file(['scaler.pkl'], [ROOT / 'trained_models', ROOT / 'datasets']),
        'label_encoders': _find_file(['label_encoders.pkl'], [ROOT / 'trained_models', ROOT / 'datasets']),
        'feature_names': _find_file(['feature_names.pkl'], [ROOT / 'trained_models', ROOT / 'datasets']),
        'feature_config': _find_file(['feature_config.pkl'], [ROOT / 'trained_models', ROOT / 'datasets']),
    },
    'colorectal': {
        'model_file': _find_file(['colorectal_cancer_model.pkl'], [ROOT / 'trained_models', ROOT / 'datasets']),
        'feature_names': _find_file(['feature_names.pkl'], [ROOT / 'trained_models', ROOT / 'datasets']),
    },
    'oral': {
        'model_file': _find_file(['best_model.pth', 'oral_model.pth'], [ROOT / 'datasets', ROOT / 'trained_models']),
        'config_dir': _find_file(['OralCancerAI'], [ROOT / 'datasets', ROOT / 'trained_models']),
    },
}


def get_model_info(cancer_type):
    normalized = (cancer_type or '').strip().lower()
    if normalized not in MODEL_PATHS:
        raise KeyError(f"Unknown cancer type: {cancer_type}")

    info = MODEL_PATHS[normalized]
    for key, value in list(info.items()):
        if value is None:
            info[key] = str((ROOT / 'missing_model_placeholder').resolve())
    return info
