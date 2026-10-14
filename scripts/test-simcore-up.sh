#!/usr/bin/env bash
# Tests scripts/simcore-up.sh detection with stubbed docker / nvidia-smi / curl
# and fake /proc files. Run: scripts/test-simcore-up.sh
set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
UP="$HERE/simcore-up.sh"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/bin"
cat >"$TMP/bin/docker" <<'STUB'
#!/usr/bin/env bash
case "$*" in
  "compose version --short") echo "${FAKE_COMPOSE:-2.29.1}" ;;
  info*) echo "${FAKE_RUNTIMES:-{\"runc\":{}}}" ;;
  *"exec -T ollama ollama list"*) printf '%b' "${FAKE_OLLAMA_LIST:-}" ;;
  *"exec -T ollama ollama ps"*) printf '%b' "${FAKE_OLLAMA_PS:-}" ;;
  *"exec -T ollama ollama run"*) [[ -n ${FAKE_OLLAMA_LIST:-} ]] && echo hola ;;
  *"logs --since"*) printf '%b' "${FAKE_SIMCORE_LOGS:-}" ;;
  *) echo "docker $*" ;;
esac
STUB
cat >"$TMP/bin/nvidia-smi" <<'STUB'
#!/usr/bin/env bash
[[ -n ${FAKE_VRAM:-} ]] || exit 9
case "$*" in
  -L) echo "GPU 0: Fake GPU" ;;
  *memory.total*) echo "$FAKE_VRAM" ;;
  *name*) echo "NVIDIA Fake GPU" ;;
esac
STUB
cat >"$TMP/bin/curl" <<'STUB'
#!/usr/bin/env bash
for a in "$@"; do url=$a; done
for a in "$@"; do [[ $a == http* ]] && url=$a; done
case "$url" in
  */api/state) [[ -n ${FAKE_STATE:-} ]] && echo "$FAKE_STATE" || exit 7 ;;
  *) [[ ${FAKE_HOST_OLLAMA:-0} == 1 ]] || exit 7
     echo "{\"models\":[${FAKE_HOST_MODELS:-}]}" ;;
esac
STUB
chmod +x "$TMP/bin/"*

meminfo() { echo "MemTotal: $(($1 * 1048576)) kB" >"$TMP/meminfo"; }

pass=0 fail=0
# run NAME EXPECTED_PATTERNS... -- ARGS...   (env vars set by the caller)
check() {
  local name=$1; shift
  local expect=()
  while [[ $1 != -- ]]; do expect+=("$1"); shift; done
  shift
  local out dry=(--dry-run)
  [[ " $* " == *" doctor "* ]] && dry=()  # doctor runs its checks against the stubs
  out=$(SIMCORE_DOCKER="$TMP/bin/docker" SIMCORE_CURL="$TMP/bin/curl" \
    SIMCORE_NVIDIA_SMI="${NVSMI:-$TMP/bin/nvidia-smi}" \
    SIMCORE_UNAME_S="${OS:-Linux}" SIMCORE_UNAME_M="${ARCH:-x86_64}" \
    SIMCORE_TEGRA_RELEASE="${TEGRA:-$TMP/none}" SIMCORE_DT_MODEL="${DTMODEL:-$TMP/none}" \
    SIMCORE_MEMINFO="$TMP/meminfo" bash "$UP" ${dry[@]+"${dry[@]}"} "$@" 2>&1) || true
  local ok=1 p
  for p in "${expect[@]}"; do
    if [[ $p == !* ]]; then
      grep -qF -- "${p#!}" <<<"$out" && { ok=0; echo "  ✗ $name: did not expect «${p#!}»"; }
    else
      grep -qF -- "$p" <<<"$out" || { ok=0; echo "  ✗ $name: missing «$p»"; }
    fi
  done
  if ((ok)); then pass=$((pass + 1)); echo "  ✓ $name"; else fail=$((fail + 1)); while IFS= read -r l; do echo "      $l"; done <<<"$out"; fi
}

