# MODEL REPORT

Validated metrics (from workspace evaluation):

## Lung
- Model file: ../trained_models/lung_cancer_model.pkl
- Accuracy: 0.6517
- Precision: 0.2223
- Recall: 0.2326
- F1: 0.2273
- ROC-AUC: 0.5018
- Test samples: 178000
- Note: weak predictive performance

## Cervical
- Model file: ../trained_models/cervical/cervical_cancer_model.pkl
- Accuracy: 0.9244
- Precision: 0.2500
- Recall: 0.0909
- F1: 0.1333
- ROC-AUC: 0.6951
- Test samples: 172
- Note: weak positive-case detection

## Colorectal
- Model file: ../datasets/colorectal model/models/colorectal_cancer_model.pkl
- Accuracy: 0.5283
- Precision: 0.6023
- Recall: 0.6281
- F1: 0.6149
- ROC-AUC: 0.5054
- Test samples: 33500
- Note: weak-to-moderate predictive performance

## Oral
- Model file: ../datasets/OralCancerAI/weights/best_model.pth
- Accuracy: 0.9915
- Precision: 0.9935
- Recall: 0.9903
- F1: 0.9919
- ROC-AUC: 0.9999
- Test samples: 591
- Note: strong performance on the provided processed test set

Limitations
- No models were retrained or modified during validation.
- scikit-learn pickled artifacts may require matching scikit-learn versions to avoid `InconsistentVersionWarning`.
- Oral evaluation required a no-plot runner due to matplotlib / NumPy binary compatibility; inference and metrics were computed using the original transforms and model weights.
