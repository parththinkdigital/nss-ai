# 🇮🇳 National Service Scheme (NSS) AI Chatbot

An AI chatbot for the **National Service Scheme (NSS)**, Ministry of Youth Affairs & Sports, Government of India.

Built with **Next.js** (JavaScript), grounded in public data scraped directly from **[nss.gov.in](https://nss.gov.in/)**, and powered by **NVIDIA NIM** (`openai/gpt-oss-20b`) for ultra-fast retrieval-augmented generation (RAG).

Designed for seamless deployment on **Railway's Free Tier** (or any container runtime).

---

## 🌟 Key Features

- **Official Public Page Scraper**: Scrapes 12+ core public pages from `https://nss.gov.in/`, including Organization, Objectives, 120-hour Regular Activities, 7-day Special Camping Programme, Awards, Volunteer statistics, and Directory.
- **Lightweight Hybrid Vector Index**: In-memory dense vector embeddings (384-dimensional normalized subword space) combined with BM25 lexical keyword matching. Zero heavyweight C++ binary dependencies, instant cold starts.
- **NVIDIA NIM API Integration**: Powered by `openai/gpt-oss-20b` via NVIDIA NIM's endpoint (`/v1/chat/completions`) for swift responses (~2-3s).
- **Live Web Search Fallback**: When official local documentation does not have the answer or requires updated public details, the chatbot automatically searches verified web sources and synthesizes a grounded answer with clickable citations.
- **Natural Conversational Processing**: Reads the user's entire message, warmly acknowledging greetings and addressing complex multi-part questions directly.
- **Clickable Source Citations**: Every answer includes clickable markdown links and citation pills referencing original pages on `nss.gov.in` and official public sources.
- **Zero-Database Browser Storage**: Chat history persists automatically in the user's browser `localStorage` (`nss_chatbot_messages_v1`). No account, login, or database required.
- **Direct Mode Fallback**: If `NVIDIA_API_KEY` is not yet configured, the app seamlessly serves grounded retrieval answers with notice rather than crashing.

---

## 📁 Project Architecture

```
nss/
├── app/
│   ├── api/
│   │   ├── chat/route.js        # Server-side API route with vector retrieval, web fallback & NIM call
│   │   └── status/route.js      # System health & index status endpoint
│   ├── globals.css              # Tailwind CSS styles & animations
│   ├── layout.js                # Root layout with civic branding
│   └── page.js                  # Chat interface with localStorage & dynamic status indicator
├── components/
│   └── MarkdownRenderer.jsx     # Safe markdown parser for formatted answers & links
├── data/
│   └── nss_index.json           # Pre-indexed NSS chunks with embeddings (54 chunks)
├── lib/
│   ├── nvidia-nim.js            # NVIDIA NIM API client (openai/gpt-oss-20b)
│   ├── vector-store.js          # In-memory vector store (dense cosine + BM25)
│   └── web-search.js            # Live search fallback engine
├── scripts/
│   └── scrape-and-index.js      # Scraper and vector index generator
├── Dockerfile                   # Multi-stage production container build
├── railway.json                 # Railway deployment configuration
├── package.json                 # Project dependencies and scripts
└── jsconfig.json                # Path alias configuration (@/*)
```

---

## 🚀 Quick Start (Local Development)

### 1. Prerequisites
- **Node.js** v18+ (tested on v20 and v24)
- **npm** or **pnpm**

### 2. Installation
```bash
git clone <your-repo-url>
cd nss
npm install
```

### 3. Environment Variables
Copy the example environment file:
```bash
cp .env.example .env.local
```
Edit `.env.local` with your NVIDIA NIM API key:
```env
NVIDIA_API_KEY=nvapi-your-key-here
NVIDIA_MODEL=meta/muse-glimmer-30b
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
```
*(Get your free developer API key from [NVIDIA NIM Catalog](https://build.nvidia.com/)).*

### 4. (Optional) Run the Scraper
The repository already includes a pre-scraped and indexed `data/nss_index.json`. To re-scrape fresh content from `https://nss.gov.in/`:
```bash
npm run scrape
```

### 5. Start the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🚂 Deploying to Railway (Free Tier)

### Method A: Deploy via GitHub (Recommended)

1. **Push your code to GitHub**:
   ```bash
   git init
   git add .
   git commit -m "Initial NSS Chatbot release"
   git remote add origin https://github.com/<your-username>/nss-chatbot.git
   git branch -M main
   git push -u origin main
   ```

2. **Create Project on Railway**:
   - Go to [railway.app](https://railway.app/) and sign in.
   - Click **"New Project"** -> **"Deploy from GitHub repo"**.
   - Select your `nss-chatbot` repository.

3. **Configure Environment Variables**:
   - In Railway, click on your deployed service and navigate to the **"Variables"** tab.
   - Add the following variable:
     - `NVIDIA_API_KEY`: Your key from `build.nvidia.com` (starts with `nvapi-...`)
     - *(Optional)* `NVIDIA_MODEL`: `meta/muse-glimmer-30b`
     - *(Optional)* `NVIDIA_BASE_URL`: `https://integrate.api.nvidia.com/v1`

4. **Generate Public Domain**:
   - Navigate to the **"Settings"** tab -> **"Networking"**.
   - Click **"Generate Domain"** (e.g., `nss-chatbot-production.up.railway.app`).
   - Your NSS Chatbot is live!

---

### Method B: Deploy using Railway CLI

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login and link project
railway login
railway init

# Set the environment variable
railway variables set NVIDIA_API_KEY="nvapi-your-key-here"

# Deploy
railway up
```

Railway automatically detects `railway.json` and builds the application with `npm run build` and runs `npm start`.

---

## 🔒 Grounding & Fallback Verification

| Question Type | Example Question | Expected Chatbot Behavior |
|---|---|---|
| **NSS Core Fact** | *"What is the motto and symbol of NSS?"* | Returns "NOT ME BUT YOU", Konark Sun Temple Rath Wheel with 8 bars, with source citations to `https://nss.gov.in/en/mission-objectives`. |
| **Activities** | *"What is the 120-hour rule?"* | Cites 120 hours/year requirement, 240 hours over 2 years, with link to `https://nss.gov.in/en/regular-activities`. |
| **Camping** | *"How long is the special camp?"* | Explains 7-day duration, adopted village focus, with link to `https://nss.gov.in/en/special-camping-programme`. |
| **Out-of-Scope** | *"How to bake a chocolate cake?"* | Rejects immediately with: *"I'm sorry, but the official NSS content does not provide information about this topic..."* |
| **Out-of-Scope** | *"Who won the FIFA world cup?"* | Rejects immediately with out-of-scope notice. |

---

## 🛡️ Privacy & Storage
- No personal data or credentials are collected or saved on the server.
- Chat history is stored strictly in the client's local browser via `window.localStorage`.
- The user can clear their history at any time using the "Clear" button in the header.

---

## 📜 License
MIT License. Content retrieved belongs to the **National Service Scheme (NSS)**, Ministry of Youth Affairs & Sports, Government of India (`https://nss.gov.in/`).
