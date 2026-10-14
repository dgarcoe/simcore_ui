# Despliegue por plataforma

`./scripts/simcore-up.sh` elige la configuración automáticamente; aquí está qué necesita cada plataforma y cómo comprobar que todo va bien. Todas las imágenes son multi-arquitectura (amd64 y arm64) y se construyen en la propia máquina.

Requisitos comunes: Docker y **Docker Compose 2.24 o superior** (`docker compose version`).

## CPU (cualquier PC, servidor o placa arm64)

Es la opción por defecto y funciona siempre: el LLM corre en el contenedor `ollama` con CPU. El script elige `qwen2.5:3b`; `qwen2.5:7b` también funciona (`--model qwen2.5:7b`), pero cada agente tarda bastante más en decidir en cada tick.

## PC/servidor con GPU NVIDIA

1. Driver NVIDIA instalado (`nvidia-smi` funciona).
2. [nvidia-container-toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) y `sudo nvidia-ctk runtime configure --runtime=docker && sudo systemctl restart docker`.
3. `./scripts/simcore-up.sh` → "LLM: GPU NVIDIA". Con ≥8 GB de VRAM usa `qwen2.5:7b`, y con ≥12 GB atiende 4 peticiones a la vez.

Comprobación: `nvidia-smi` muestra el proceso `ollama` mientras corre una simulación sin modo demo.

## NVIDIA Jetson (Orin Nano / Orin Nano Super, Orin NX, AGX Orin)

Requiere **JetPack 6** (L4T r36) o **JetPack 5** (r35). Las Jetson Nano originales (JetPack 4) funcionan solo con CPU.

1. Comprueba la versión: `head -1 /etc/nv_tegra_release` (debe decir `R36` o `R35`).
2. Docker con el runtime de NVIDIA: `docker info | grep -i runtimes` debe listar `nvidia`. Viene con `sudo apt install nvidia-jetpack`, o con nvidia-container-toolkit y `sudo nvidia-ctk runtime configure --runtime=docker`.
3. Rendimiento máximo y swap (recomendado con 8 GB compartidos):
   ```bash
   sudo nvpmodel -q          # muestra el modo actual; elige el de máxima potencia (MAXN / MAXN SUPER)
   sudo nvpmodel -m <id>     # el id del modo depende del modelo y de la versión de JetPack
   sudo jetson_clocks
   ```
   Un fichero de swap en NVMe evita cierres por memoria si abres el navegador en la propia Jetson.
4. `./scripts/simcore-up.sh` → "LLM: Jetson (GPU) · JetPack 6". En la Orin Nano (8 GB) usa `qwen2.5:3b`. `qwen2.5:7b` cabe si no usas el escritorio, pero va justo de memoria.

Comprobación: `docker compose logs ollama` debe mencionar CUDA y la GPU, y `tegrastats` muestra `GR3D_FREQ` alto mientras los agentes deciden.

**Si el contenedor de Ollama no detecta la GPU** (hay casos reportados en algunas versiones de JetPack 6.x), instala Ollama nativo, que soporta Jetson oficialmente:
```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen2.5:3b && ollama cp qwen2.5:3b qwen2.5:7b
./scripts/simcore-up.sh        # detecta el Ollama del host y lo usa
```

La UI se puede abrir en la propia Jetson o desde otro equipo de la red: `http://<ip-de-la-jetson>:8080`.

## macOS (Apple Silicon o Intel)

Docker en Mac no tiene acceso a la GPU de Apple. Para aprovecharla, instala [Ollama nativo](https://ollama.com/download), descarga el modelo (`ollama pull qwen2.5:7b`) y lanza el script: detectará el Ollama del host. Sin él, el script arranca Ollama en el contenedor con CPU.

## Windows

Usa WSL2 con Docker Desktop (integración WSL activada) y ejecuta el script dentro de WSL. Las GPU NVIDIA funcionan en WSL2 con el driver de Windows actual; el script las detecta igual que en Linux.

## Otro equipo como servidor de LLM

Para usar un Ollama de otra máquina de la red:
```bash
OLLAMA_API_BASE=http://192.168.1.50:11434 docker compose -f docker-compose.yml -f docker/compose.host-ollama.yml up --build
```

## ¿Están usando el LLM los agentes?

Si todos los agentes repiten frases como «Hey X, how's business today?» o «The weather's been interesting lately», la simulación está en **modo demo**: son respuestas de ejemplo de Simcore y no se llama a ningún LLM.

- **En la UI:** la barra superior muestra el estado del LLM:
  - `DEMO · sin LLM`: modo demo.
  - `LLM · qwen2.5:7b · N`: LLM real, con el número de llamadas hechas.
  - `LLM con errores`: el LLM falla. Además aparece un aviso con el error real y una pista para resolverlo.
- **Casilla «Modo demo»:** al ejecutar un escenario viene desmarcada por defecto, y la UI recuerda tu elección.
- **Diagnóstico completo:**
  ```bash
  ./scripts/simcore-up.sh doctor
  ```
  Comprueba:
  - el modo de la simulación en curso;
  - que Ollama responde y tiene el modelo (y el alias `qwen2.5:7b`);
  - una respuesta de prueba, con su tiempo;
  - si el modelo está en GPU, en CPU o repartido entre ambas (`ollama ps`);
  - las llamadas fallidas recientes en los registros de Simcore.
- **Lo mismo a mano:**
  ```bash
  curl -s localhost:8080/api/state | python3 -c "import json,sys; print(json.load(sys.stdin)['llm_stats'])"   # "mode": "demo" = demo
  ./scripts/simcore-up.sh logs -f ollama            # con LLM real: un POST /api/chat por agente y tick
  ./scripts/simcore-up.sh exec ollama ollama ps     # PROCESSOR: 100% GPU / CPU / x%/y% CPU/GPU
  ./scripts/simcore-up.sh logs simcore | grep "LLM call failed"
  ```

## Rendimiento orientativo

Simcore pide una decisión por agente y tick, todas a la vez, y una reflexión cada 12 ticks. El tiempo de cada tick depende del modelo y del acelerador: desde unos segundos con GPU y modelos de 3B hasta minutos en CPU con 7B. Para que el LLM marque el ritmo, pon `s/tick` a 0 al lanzar; la UI escalona las animaciones de cada tick.
