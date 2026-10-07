# LuminaCull AI: Studio Photo Culling & HITL Management Engine

[![FastAPI](https://img.shields.io/badge/FastAPI-0.115.0+-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![LangGraph](https://img.shields.io/badge/LangGraph-StateGraph_HITL-FF6F00.svg?logo=langchain)](https://langchain-ai.github.io/langgraph/)
[![React](https://img.shields.io/badge/React-18-61DAFB.svg?logo=react&logoColor=black)](https://react.dev)
[![MongoDB](https://img.shields.io/badge/PyMongo-Motor_Async-47A248.svg?logo=mongodb&logoColor=white)](https://www.mongodb.com)
[![Gemini & Pixtral](https://img.shields.io/badge/VLM-Gemini_2.5_Flash_%7C_Mistral_Pixtral-8E75B2.svg)](https://deepmind.google/technologies/gemini/)

A multi-tier AI photo studio culling system designed for high-volume event photographers (weddings, galas, sports, portraits). Rapidly processes 500+ raw photo batches to detect camera shake, blur, closed eyes/mid-blinks, turned-away subjects, and burst duplicates while maintaining a safe **Human-in-the-Loop (HITL)** 50-photo batch approval gate and a reversible `.recycle_bin/` recovery staging system.

---

## Key Architectural Highlights

```text
photo_culling_studio/
│
├── .env                              # Environment variables template
├── .gitignore                         # Python, storage, cache exclusions
├── requirements.txt                  # Dependencies
├── server.py                         # Root Uvicorn entrypoint
│
├── app/
│   ├── __init__.py
│   ├── main.py                       # FastAPI initialization, CORS, PyMongo lifespan, routers
│   ├── config.py                     # Settings class using pydantic-settings
│   ├── system_prompt.py              # Centralized prompt templates & JSON schemas for Gemini/Pixtral
│   │
│   ├── core/
│   │   ├── security.py               # Clerk JWT authentication dependency
│   │   └── database.py               # PyMongo / Motor async client initialization and indexes
│   │
│   ├── routes/
│   │   ├── upload_routes.py          # Batch 500-photo upload & event registration
│   │   ├── culling_routes.py         # Start pipeline, status check, streaming progress
│   │   ├── hitl_routes.py            # Get paused 50-item batches, submit resume decisions
│   │   └── recycle_bin_routes.py     # Soft delete, restore items, purge
│   │
│   ├── services/
│   │   ├── cv_filter.py              # OpenCV Laplacian blur + pHash burst grouping
│   │   ├── vlm_analyzer.py           # Gemini & Mistral VLM structured classification
│   │   ├── vector_rag.py             # Image vector clustering (DBSCAN)
│   │   └── file_storage.py           # File operations, moves to .recycle_bin, restore logic
│   │
│   ├── workflows/
│   │   ├── state.py                  # LangGraph TypedDict state definitions
│   │   └── culling_graph.py          # LangGraph graph with batching nodes & interrupt()
│   │
│   └── mcp/
│       └── file_tools.py             # Model Context Protocol tools for safe file management
│
├── frontend/                         # Modern React Vite UI
│   ├── src/
│   │   ├── components/               # PipelineTracker, HitlBatchModal, RecycleBinExplorer...
│   │   ├── App.jsx                   # Master interactive dashboard
│   │   └── index.css                 # Dark studio glassmorphism theme
│
└── storage/
    ├── uploads/                      # Raw incoming photos
    ├── approved/                     # Keepers
    └── .recycle_bin/                 # Staged discards with JSON manifest
```

---

## 3-Tier Multi-Engine Culling Pipeline

1. **Tier 1 (Zero-Cost Local CV):**
   - **OpenCV Laplacian Variance:** Evaluates motion blur and camera shake variance against threshold (`LAPLACIAN_BLUR_THRESHOLD = 120.0`).
   - **DCT Perceptual Hashing (`imagehash.phash`):** Computes 64-bit perceptual hash and Hamming distance to eliminate burst redundancies.
   - **Exposure clipping analysis:** Identifies ruined blowouts and severe underexposure.

2. **Tier 2 (Vector Grouping):**
   - Extracts multi-scale perceptual features combining DCT hash, wavelet hash, and spatial color histograms.
   - Executes **DBSCAN cosine clustering** to group near-identical poses and auto-ranks the single sharpest keeper within each sequence.

3. **Tier 3 (VLM Vision Evaluation):**
   - Dispatches structured prompts to **Google Gemini 2.5 Flash** and **Mistral Pixtral**.
   - Enforces strict JSON schema evaluation for:
     - Eyes open / closed state & confidence percentage
     - Subject orientation (`facing_camera`, `turned_away`, `candid_acceptable`)
     - Sharpness and composition scores (1-10)
     - Overall studio aesthetic keeper score (1-10)

4. **Human-in-the-Loop (HITL) Batching:**
   - Discard candidates are automatically grouped in batches of 50.
   - LangGraph triggers an `interrupt()` after each 50-photo slice, pausing execution.
   - Studio owners review the batch, rescue false-positive keepers, and resume the graph seamlessly with `Command(resume=payload)`.

5. **Safe Recycle Bin & Safe Recovery:**
   - Discards are staged into `.recycle_bin/{event_id}/` with an audit JSON manifest.
   - MCP (Model Context Protocol) tool integration enables safe single-click restore or complete purge.

---

## Getting Started

### 1. Environment Configuration

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Configure your API keys:
```ini
APP_NAME="AI Photo Studio Culling & HITL Management Engine"
DEBUG=true
HOST=0.0.0.0
PORT=8000
WORKERS=1

MONGO_URI="mongodb://localhost:27017"
MONGO_DB_NAME="photo_culling_studio"

# Vision Language Models
GEMINI_API_KEY="your_gemini_api_key_here"
MISTRAL_API_KEY="your_mistral_api_key_here"

# Clerk Auth
CLERK_SECRET_KEY=""
CLERK_PEM_PUBLIC_KEY=""

BASE_STORAGE_PATH="./storage"
```

### 2. Install Backend Dependencies & Run Server

```bash
pip install -r requirements.txt
python server.py
```
Backend will start on `http://localhost:8000` (API Docs available at `http://localhost:8000/docs`).

### 3. Run React Dashboard

```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:3000` in your browser.

---

## Testing with 1-Click Synthetic Demo Dataset

In the React UI:
1. Click **"New Event"** to create a photo shoot session.
2. Click **"Upload Batch"** and select **"Generate 55 Photos Demo Shoot"**.
3. Click **"Start Multi-Tier Culling"**.
4. Experience the full 3-Tier CV + Vector + VLM analysis and the 50-Photo HITL batch review checkpoint!
