# ===================================
# Stage 1: Build Frontend-2 with Node.js
# ===================================
FROM node:20-alpine AS frontend-builder

WORKDIR /frontend-build

# Copy package files
COPY frontend-2/package*.json ./

# Install dependencies
RUN npm ci --quiet

# Copy frontend source code
COPY frontend-2/ ./

# Build frontend (output: dist/)
RUN npm run build

# ===================================
# Stage 2: Python Runtime with Backend + Built Frontend
# ===================================
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy Python requirements
COPY requirements.txt .

# Install Python packages
RUN pip install -r requirements.txt

# Copy backend code
COPY app/ ./app/
COPY config/ ./config/

# Copy built frontend-2 from stage 1
COPY --from=frontend-builder /frontend-build/dist ./frontend-2/dist

# Expose port
EXPOSE 7860

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s \
    CMD python -c "import requests; requests.get('http://localhost:7860/health')" || exit 1

# Run the application (production mode - no --reload)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
