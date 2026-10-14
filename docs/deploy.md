# Despliegue por plataforma

`./scripts/simcore-up.sh` elige la configuración automáticamente y arranca en segundo plano (`--fg` para quedarse con los logs; `./scripts/simcore-up.sh logs -f` para verlos después y `./scripts/simcore-up.sh down` para parar); aquí está qué necesita cada plataforma y cómo comprobar que todo va bien. Todas las imágenes son multi-arquitectura (amd64 y arm64) y se construyen en la propia máquina.

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

**Si el contenedor de Ollama no detecta la GPU** (hay casos reportados en algunas versiones de JetPack 6.x), instala Ollama nativo, que soporta Jetson oficialmente. Ver [Ollama instalado en el host](#ollama-instalado-en-el-host).

La UI se puede abrir en la propia Jetson o desde otro equipo de la red: `http://<ip-de-la-jetson>:8080`.

## Ollama instalado en el host

Si ya hay un Ollama corriendo en la máquina (instalado con `curl -fsSL https://ollama.com/install.sh | sh`, la app de macOS…), el script lo reutiliza en vez de levantar uno en un contenedor:
- **Modelo:** lo elige según el hardware (en la Orin Nano, `qwen2.5:3b`). Si falta, lo descarga en ese Ollama y lo publica también como `qwen2.5:7b`. Nunca sobreescribe un `qwen2.5:7b` real.
- **Descarga manual:** `./scripts/simcore-up.sh pull [modelo]`.
- **Logs:** no hay servicios `ollama` ni `ollama-pull`. Los logs de Ollama se ven con `journalctl -u ollama -f`, y los modelos cargados con `ollama ps`.
- **Linux, acceso desde los contenedores:** el Ollama nativo solo escucha en `127.0.0.1` por defecto, y el contenedor de Simcore no puede llegar a él. El script lo comprueba y, si hace falta, indica cómo cambiarlo:
  ```bash
  sudo systemctl edit ollama
  #   [Service]
  #   Environment="OLLAMA_HOST=0.0.0.0:11434"
  sudo systemctl restart ollama
  ```
  O usa `--no-host` para levantar Ollama en un contenedor.

  Si después de editarlo el script sigue diciendo que no llega:
  - **Comprueba en qué dirección escucha Ollama:** `ss -ltn | grep 11434` debe mostrar `*:11434` o `0.0.0.0:11434`. Si muestra `127.0.0.1:11434`, el cambio no se aplicó: en `systemctl edit`, las líneas deben ir **encima** de `### Lines below this comment will be discarded`. Revísalo con `systemctl cat ollama` y reinicia con `sudo systemctl daemon-reload && sudo systemctl restart ollama`.
  - **Si ya escucha en `*:11434`:** probablemente un cortafuegos bloquea la red de Docker (`sudo ufw allow from 172.16.0.0/12 to any port 11434`).
  - **Si sabes que funciona:** `SIMCORE_SKIP_HOST_CHECK=1 ./scripts/simcore-up.sh` salta la comprobación.
  - El script explica cuál de estos casos es el tuyo.

## Escenarios con modelos de nube (gpt-4o-mini…)

Cada escenario indica su modelo en `llm.model`. Los locales empiezan por `ollama/`. En la pantalla de inicio, los que piden un modelo de nube aparecen marcados con ☁.
- **Con la clave en `.env`** (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`…): se usa el modelo de nube.
- **Sin clave y arrancado con el script:** Simcore usa en su lugar el modelo local (`SIMCORE_FALLBACK_MODEL`) y lo anota en su log. Se desactiva con `--no-fallback`.
- **Cambiarlo de forma permanente:** desde el editor (✎), poniendo `ollama/qwen2.5:7b`. Siempre con el prefijo `ollama/`: sin él, LiteLLM lo trata como un modelo de OpenAI.

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

- **Progreso del tick:** bajo el reloj aparece «Tick N · k/M agentes han decidido · esperando al LLM · 42 s». Mientras ese contador avance, el LLM está trabajando aunque todavía no haya conversaciones.
- **Por qué hace cada agente lo que hace:** en Sucesos, debajo de cada acción, y en la ficha del agente («Por qué»).
- **En la UI:** la barra superior muestra el estado del LLM:
  - `DEMO · sin LLM`: modo demo.
  - `LLM · qwen2.5:7b · N`: LLM real, con el número de llamadas hechas.
  - `LLM con errores`: el LLM falla. Además aparece un aviso con el error real y una pista para resolverlo.
  - `LLM · 2/6 no válidas` (amarillo): parte de las respuestas no tienen el formato JSON que espera Simcore, y esos agentes solo esperan. Es típico de modelos pequeños: prueba otro modelo.
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
