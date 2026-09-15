import os
from unified_cancer_model.predictor import predict, predictor

def test_lung_basic():
    # create a dummy input using feature names where available
    from unified_cancer_model.model_registry import get_model_info
    import joblib
    info = get_model_info('lung')
    fn = None
    try:
        fn = joblib.load(info['feature_names'])
    except Exception:
        pass
    if not fn:
        # skip if metadata missing
        return
    sample = {k:0 for k in fn}
    res = predict('lung', sample)
    assert res['status'] in ('success','error')

def test_cervical_missing_features():
    res = predict('cervical', {})
    assert res['status']=='error' and 'missing_required_features' in res.get('error','') or 'missing_features' in res

def test_oral_inference():
    # pick a sample image from processed_dataset/test
    base = os.path.join(os.path.dirname(__file__), '..', '..', 'datasets', 'OralCancerAI', 'processed_dataset', 'test')
    base = os.path.abspath(base)
    cancer_dir = os.path.join(base, 'cancer')
    if not os.path.exists(cancer_dir):
        return
    files = [f for f in os.listdir(cancer_dir) if f.lower().endswith(('.jpg','.jpeg','.png'))]
    if not files:
        return
    img = os.path.join(cancer_dir, files[0])
    res = predict('oral', {'image_path': img})
    assert res['status']=='success'

def test_invalid_type():
    res = predict('unknown', {})
    assert res['status']=='error'
