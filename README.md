# FutureReady MY

> Helps Malaysian diploma and foundation students see how AI may change the jobs they aim for, and gives them a reskilling pathway linked to the UN SDGs.

---

## Team Information

| Field                  | Details                                     |
| ---------------------- | ------------------------------------------- |
| **Team Name**          | XH-Cat                                      |
| **Team Domain**        | Domain 1 (Future-Ready Workforce)           |
| **SDG Track (1–17)**   | 8,4                                         |
| **Team Leader**        | Yip Gui Rong                                |
| **University**         | Multimedia University                       |
| **Number of Members**  | 2                                           |

## Links

| Resource          | Link                                           |
| ----------------- | ---------------------------------------------- |
| GitHub Repository | https://github.com/guirong0109/XH-Cat_Domain1  |
| Live Demo         | https://xh-cat-domain-1.replit.app/            |
| RunPod Endpoint   | None. RunPod is used offline only (see "How We Use RunPod") |
| Slide Deck        | [docs/FutureReady-MY-pitch-deck.html](docs/FutureReady-MY-pitch-deck.html) (open the file in a browser) |
| Demo Video        | https://youtu.be/A5YUlu3V_tA |

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
├── docs/                    # Documentation, specs, plans, screenshots, pitch deck
│   └── project-details.md   # Full project description (formerly the README)
├── runpod/                  # RunPod notes (the GPU job lives in pipeline/)
├── src/                     # React app (screens, components, lib/scoring.js)
├── server/                  # Express API, OpenDOSM / OpenAlex / eMASCO readers, CV matching
├── pipeline/                # Python data pipeline + RunPod jobs (runpod_label.py, compare_embeddings.py)
├── scripts/                 # Node scripts (embeddings, evaluation)
├── data/                    # Generated app data, eMASCO snapshot, team inputs
├── testing/                 # Test sets and evaluation results (incl. RunPod evidence)
├── submission/              # Required submission documents
│   ├── SDC2026_Hackathon_XH-Cat_Preliminary.pdf  # Preliminary submission
│   ├── SDC2026_XH-Cat_TechDeclaration.pdf     # Technology declaration (to add)
│   ├── SDC2026_XH-Cat_Replit_POU.pdf           # Replit proof of use
│   └── SDC2026_XH-Cat_Runpod_POU.pdf           # RunPod proof of use
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
Student (browser, React)
  |  picks major and skills / PDF CV read in the browser / goal
  v
Express API (Node 22)  ---->  BAAI/bge-m3 embedding model (local ONNX)
  |   ^                         multilingual (English + Bahasa Malaysia), not a chat LLM
  |   |                         text -> vector; closeness = cosine similarity (0 to 1)
  v   |                         used for: CV lines, skill search, role ranking, task matching
  |
  +--> 1. Role ranking (embedding search)
  |      Reference data (assumption): eMASCO role pages are taken as the official
  |      truth for what a role needs; eMASCO gives no skill importance, so we
  |      assume: specific skill = 1.5, basic skill = 1.0.
  |      Each role and each student skill/CV line becomes a vector.
  |      role similarity = mean of the 5 best-matching student lines vs the role vector
  |      -> ranked roles ("AI fit", an estimate, not a percentage)
  |
  +--> 2. Current Skill Match (fixed formula, no AI; the match is never changed by AI)
  |      credit per skill C: same skill = 1, team-reviewed similar skill = 0.5,
  |                          then x level (Basic 0.5, Good 0.8, Expert 1.0)
  |      Current Skill Match = 100 x sum(I x C) / sum(I)      I = skill importance
  |      Example: role has 2 specific skills (I=1.5) and 1 basic (I=1.0).
  |        student has skill A at Good (0.8), skill B missing (0), skill C at Expert (1.0)
  |        = 100 x (1.5x0.8 + 1.5x0 + 1.0x1.0) / (1.5 + 1.5 + 1.0) = 100 x 2.2 / 4.0 = 55%
  |
  +--> 3. AI exposure of a role (shown beside the match, never part of it)
         a) eMASCO tasks of the role are matched to O*NET tasks by bge-m3
            (keep cosine >= 0.80; need at least 3 matched tasks, else "not enough data")
         b) Anthropic Economic Index gives observed AI use per O*NET task (0 to 1)
         c) role AI use = average over its matched tasks
         d) tasks are classified in three categories:
              Automatable   = AI can do the task itself
              AI-assisted   = AI helps, the person still decides
              Human-led     = needs people (judgement, care, presenting)
            observed AI use covers the matched tasks; the AI-made labels
            (labelled "estimate") cover the rest:
            automatable % = w x observed share + (1 - w) x label,  w = matched / total tasks
         e) Job outlook = 0.5 x demand (OpenDOSM) + 0.5 x (100 - automatable % x scenario)
            scenario: Moderate 0.6, Fast 1.0
  |
  v
