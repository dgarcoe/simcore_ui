#!/usr/bin/env bash
# Starts Simcore + Simcore Pixel with the best LLM setup for this machine.
#
#   ./scripts/simcore-up.sh              # detect and start (docker compose up --build)
#   ./scripts/simcore-up.sh --dry-run    # only show what was detected and the command
#   ./scripts/simcore-up.sh down         # any other compose command, same files
#
# Detection order: an Ollama already running on the host → NVIDIA Jetson →
# NVIDIA GPU (x86/arm servers) → CPU. CPU always works; GPUs are a bonus.
set -euo pipefail

usage() {
  cat <<'EOF'
Uso: scripts/simcore-up.sh [opciones] [comando de compose] [args…]

Opciones:
  --demo           Sin LLM local (modo demo o LLM en la nube): no levanta Ollama.
  --cpu            Ignora GPUs y Ollama del host; Ollama en contenedor con CPU.
  --no-host        No reutilizar un Ollama que ya esté corriendo en el host.
  --model NOMBRE   Modelo de Ollama a descargar (p. ej. qwen2.5:7b, llama3.2:3b).
  --no-alias       No publicar el modelo como qwen2.5:7b para los escenarios incluidos.
  --dry-run        Solo muestra la detección y el comando, sin ejecutar nada.
  -h, --help       Esta ayuda.

Comando "doctor": comprueba si los agentes están usando de verdad el LLM
(modo demo, Ollama accesible, modelo descargado, respuesta de prueba, GPU/CPU).

Comando por defecto: "up --build". Cualquier otro (down, logs -f, ps…) se ejecuta
con los mismos ficheros de compose. Los argumentos extra se pasan a compose (p. ej. -d).
EOF
}

# Everything probed is overridable so the detection can be tested with stubs.
DOCKER=${SIMCORE_DOCKER:-docker}
NVIDIA_SMI=${SIMCORE_NVIDIA_SMI:-nvidia-smi}
CURL=${SIMCORE_CURL:-curl}
UNAME_S=${SIMCORE_UNAME_S:-$(uname -s)}
UNAME_M=${SIMCORE_UNAME_M:-$(uname -m)}
TEGRA_RELEASE=${SIMCORE_TEGRA_RELEASE:-/etc/nv_tegra_release}
DT_MODEL=${SIMCORE_DT_MODEL:-/proc/device-tree/model}
MEMINFO=${SIMCORE_MEMINFO:-/proc/meminfo}
HOST_OLLAMA_URL=${SIMCORE_HOST_OLLAMA_URL:-http://localhost:11434}

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
DEFAULT_SCENARIO_MODEL=qwen2.5:7b

demo=0 force_cpu=0 use_host=1 dry_run=0 alias_on=1 model=""
args=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --demo) demo=1 ;;
    --cpu) force_cpu=1 ;;
    --no-host) use_host=0 ;;
    --model) model=${2:?--model necesita un nombre}; shift ;;
    --model=*) model=${1#--model=} ;;
    --no-alias) alias_on=0 ;;
    --dry-run) dry_run=1 ;;
    -h | --help) usage; exit 0 ;;
    *) args+=("$1") ;;
  esac
  shift
