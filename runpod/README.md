# RunPod

RunPod is used **offline only**. The live app never calls a GPU, so there is no endpoint and no `handler.py`.

| Job | File | Status |
| --- | --- | --- |
| Compare 5 embedding models on a 30-pair skill test | `pipeline/compare_embeddings.py` | Done 22 Oct 2026 (`testing/results/`) |
| bge-m3 skill similarity, all skill pairs | `pipeline/suggest_similar.py` | Done 22 Oct 2026 (`data/runpod/similar_review.csv`) |
| Task AI-exposure labelling | `pipeline/runpod_label.py` | Not run yet |

Steps: [pipeline/README.md](../pipeline/README.md). Evidence (pod id, GPU, price, billing): [testing/runpod_evidence.md](../testing/runpod_evidence.md).
