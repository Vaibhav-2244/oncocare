import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
project_root = ROOT.parent

zip_path = project_root / 'cancer_prediction_models.zip'
to_include = []

# Include package files
pkg_dir = ROOT
for p in pkg_dir.rglob('*'):
    if p.is_file():
        # exclude tests' intermediate files if any
        rel = p.relative_to(project_root)
        to_include.append((p, rel))

# Include model artifacts explicitly
artifacts = [
    project_root / 'trained_models' / 'lung_cancer_model.pkl',
    project_root / 'trained_models' / 'scaler.pkl',
    project_root / 'trained_models' / 'label_encoders.pkl',
    project_root / 'trained_models' / 'feature_names.pkl',
    project_root / 'trained_models' / 'feature_config.pkl',
    project_root / 'trained_models' / 'cervical' / 'cervical_cancer_model.pkl',
    project_root / 'trained_models' / 'cervical' / 'scaler.pkl',
    project_root / 'trained_models' / 'cervical' / 'feature_names.pkl',
    project_root / 'datasets' / 'colorectal model' / 'models' / 'colorectal_cancer_model.pkl',
    project_root / 'datasets' / 'OralCancerAI' / 'weights' / 'best_model.pth'
]

for a in artifacts:
    if a.exists():
        to_include.append((a, a.relative_to(project_root)))

with zipfile.ZipFile(zip_path, 'w', compression=zipfile.ZIP_DEFLATED) as z:
    for src, rel in to_include:
        z.write(src, rel)

print('Created', zip_path)