done
[[ ${#args[@]} -eq 0 ]] && args=(up --build)

warn() { printf '⚠  %s\n' "$*" >&2; }
die() { printf '✖  %s\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

# ── Docker ──────────────────────────────────────────────────────────────
have "$DOCKER" || die "No se encuentra Docker. Instálalo: https://docs.docker.com/engine/install/"
compose_version=$("$DOCKER" compose version --short 2>/dev/null || true)
[[ -n $compose_version ]] || die "Falta Docker Compose v2 ('docker compose'). Instala el plugin docker-compose-plugin."
IFS=. read -r cv_major cv_minor _ <<<"${compose_version#v}"
if ((cv_major < 2 || (cv_major == 2 && cv_minor < 24))); then
  die "Docker Compose $compose_version es demasiado antiguo; hace falta 2.24 o superior."
fi
docker_runtimes=$("$DOCKER" info --format '{{json .Runtimes}}' 2>/dev/null || true)
[[ -n $docker_runtimes || $dry_run -eq 1 ]] || die "No se puede hablar con el daemon de Docker (¿está arrancado? ¿tu usuario está en el grupo docker?)."

# ── Detection ───────────────────────────────────────────────────────────
platform="$UNAME_S/$UNAME_M"
accel=cpu  # cpu | nvidia | jetson | host | none
detail=""
mem_gb=0
vram_mb=0
jetpack=""

mem_total_gb() {
  [[ -r $MEMINFO ]] || { echo 0; return; }
  awk '/^MemTotal:/ { printf "%d", ($2 / 1048576) + 0.5 }' "$MEMINFO"
}

jetson_model() {
  if [[ -r $DT_MODEL ]] && tr -d '\0' <"$DT_MODEL" | grep -qi jetson; then
    tr -d '\0' <"$DT_MODEL"
  elif [[ -r $TEGRA_RELEASE ]]; then
    echo "NVIDIA Jetson"
  fi
}

host_ollama_up() {
  have "$CURL" && "$CURL" -sf --max-time 2 "$HOST_OLLAMA_URL/api/tags" >/dev/null 2>&1
}

if ((demo)); then
  accel=none
  detail="modo demo / LLM en la nube"
elif ((!force_cpu && use_host)) && host_ollama_up; then
  accel=host
  detail="Ollama ya corre en el host ($HOST_OLLAMA_URL)"
elif ((!force_cpu)) && [[ -n $(jetson_model) ]]; then
  jmodel=$(jetson_model)
  mem_gb=$(mem_total_gb)
  release=$(head -n1 "$TEGRA_RELEASE" 2>/dev/null || true)
  case "$release" in
    *R36*) jetpack=6 ;;
    *R35*) jetpack=5 ;;
  esac
  if [[ -z $jetpack ]]; then
    warn "$jmodel con L4T no soportado por Ollama en GPU (${release:-desconocido}); se usará CPU. Hace falta JetPack 5 o 6."
  elif [[ $docker_runtimes != *nvidia* ]]; then
    warn "$jmodel detectada, pero Docker no tiene el runtime 'nvidia' (instala nvidia-container-toolkit / nvidia-jetpack); se usará CPU."
  else
    accel=jetson
    detail="$jmodel · JetPack $jetpack · ${mem_gb} GB compartidos"
  fi
elif ((!force_cpu)) && have "$NVIDIA_SMI" && "$NVIDIA_SMI" -L >/dev/null 2>&1; then
  vram_mb=$("$NVIDIA_SMI" --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null | sort -n | tail -n1 | tr -dc '0-9')
  vram_mb=${vram_mb:-0}
  gpu_name=$("$NVIDIA_SMI" --query-gpu=name --format=csv,noheader 2>/dev/null | head -n1)
  if [[ $docker_runtimes == *nvidia* ]]; then
    accel=nvidia
    detail="$gpu_name · $((vram_mb / 1024)) GB VRAM"
  else
    warn "GPU NVIDIA ($gpu_name) detectada, pero Docker no puede usarla: instala nvidia-container-toolkit y ejecuta 'sudo nvidia-ctk runtime configure --runtime=docker'. Se usará CPU."
  fi
fi

if [[ $accel == cpu ]]; then
  mem_gb=$(mem_total_gb)
  mem_gb=${mem_gb:-0}
  detail="sin GPU utilizable"
  [[ $mem_gb -gt 0 ]] && detail+=" · ${mem_gb} GB RAM"
  [[ $UNAME_S == Darwin ]] && warn "En macOS Docker no puede usar la GPU de Apple. Instala Ollama nativo (https://ollama.com/download) y vuelve a lanzar este script: lo detectará."
fi

# ── Model and Ollama tuning ─────────────────────────────────────────────
parallel=2
case $accel in
  jetson) auto_model=$([[ $mem_gb -gt 12 ]] && echo qwen2.5:7b || echo qwen2.5:3b) ;;
  nvidia)
    auto_model=$([[ $vram_mb -ge 7500 ]] && echo qwen2.5:7b || echo qwen2.5:3b)
    [[ $vram_mb -ge 12000 ]] && parallel=4
    ;;
  cpu) auto_model=qwen2.5:3b ;;
  *) auto_model="" ;;
esac
# An explicit choice wins: --model, then OLLAMA_MODEL from the environment or .env.
env_model=${OLLAMA_MODEL:-}
if [[ -z $env_model && -r "$ROOT/.env" ]]; then
  env_model=$(sed -n 's/^OLLAMA_MODEL=//p' "$ROOT/.env" | tail -n1 | tr -d '"'"'"' ')
