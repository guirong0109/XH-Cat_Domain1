> [!IMPORTANT]
> ## 📁 Submission Documents & Templates
> **All required submission templates are in the Google Drive folder below. Download them before you start.**
>
> ### 👉 [**OPEN THE GOOGLE DRIVE FOLDER**](https://drive.google.com/drive/folders/1xw7c2aN8N-at8hPEULzkcU76e_FFb0Ef) 👈

---

# FutureReady MY

> Helps Malaysian diploma and foundation students see how AI may change the jobs they aim for, and gives them a reskilling pathway linked to the UN SDGs.

---

## Team Information

| Field                  | Details                                     |
| ---------------------- | ------------------------------------------- |
| **Team Name**          | TODO: team name                             |
| **Team Domain**        | Domain 1 (Future-Ready Workforce)           |
| **SDG Track (1–17)**   | TODO: SDG track (the app links roles to SDG 3, 4, 8, 9, 16 and more) |
| **Team Leader**        | TODO: leader name                           |
| **University**         | TODO: university                            |
| **Number of Members**  | TODO: number                                |

## Links

| Resource          | Link                                           |
| ----------------- | ---------------------------------------------- |
| GitHub Repository | TODO: https://github.com/Guirong0109/<repo> (private until submission) |
| Live Demo         | TODO: https://<your-project>.replit.app        |
| RunPod Endpoint   | None. RunPod is used offline only (see "How We Use RunPod") |
| Slide Deck        | TODO: link                                     |
| Demo Video        | TODO: link (script: [docs/demo-script.md](docs/demo-script.md)) |

---

## Overview

### Problem

A Malaysian diploma or foundation student who is choosing a degree path or a first job has no clear view of how AI will change those jobs. Official job data is by broad job group, and AI-exposure research is global, so it is hard to turn into a personal decision.

### Solution

In five simple steps the student goes from a skills profile and a goal to ranked future roles and a step-by-step study plan. Roles, tasks and skills come only from the official Malaysian eMASCO occupation standard. AI (open models) is used to read CVs, compare skills and estimate AI exposure of tasks. It supports the student's decision and never makes it. Every number shows its source and date. Full description: [docs/project-details.md](docs/project-details.md).

### Key Features

- **Skills profile intake** — pick your major or sector, tick skills with levels, optionally read a PDF CV (read in your browser; only its text goes to our own server, never stored or logged), set a goal and SDGs. Sample students only, no real CVs.
- **AI-trend signal layer** — live OpenDOSM employment trend per job group, AI-exposure labels on eMASCO tasks, ILO 2025 index as a second opinion, and an Emerging feed of recent AI news (information only).
- **Future-role matching** — roles ranked by an explainable Current Skill Match with a "Why this score?" panel; "Explore all roles" covers all 1,814 eMASCO occupations.
- **Personalised reskilling pathway** — gap skills ordered by importance, hour estimates, links to official course portals (HRD Corp e-Latih, MyTVET), progress tick-boxes.
- **SDG mapping** — every role and skill carries SDG tags with the target cited; the SDG panel counts which goals the pathway builds.
- **Handling uncertainty** — Moderate and Fast AI scenarios, score ranges, and every AI-made label is disclosed as an estimate.

### Tech Stack

| Layer         | Technology                   |
| ------------- | ---------------------------- |
| Frontend      | React 19, Vite, Tailwind     |
| Backend       | Node.js 22, Express 5        |
| Database      | None (committed JSON files in `data/`) |
| Data pipeline | Python 3.10+ (standard library only) |
| AI / Compute  | bge-m3 (ONNX, CV reading and skill matching); RunPod (GPU) for offline model tests and skill similarity |
| Hosting / Dev | Replit                       |

---

## Project Structure

```
.
├── docs/                    # Documentation, specs, plans, screenshots
│   └── project-details.md   # Full project description (formerly the README)
├── runpod/                  # RunPod notes (the GPU job lives in pipeline/)
├── src/                     # React app (screens, components, lib/scoring.js)
├── server/                  # Express API, OpenDOSM / OpenAlex / eMASCO readers, CV matching
├── pipeline/                # Python data pipeline + RunPod jobs (runpod_label.py, compare_embeddings.py)
├── scripts/                 # Node scripts (embeddings, evaluation)
├── data/                    # Generated app data, eMASCO snapshot, team inputs
├── testing/                 # Test sets and evaluation results (incl. RunPod evidence)
├── submission/              # Required submission documents
│   ├── SDC2026_TeamName_Preliminary.pdf      # Preliminary submission (to add)
│   ├── SDC2026_TeamName_TechDeclaration.pdf  # Technology declaration (to add)
│   ├── SDC2026_TeamName_Replit_POU.pdf       # Replit proof of use (to add)
│   └── SDC2026_TeamName_Runpod_POU.pdf       # RunPod proof of use (to add)
├── tests/                   # Vitest unit tests (pipeline tests are in pipeline/tests)
├── .env.example             # Example environment variables
├── .gitignore
├── .replit                  # Replit run configuration
├── LICENSE
├── package.json             # Node dependencies and scripts
└── README.md
```