meminfo 16
NVSMI=$TMP/none check "x86 sin GPU → CPU + 3b + alias" \
  "LLM:      CPU" "OLLAMA_MODEL=qwen2.5:3b OLLAMA_ALIAS=qwen2.5:7b" "--profile ollama" "!compose.nvidia" "16 GB RAM" --

FAKE_VRAM=24576 FAKE_RUNTIMES='{"nvidia":{},"runc":{}}' check "GPU 24 GB → nvidia + 7b + 4 en paralelo" \
  "LLM:      GPU NVIDIA" "compose.nvidia.yml" "OLLAMA_MODEL=qwen2.5:7b OLLAMA_ALIAS= OLLAMA_NUM_PARALLEL=4" --

FAKE_VRAM=6144 FAKE_RUNTIMES='{"nvidia":{}}' check "GPU 6 GB → nvidia + 3b + alias" \
  "compose.nvidia.yml" "OLLAMA_MODEL=qwen2.5:3b OLLAMA_ALIAS=qwen2.5:7b OLLAMA_NUM_PARALLEL=2" --

FAKE_VRAM=24576 check "GPU sin nvidia-container-toolkit → CPU con aviso" \
  "nvidia-container-toolkit" "LLM:      CPU" "!compose.nvidia" --

FAKE_VRAM=24576 FAKE_RUNTIMES='{"nvidia":{}}' check "--cpu ignora la GPU" "LLM:      CPU" "!compose.nvidia" -- --cpu

FAKE_VRAM=24576 FAKE_RUNTIMES='{"nvidia":{}}' check "--model elige el modelo" \
  "OLLAMA_MODEL=llama3.2:3b OLLAMA_ALIAS=qwen2.5:7b" -- --model llama3.2:3b

OLLAMA_MODEL=mistral:7b check "OLLAMA_MODEL del entorno/.env tiene prioridad sobre la detección" \
  "OLLAMA_MODEL=mistral:7b OLLAMA_ALIAS=qwen2.5:7b" --

meminfo 8
echo "# R36 (release), REVISION: 4.3" >"$TMP/tegra36"
printf 'NVIDIA Jetson Orin Nano Engineering Reference Developer Kit Super\0' >"$TMP/dtmodel"
ARCH=aarch64 TEGRA=$TMP/tegra36 DTMODEL=$TMP/dtmodel FAKE_RUNTIMES='{"nvidia":{},"runc":{}}' check "Jetson Orin Nano Super (JetPack 6, 8 GB)" \
  "Jetson Orin Nano" "JetPack 6" "compose.jetson.yml" "JETSON_JETPACK=6" "OLLAMA_MODEL=qwen2.5:3b OLLAMA_ALIAS=qwen2.5:7b" "--profile ollama" --

echo "# R32 (release), REVISION: 7.4" >"$TMP/tegra32"
printf 'NVIDIA Jetson Nano Developer Kit\0' >"$TMP/dtmodel32"
ARCH=aarch64 TEGRA=$TMP/tegra32 DTMODEL=$TMP/dtmodel32 FAKE_RUNTIMES='{"nvidia":{}}' check "Jetson Nano antigua (JetPack 4) → CPU con aviso" \
  "JetPack 5 o 6" "LLM:      CPU" "!compose.jetson" --

ARCH=aarch64 TEGRA=$TMP/tegra36 DTMODEL=$TMP/dtmodel check "Jetson sin runtime nvidia → CPU con aviso" \
  "runtime 'nvidia'" "LLM:      CPU" --

FAKE_HOST_OLLAMA=1 FAKE_HOST_MODELS='{"name":"qwen2.5:7b"}' FAKE_VRAM=24576 FAKE_RUNTIMES='{"nvidia":{}}' check "Ollama del host tiene prioridad" \
  "Ollama del host" "compose.host-ollama.yml" "!--profile ollama" "!OLLAMA_MODEL=" "!Tu Ollama no tiene" --

FAKE_HOST_OLLAMA=1 FAKE_HOST_MODELS='{"name":"llama3.2:3b"}' check "Ollama del host sin el modelo de los escenarios → aviso" \
  "ollama pull qwen2.5:7b" --

FAKE_HOST_OLLAMA=1 check "--no-host ignora el Ollama del host" "LLM:      CPU" "!host-ollama" -- --no-host