fi
if [[ -z $model && -n $env_model && -n $auto_model ]]; then model=$env_model; fi
model=${model:-$auto_model}
alias_name=""
if ((alias_on)) && [[ -n $model && $model != "$DEFAULT_SCENARIO_MODEL" ]]; then
  alias_name=$DEFAULT_SCENARIO_MODEL
fi

files=(-f "$ROOT/docker-compose.yml")
profile=()
case $accel in
  nvidia) files+=(-f "$ROOT/docker/compose.nvidia.yml") ;;
  jetson) files+=(-f "$ROOT/docker/compose.jetson.yml") ;;
  host) files+=(-f "$ROOT/docker/compose.host-ollama.yml") ;;
esac
[[ $accel == cpu || $accel == nvidia || $accel == jetson ]] && profile=(--profile ollama)

export OLLAMA_MODEL=$model OLLAMA_ALIAS=$alias_name OLLAMA_NUM_PARALLEL=$parallel
[[ -n $jetpack ]] && export JETSON_JETPACK=$jetpack

# ── Doctor ──────────────────────────────────────────────────────────────
ok() { printf '  ✓ %s\n' "$*"; }
bad() { printf '  ✗ %s\n' "$*"; problems=$((problems + 1)); }
info() { printf '    %s\n' "$*"; }

doctor() {
  local dc=("$DOCKER" compose "${files[@]}" ${profile[@]+"${profile[@]}"})
  local api="http://localhost:${UI_PORT:-8080}/api"
  problems=0
  echo
  echo "Diagnóstico del LLM"

  # 1. What the running simulation reports (llm_stats comes with every tick).
  local state
  state=$("$CURL" -sf --max-time 5 "$api/state" 2>/dev/null || true)
  if [[ -z $state ]]; then
    bad "Simcore no responde en $api (¿está arrancado? ./scripts/simcore-up.sh -d)"
  elif [[ $state == *'"error"'* ]]; then
    ok "Simcore responde, pero no hay ninguna simulación en marcha (lanza un escenario y repite)"
  elif [[ $state =~ \"mode\":\ *\"demo\" ]]; then
    bad "La simulación está en MODO DEMO: respuestas de ejemplo, no se llama al LLM."
    info "Vuelve a ejecutar el escenario con la casilla «Modo demo» desmarcada."
  else
    local calls
    calls=$(grep -o '"total_calls": *[0-9]*' <<<"$state" | grep -o '[0-9]*$' || echo 0)
    ok "La simulación usa un LLM real (${calls:-0} llamadas hasta ahora)"
  fi

  # 2. Is Ollama reachable, and which models does it have?
  if [[ $accel == none ]]; then
    info "Arrancado con --demo: no hay Ollama local que comprobar."
    return "$problems"
  fi
  local list ps
  if [[ $accel == host ]]; then
    list=$("$CURL" -sf --max-time 5 "$HOST_OLLAMA_URL/api/tags" 2>/dev/null || true)
    if [[ -n $list ]]; then ok "Ollama del host responde en $HOST_OLLAMA_URL"; else bad "Ollama del host no responde en $HOST_OLLAMA_URL"; fi
  else
    list=$("${dc[@]}" exec -T ollama ollama list 2>/dev/null || true)
    if [[ -n $list ]]; then ok "El contenedor de Ollama responde"; else bad "El contenedor de Ollama no responde (¿arrancaste con --demo? Si no: ./scripts/simcore-up.sh logs ollama)"; fi
  fi
  if [[ -n $list ]]; then
    local want
    for want in ${model:+"$model"} "$DEFAULT_SCENARIO_MODEL"; do
      if grep -q "${want}" <<<"$list"; then ok "Modelo disponible: $want"
      else bad "Falta el modelo $want (./scripts/simcore-up.sh logs ollama-pull, o 'ollama pull $want')"; fi
    done

    # 3. A real generation, timed, and where the model ended up (GPU/CPU).
    local test_model=${model:-$DEFAULT_SCENARIO_MODEL} start end reply
    start=$(date +%s)
    if [[ $accel == host ]]; then
      reply=$("$CURL" -sf --max-time 300 "$HOST_OLLAMA_URL/api/generate" \
        -d "{\"model\":\"$test_model\",\"prompt\":\"Responde solo: hola\",\"stream\":false}" 2>/dev/null || true)
    else
      reply=$("${dc[@]}" exec -T ollama ollama run "$test_model" "Responde solo: hola" 2>/dev/null || true)
    fi
    end=$(date +%s)
    if [[ -n $reply ]]; then ok "Respuesta de prueba de $test_model en $((end - start)) s"
    else bad "$test_model no respondió a una petición de prueba"; fi

    if [[ $accel != host ]]; then
      ps=$("${dc[@]}" exec -T ollama ollama ps 2>/dev/null || true)
      if grep -q "CPU/GPU" <<<"$ps"; then
        bad "El modelo no cabe entero en la GPU (parte en CPU: $(grep -o '[0-9]*%/[0-9]*% CPU/GPU' <<<"$ps" | head -n1)); usa uno más pequeño con --model"
      elif grep -q "GPU" <<<"$ps"; then ok "El modelo está en la GPU: $(grep -o '[0-9]*% *GPU' <<<"$ps" | head -n1)"
      elif [[ -n $ps ]]; then
        if [[ $accel == cpu ]]; then ok "El modelo corre en CPU (no se detectó GPU utilizable)"
        else bad "El modelo corre en CPU aunque se detectó $accel: revisa 'logs ollama' (CUDA) y docs/deploy.md"; fi
      fi
      [[ -n $ps ]] && while IFS= read -r l; do info "$l"; done <<<"$ps"
    fi
  fi

  # 4. Recent failures logged by Simcore.
  local fails
  fails=$("${dc[@]}" logs --since 15m simcore 2>/dev/null | grep "LLM call failed" || true)
  if [[ -n $fails ]]; then
    bad "Simcore registró $(wc -l <<<"$fails" | tr -d ' ') llamadas fallidas en los últimos 15 min. Última:"
    info "$(tail -n1 <<<"$fails" | sed 's/.*LLM call failed: //' | cut -c1-200)"
  else
    ok "Sin llamadas fallidas en los registros de Simcore (15 min)"
  fi

  echo
  if ((problems == 0)); then echo "Todo correcto."; else echo "$problems problema(s) encontrados."; fi
  return "$problems"
}

# ── Summary ─────────────────────────────────────────────────────────────
label() {
  case $accel in
    none) echo "sin LLM local" ;;
    host) echo "Ollama del host" ;;
    jetson) echo "Jetson (GPU)" ;;
    nvidia) echo "GPU NVIDIA" ;;
    cpu) echo "CPU" ;;
  esac
}
echo "Simcore Pixel · plataforma: $platform"
echo "  LLM:      $(label) — $detail"
if [[ -n $model ]]; then
  echo "  Modelo:   $model${alias_name:+ (también como $alias_name para los escenarios incluidos)}"
  echo "  Paralelo: $parallel peticiones a la vez"
