# Installation

## Prerequisites

- [conda](https://docs.conda.io/) (Anaconda or Miniconda)
- Git

## Steps

### 1. Create a conda environment with Node.js

```bash
conda create -n kestrel nodejs
conda activate kestrel
```

### 2. Clone and install dependencies

```bash
git clone https://github.com/BCDA-APS/kestrel.git
cd kestrel
npm install
```

### 3. Start the development server

```bash
npm run dev
```

Open the URL shown in the terminal (typically `http://localhost:5173`).

## Production Build

```bash
npm run build
npm run preview   # serve the built output locally
```

The built files will be in `dist/` and can be served by any static web server.

