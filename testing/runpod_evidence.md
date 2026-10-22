# RunPod evidence: embedding model comparison

Proof that the embedding test in `testing/results/` was run on RunPod (the GPU cloud credit from the organisers).
Every value here was copied from a RunPod API reply or the script's own output. Nothing is filled in by hand.
Times are UTC, with Malaysia time (MYT = UTC+8) in brackets.

## What was run
- Script: `pipeline/compare_embeddings.py` (maths in `pipeline/embed_metrics.py`).
- Input: `testing/skill_pair_test_set.csv` (30 skill pairs).
- Models: all-MiniLM-L6-v2, all-mpnet-base-v2, paraphrase-multilingual-MiniLM-L12-v2, multilingual-e5-base, bge-m3.
- Command on the Pod: `python pipeline/compare_embeddings.py testing/skill_pair_test_set.csv testing/results`

## Log

| Time (UTC) | Step | Evidence |
|---|---|---|
| 2026-10-22 ~04:40 (12:40 MYT) | GPU price and stock check (`list-gpu-types`, community cloud) | RTX A6000 48 GB, community $0.33/hr, stock LOW |
| 2026-10-22 ~04:40 (12:40 MYT) | Create Pod: RTX A6000 community, template `runpod-torch-v280` (`runpod/pytorch:1.0.2-cu1281-torch280-ubuntu2404`) | Refused, HTTP 400: "There are no longer any instances available with the requested specifications." No Pod created, no charge. |
| 2026-10-22 ~04:45 (12:45 MYT) | Stock check again (`list-gpu-types`, secure cloud) | A40 48 GB $0.59/hr stock HIGH (EU-SE-1); RTX A5000 24 GB $0.27/hr stock LOW; RTX A6000 secure $0.59/hr stock LOW |
| 2026-10-22 04:46:46 (12:46 MYT) | Create Pod (user approved A40 secure at $0.59/hr) | Pod id `s86ra4mi4udcu1`, name `embedding-compare`, 1 × NVIDIA A40 (48 GB), Secure Cloud, data centre EU-SE-1, cost $0.59/hr, host CUDA 13.2, image `runpod/pytorch:1.0.2-cu1281-torch280-ubuntu2404`, 20 GB `/workspace` |
| 2026-10-22 04:46:50 (12:46 MYT) | Boot log (`stream-pod-logs`) | "CUDA Version 12.8.1", "Jupyter Lab started", "Start script(s) finished, Pod is ready to use." |
| 2026-10-22 ~04:47 (12:47 MYT) | Read back (`get-pod`) | status RUNNING, port 8888 mapped, JupyterLab at https://s86ra4mi4udcu1-8888.proxy.runpod.net |
| 2026-10-22 (after 04:47 UTC) | User ran `python compare_embeddings.py skill_pair_test_set.csv results` in the Pod's JupyterLab terminal (`root@a064f1877f82:/workspace`) | Finished with "Wrote summary.csv, details.csv, dot_plot.svg and run_info.json to results". Printed summary below. |
| 2026-10-22 04:58:18 (12:58 MYT) | User ran `nvidia-smi` on the Pod (timestamp from its output) | "NVIDIA A40", 46068 MiB, Driver 595.91.07, CUDA 13.2 |
| 2026-10-22 04:54:36 | `results/run_info.json` (written by the script) | ranAt 2026-10-22T04:54:36+00:00, device `cuda`, 30 pairs, 5 models, failed: none |
| 2026-10-22 ~05:04 (13:04 MYT) | User downloaded the 4 result files into `testing/results/` and saved screenshots in `testing/evidence/` | `1_nvidia_smi.png`, `1_run_and_gpu.png`, `2_script_output.png`, `3_pod_running.png` |
| 2026-10-22 ~05:05 (13:05 MYT) | Delete Pod (`delete-pod s86ra4mi4udcu1`) | HTTP 204 |
| 2026-10-22 05:05 (13:05 MYT) | Check it is gone | `get-pod` → 404 "pod not found"; `list-pods` → no pods on the account |
| 2026-10-22 05:05 (13:05 MYT) | Billing read (`list-pod-billing`, this Pod, today) | No record yet (billing posts later). Estimate: about 18 min × $0.59/hr ≈ $0.18. Confirm with the Billing screenshot, taken before submission (covers all RunPod jobs). |

### Script output on the Pod (copied from the user's terminal screenshot)
| Model | avg similar | avg related | avg different | Spearman | Order errors | Word-trap avg | BM pair | Encode s |
|---|---|---|---|---|---|---|---|---|
| all-MiniLM-L6-v2 | 0.5214 | 0.4124 | 0.3425 | 0.4339 | 85 | 0.3628 | 0.1947 | 0.39 |
| all-mpnet-base-v2 | 0.5699 | 0.4754 | 0.3387 | 0.599 | 59 | 0.355 | 0.2192 | 0.12 |
| paraphrase-multilingual-MiniLM-L12-v2 | 0.5859 | 0.4341 | 0.3783 | 0.4717 | 80 | 0.4024 | 0.3329 | 0.04 |
| multilingual-e5-base | 0.8705 | 0.8589 | 0.8409 | 0.4481 | 85 | 0.8434 | 0.8275 | 0.03 |
| bge-m3 | 0.7223 | 0.6391 | 0.5898 | 0.5377 | 71 | 0.6002 | 0.7583 | 0.05 |

## Screenshots to take (by the user)
Save them in `testing/evidence/` (create the folder) so they go into the repo with the results.
1. RunPod console, Pods page: the Pod running (name `embedding-compare`, GPU, price).
2. JupyterLab terminal: the `nvidia-smi` output and the script's printed output to the end.
3. RunPod console, Billing: the charge for this Pod after it is deleted.