elif [[ $accel == host ]]; then
  echo "  Modelo:   el que tengas en tu Ollama (los escenarios incluidos piden $DEFAULT_SCENARIO_MODEL)"
  if have "$CURL" && ! "$CURL" -sf --max-time 2 "$HOST_OLLAMA_URL/api/tags" 2>/dev/null | grep -q "\"$DEFAULT_SCENARIO_MODEL\""; then
    warn "Tu Ollama no tiene $DEFAULT_SCENARIO_MODEL: 'ollama pull $DEFAULT_SCENARIO_MODEL' o elige otro modelo en el editor."
  fi
fi
echo "  UI:       http://localhost:${UI_PORT:-8080}"

is_doctor=0
[[ ${args[0]} == doctor ]] && is_doctor=1
cmd=("$DOCKER" compose "${files[@]}" ${profile[@]+"${profile[@]}"} "${args[@]}")
if ((!is_doctor)); then
  printf '  Comando:  '
  [[ -n $model ]] && printf 'OLLAMA_MODEL=%s OLLAMA_ALIAS=%s OLLAMA_NUM_PARALLEL=%s ' "$model" "$alias_name" "$parallel"
  [[ -n $jetpack ]] && printf 'JETSON_JETPACK=%s ' "$jetpack"
  printf '%q ' "${cmd[@]}"
  echo
fi

((dry_run)) && exit 0
cd "$ROOT"
((is_doctor)) && { doctor; exit $?; }
exec "${cmd[@]}"
