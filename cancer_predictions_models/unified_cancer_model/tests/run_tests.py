import sys
import os
# Ensure backend directory is on sys.path so `unified_cancer_model` package can be imported
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, backend_dir)

from unified_cancer_model.tests.test_integration import test_lung_basic, test_cervical_missing_features, test_oral_inference, test_invalid_type

tests = [
    ('invalid_type', test_invalid_type),
    ('cervical_missing_features', test_cervical_missing_features),
    ('oral_inference', test_oral_inference),
    ('lung_basic', test_lung_basic)
]

results = {}
for name, fn in tests:
    try:
        fn()
        results[name] = 'PASS'
    except AssertionError as e:
        results[name] = f'FAIL - {e}'
    except Exception as e:
        results[name] = f'ERROR - {type(e).__name__}: {e}'

print('Integration test results:')
for k,v in results.items():
    print(f'{k}: {v}')