### Architecture

```
Student ──► Replit (React app + Express API) ──► committed data (eMASCO, ILO, OpenDOSM cache)
                        │
                        ├──► OpenDOSM / OpenAlex (live refresh)
                        └──► bge-m3 on the server (CV reading, when the model is present)

RunPod (GPU, offline) ──► model tests + skill similarity ──► results committed to data/ and testing/
```

---

## How to Run

### Option 1 — Run on Replit (Recommended)

1. Open the Replit project (TODO: link), or import this repository via **Create Repl → Import from GitHub**.
2. Optional: open the **Secrets** tab (🔒) and add variables from `.env.example`. The app runs without any secret.
3. Click **Run**. The `.replit` file builds the app and starts `npm start` on port 3000. On Replit the CV AI step is off (no model files) and the app uses keyword matching.

### Option 2 — Run Locally

```bash
# 1. Clone the repository
git clone https://github.com/Guirong0109/<repo>.git
cd <repo>

# 2. Install dependencies (Node 22.12 or newer)
npm install

# 3. Configure environment variables (all optional)
cp .env.example .env

# 4. Build and run
npm run build
npm start        # http://localhost:3000
```

For development run `npm run dev` (Vite on :5173) in one terminal and `npm start` in another. CV AI matching needs the bge-m3 model in `models/`; see [docs/project-details.md](docs/project-details.md#run-locally).

### Run Tests

```bash
npm test
python -m unittest discover pipeline/tests
```

---

## How We Use Replit *(Required)*

- **Hosting:** the app is deployed with Replit Deployments (`.replit`: build `npm run build`, run `NODE_ENV=production npm start`) at the Live Demo link above.
- **Secrets:** optional API keys are read from environment variables and are never committed.

📄 Proof of use: [`submission/SDC2026_TeamName_Replit_POU.pdf`](submission/SDC2026_TeamName_Replit_POU.pdf)

## How We Use RunPod *(Required)*

- **Workload:** RunPod GPU Pods are used **offline** to compare 5 embedding models on a 30-pair skill test, and to run bge-m3 skill-similarity on all skill pairs. About USD 0.25 in total on 22 Oct 2026. The task-labelling job (`pipeline/runpod_label.py`) has not been run yet.
- **Setup:** jobs are in `pipeline/` (`compare_embeddings.py`, `runpod_label.py`); steps in [pipeline/README.md](pipeline/README.md). Results are committed (`testing/results/`, `data/runpod/`).
- **Integration:** the live app never calls a GPU, so there is no RunPod endpoint. Details: [runpod/README.md](runpod/README.md); evidence log: [testing/runpod_evidence.md](testing/runpod_evidence.md).

📄 Proof of use: [`submission/SDC2026_TeamName_Runpod_POU.pdf`](submission/SDC2026_TeamName_Runpod_POU.pdf)

---

## Challenges & Learnings

- Trend data is hard to keep current: OpenDOSM updates yearly and only by major job group, so we added dated caches, a failure monitor and a visible "last checked" date on every number.
- AI must not invent jobs or courses: roles, tasks and skills come only from eMASCO, course links go only to official portals, and AI-made labels are disclosed as estimates.
- CV reading accuracy is limited (measured on small made-up test sets); the student confirms every AI suggestion.
- See "Risks and fallbacks" in [docs/project-details.md](docs/project-details.md).

## Future Improvements

- [ ] Run the RunPod task-labelling job to replace sample AI-exposure labels
- [ ] Team review of drafted mappings (ISCO map, SDG tags, similar skills)
- [ ] Bahasa Malaysia and Chinese UI (preview exists)
- [ ] Other users: graduates, counsellors, HR teams (preview exists)

## Team

| Name        | Role                | GitHub                                   |
| ----------- | ------------------- | ---------------------------------------- |
| TODO        | Team Lead           | [@Guirong0109](https://github.com/Guirong0109) |
| TODO        | TODO                | TODO                                     |

---

## Submission Checklist

- [ ] Team name, domain (Domain 1 / Domain 2) and SDG track filled in
- [ ] Slide deck link added
- [ ] Demo video link added
- [ ] Replit used, with proof of use in `submission/`
- [ ] RunPod used, with proof of use in `submission/`
- [ ] Preliminary submission completed (`SDC2026_TeamName_Preliminary.pdf`)
- [ ] Technology declaration completed (`SDC2026_TeamName_TechDeclaration.pdf`)
- [ ] Submission files renamed with your team name (replace `TeamName`)
- [ ] "How to Run" steps verified
- [ ] No API keys or secrets committed to the repository
- [ ] Repository made public on submission day

## License

This project is licensed under the [Apache License 2.0](LICENSE).