JSON data store  <----  refresh jobs (weekly GitHub Action, Refresh button, admin checks)
  ...
```

---

## How to Run

### Option 1 — Run on Replit (Recommended)

1. Open the [Replit project](https://xh-cat-domain-1.replit.app/), or import this repository via **Create Repl → Import from GitHub**.
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

For development run `npm run dev` (Vite on :5173) in one terminal and `npm start` in another.

#### Local AI model (optional, for the CV AI step)

The app runs without it: CV reading then uses keyword matching only. For the AI step ("Found by AI · estimate") the server needs the open **BAAI/bge-m3** embedding model (ONNX export `Xenova/bge-m3`, about 2.2 GB, 2–3 GB RAM). It runs on your own machine through `@huggingface/transformers`; no API key and no outside service. Choose one:

1. **Use a model folder (default).** Put the model in the git-ignored `models/` folder so that this file exists: `models/Xenova/bge-m3/onnx/model.onnx`. To use another folder, set `MODELS_DIR=<folder>`.
2. **Let the server download it once.** Start with `CV_AI_DOWNLOAD=on npm start`.
3. **Use a remote embedding service.** Set `EMBED_URL=<url>`. The CV text is then sent to that service.

The server log shows "AI model ready" when it is loaded. Until then `POST /api/cv-skills` answers 503 and the app falls back to keywords. It is off on Replit (no model files). More detail: [docs/project-details.md](docs/project-details.md#run-locally).

### Run Tests

```bash
npm test
python -m unittest discover pipeline/tests
```

---

## How We Use Replit *(Required)*

- **Hosting:** the app is deployed with Replit Deployments (`.replit`: build `npm run build`, run `NODE_ENV=production npm start`) at the Live Demo link above.
- **Secrets:** optional API keys are read from environment variables and are never committed.

📄 Proof of use: [`submission/SDC2026_XH-Cat_Replit_POU.pdf`](submission/SDC2026_XH-Cat_Replit_POU.pdf)

## How We Use RunPod *(Required)*

- **Workload:** RunPod GPU Pods are used **offline** to compare 5 embedding models on a 30-pair skill test, and to run bge-m3 skill-similarity on all skill pairs. About USD 0.25 in total on 22 Oct 2026. The task-labelling job (`pipeline/runpod_label.py`) has not been run yet.
- **Setup:** jobs are in `pipeline/` (`compare_embeddings.py`, `runpod_label.py`); steps in [pipeline/README.md](pipeline/README.md). Results are committed (`testing/results/`, `data/runpod/`).
- **Integration:** the live app never calls a GPU, so there is no RunPod endpoint. Details: [runpod/README.md](runpod/README.md); evidence log: [testing/runpod_evidence.md](testing/runpod_evidence.md).

📄 Proof of use: [`submission/SDC2026_XH-Cat_Runpod_POU.pdf`](submission/SDC2026_XH-Cat_Runpod_POU.pdf)

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
| Yip Gui Rong| Team Lead           | [@Guirong0109](https://github.com/Guirong0109) |
| Sit Jia En  | Member              | [@Jane2151](https://github.com/Jane2151) |

---

## Submission Checklist

- [x] Team name, domain (Domain 1 / Domain 2) and SDG track filled in
- [x] Slide deck link added
- [ ] Demo video link added
- [x] Replit used, with proof of use in `submission/`
- [x] RunPod used, with proof of use in `submission/`
- [x] Preliminary submission completed (`SDC2026_Hackathon_XH-Cat_Preliminary.pdf`)
- [ ] Technology declaration completed (`SDC2026_XH-Cat_TechDeclaration.pdf`, still to add)
- [ ] Submission files renamed with your team name (done except the Technology declaration)
- [ ] "How to Run" steps verified
- [ ] No API keys or secrets committed to the repository
- [ ] Repository made public on submission day

## License

This project is licensed under the [Apache License 2.0](LICENSE).
