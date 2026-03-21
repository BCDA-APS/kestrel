# Installation

## Prerequisites

- Node.js 18+ and npm
- Git

If you don't already have Node.js, the easiest way to get it is via conda:

```bash
conda create -n kestrel nodejs
conda activate kestrel
```

Otherwise, install Node.js directly from [nodejs.org](https://nodejs.org/) or via your system package manager.

## Steps

### 1. Clone and install dependencies

```bash
git clone https://github.com/BCDA-APS/kestrel.git
cd kestrel
npm install
```

### 2. Start the development server

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
