FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ffmpeg \
        libgl1 \
        libglib2.0-0 \
        libsm6 \
        libxext6 \
        libxrender1 \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml README.md /app/
COPY src /app/src

ARG INSTALL_POSE=1
RUN python -m pip install --upgrade pip \
    && if [ "${INSTALL_POSE}" = "1" ]; then pip install ".[pose]"; else pip install "."; fi

EXPOSE 8090 8091

ENTRYPOINT ["ai-box-stand-hold-server"]
CMD ["--host", "0.0.0.0", "--port", "8091", "--camera-mode", "auto", "--video-source", "0", "--session-seconds", "5", "--scoring-device", "auto", "--send-landmarks"]