OS=Darwin ARCH=arm64 NVSMI=$TMP/none check "macOS sin Ollama nativo → CPU + consejo" \
  "GPU de Apple" "LLM:      CPU" --

FAKE_VRAM=24576 FAKE_RUNTIMES='{"nvidia":{}}' check "--demo no levanta Ollama" \
  "sin LLM local" "!--profile ollama" "!OLLAMA_MODEL" -- --demo

check "otros comandos de compose se pasan tal cual" "logs -f" "!--build" -- logs -f

FAKE_COMPOSE=2.20.0 check "compose antiguo → error claro" "2.24" --

# ── doctor ──
meminfo 16
LIST='NAME\nqwen2.5:3b\nqwen2.5:7b\n'
NVSMI=$TMP/none FAKE_STATE='{"llm_stats": {"total_calls": 0, "mode": "demo"}}' FAKE_OLLAMA_LIST=$LIST check "doctor detecta el modo demo" \
  "MODO DEMO" "Modelo disponible: qwen2.5:3b" "!Comando:" -- doctor

NVSMI=$TMP/none FAKE_STATE='{"llm_stats": {"total_calls": 42, "cache_hits": 3}}' FAKE_OLLAMA_LIST=$LIST \
  FAKE_OLLAMA_PS='NAME  ID  SIZE  PROCESSOR  UNTIL\nqwen2.5:3b  x  3 GB  100% CPU  4 minutes\n' check "doctor con LLM real en CPU" \
  "usa un LLM real (42 llamadas" "Respuesta de prueba de qwen2.5:3b" "corre en CPU (no se detectó" "Todo correcto." -- doctor

FAKE_VRAM=24576 FAKE_RUNTIMES='{"nvidia":{}}' FAKE_STATE='{"llm_stats": {"total_calls": 9}}' FAKE_OLLAMA_LIST=$LIST \
  FAKE_OLLAMA_PS='NAME  PROCESSOR\nqwen2.5:7b  100% CPU\n' check "doctor avisa si hay GPU pero el modelo está en CPU" \
  "corre en CPU aunque se detectó nvidia" -- doctor

meminfo 8
ARCH=aarch64 TEGRA=$TMP/tegra36 DTMODEL=$TMP/dtmodel FAKE_RUNTIMES='{"nvidia":{}}' FAKE_STATE='{"llm_stats": {"total_calls": 9}}' \
  FAKE_OLLAMA_LIST=$LIST FAKE_OLLAMA_PS='NAME  PROCESSOR\nqwen2.5:3b  100% GPU\n' check "doctor en Jetson con el modelo en GPU" \
  "El modelo está en la GPU: 100% GPU" -- doctor

ARCH=aarch64 TEGRA=$TMP/tegra36 DTMODEL=$TMP/dtmodel FAKE_RUNTIMES='{"nvidia":{}}' FAKE_STATE='{"llm_stats": {"total_calls": 9}}' \
  FAKE_OLLAMA_LIST=$LIST FAKE_OLLAMA_PS='NAME  PROCESSOR\nqwen2.5:7b  41%/59% CPU/GPU\n' check "doctor avisa si el modelo no cabe en la GPU" \
  "no cabe entero en la GPU (parte en CPU: 41%/59% CPU/GPU)" -- doctor

meminfo 16
NVSMI=$TMP/none FAKE_STATE='{"llm_stats": {"total_calls": 12}}' FAKE_OLLAMA_LIST='NAME\nqwen2.5:3b\n' \
  FAKE_SIMCORE_LOGS='simcore  | WARNING LLM call failed: litellm.APIConnectionError: OllamaException - model "qwen2.5:7b" not found. Returning WAIT action.\n' \
  check "doctor señala el modelo que falta y los fallos" \
  "Falta el modelo qwen2.5:7b" "llamadas fallidas" "not found" -- doctor

NVSMI=$TMP/none check "doctor sin Simcore arrancado" "Simcore no responde" "El contenedor de Ollama no responde" -- doctor

echo
echo "$pass correctos, $fail fallidos"
((fail == 0))
