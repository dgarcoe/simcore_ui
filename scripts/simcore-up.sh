#!/usr/bin/env bash
# Starts Simcore + Simcore Pixel with the best LLM setup for this machine.
#
#   ./scripts/simcore-up.sh              # detect and start in the background (up --build -d)
#   ./scripts/simcore-up.sh --fg         # same, but stay attached to the logs
#   ./scripts/simcore-up.sh --dry-run    # only show what was detected and the command
#   ./scripts/simcore-up.sh doctor       # check that agents really use the LLM
#   ./scripts/simcore-up.sh pull [model] # download a model into the Ollama in use
#   ./scripts/simcore-up.sh down         # any other compose command, same files
#
# Where Ollama runs: one already running on the host → NVIDIA Jetson →
# NVIDIA GPU (x86/arm servers) → CPU. CPU always works; GPUs are a bonus.
# The model is sized to the hardware in every case.
set -euo pipefail

usage() {
  cat <<'EOF'
Uso: scripts/simcore-up.sh [opciones] [comando] [args…]

Opciones:
  --demo           Sin LLM local (modo demo o LLM en la nube): no levanta Ollama.
  --cpu            Ignora GPUs y Ollama del host; Ollama en contenedor con CPU.
  --no-host        No reutilizar un Ollama que ya esté corriendo en el host.
  --model NOMBRE   Modelo de Ollama (p. ej. qwen2.5:7b, llama3.2:3b).
  --no-alias       No publicar el modelo como qwen2.5:7b para los escenarios incluidos.
  --no-fallback    No sustituir modelos de nube sin clave (gpt-4o-mini…) por el local.
  --fg             Arranca en primer plano mostrando los logs (Ctrl+C para todo).
  --dry-run        Solo muestra la detección y el comando, sin ejecutar nada.
  -h, --help       Esta ayuda.

Comandos propios:
  doctor           Comprueba si los agentes usan de verdad el LLM (modo demo, Ollama
                   accesible, modelo descargado, respuesta de prueba, GPU/CPU).
  pull [MODELO]    Descarga el modelo (por defecto, el elegido) en el Ollama que se usa
                   (contenedor o host) y crea el alias qwen2.5:7b.

Comando por defecto: "up --build -d" (en segundo plano). Cualquier otro (down,
logs -f, ps, restart…) se ejecuta con los mismos ficheros de compose, y los
argumentos extra se pasan a compose tal cual.
EOF
}

# Everything probed is overridable so the detection can be tested with stubs.
DOCKER=${SIMCORE_DOCKER:-docker}
NVIDIA_SMI=${SIMCORE_NVIDIA_SMI:-nvidia-smi}
CURL=${SIMCORE_CURL:-curl}
OLLAMA_CLI=${SIMCORE_OLLAMA:-ollama}
SS=${SIMCORE_SS:-ss}
SYSTEMCTL=${SIMCORE_SYSTEMCTL:-systemctl}
UNAME_S=${SIMCORE_UNAME_S:-$(uname -s)}
UNAME_M=${SIMCORE_UNAME_M:-$(uname -m)}
TEGRA_RELEASE=${SIMCORE_TEGRA_RELEASE:-/etc/nv_tegra_release}
DT_MODEL=${SIMCORE_DT_MODEL:-/proc/device-tree/model}
MEMINFO=${SIMCORE_MEMINFO:-/proc/meminfo}
HOST_OLLAMA_URL=${SIMCORE_HOST_OLLAMA_URL:-http://localhost:11434}

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
ENV_FILE=${SIMCORE_ENV_FILE:-$ROOT/.env}
DEFAULT_SCENARIO_MODEL=qwen2.5:7b

demo=0 force_cpu=0 use_host=1 dry_run=0 alias_on=1 fallback_on=1 foreground=0 model=""
args=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --demo) demo=1 ;;
    --cpu) force_cpu=1 ;;
    --no-host) use_host=0 ;;
    --model) model=${2:?--model necesita un nombre}; shift ;;
    --model=*) model=${1#--model=} ;;
    --no-alias) alias_on=0 ;;
    --no-fallback) fallback_on=0 ;;
    --dry-run) dry_run=1 ;;
    --fg | --foreground) foreground=1 ;;
    -h | --help) usage; exit 0 ;;
    *) args+=("$1") ;;
  esac
  shift
done
default_up=0
if [[ ${#args[@]} -eq 0 ]]; then
  default_up=1
  if ((foreground)); then args=(up --build); else args=(up --build -d); fi
fi
action=${args[0]}

warn() { printf '⚠  %s\n' "$*" >&2; }
die() { printf '✖  %s\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }
# Ollama and Simcore are local: never send these requests through http_proxy.
lcurl() { "$CURL" --noproxy '*' "$@"; }

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

# ── Simcore version ─────────────────────────────────────────────────────
# A SIMCORE_REF pinned in .env (or the environment) wins over docker-compose.yml:
# warn when it isn't the version this UI expects, or features will be missing.
compose_ref=$(sed -n 's/.*SIMCORE_REF:-\([0-9a-f]\{7,40\}\)}.*/\1/p' "$ROOT/docker-compose.yml" | head -n1)
pinned_ref=${SIMCORE_REF:-}
if [[ -z $pinned_ref && -r $ENV_FILE ]]; then
  pinned_ref=$(sed -n 's/^SIMCORE_REF=//p' "$ENV_FILE" | tail -n1 | tr -d '"'"'"' ')
fi
if [[ -n $compose_ref && -n $pinned_ref ]]; then
  pinned_lc=${pinned_ref,,}
  if [[ $pinned_lc =~ ^[0-9a-f]{7,40}$ ]]; then
    # A short hash names the same commit when it is a prefix of the full one (or vice versa).
    if [[ $compose_ref != "$pinned_lc"* && $pinned_lc != "$compose_ref"* ]]; then
      warn "SIMCORE_REF=$pinned_ref (fijado en .env o en el entorno) no es la versión de Simcore que espera esta UI ($compose_ref)."
      warn "  Borra o comenta la línea SIMCORE_REF=$pinned_ref de .env para usar la buena; si no, faltarán funciones (p. ej. modificar escenarios incluidos)."
    fi
  else
    warn "SIMCORE_REF=$pinned_ref fija una rama o etiqueta; esta UI está probada con Simcore ${compose_ref:0:7}. Si algo falla, borra esa línea de .env."
  fi
fi

# ── Hardware ────────────────────────────────────────────────────────────
platform="$UNAME_S/$UNAME_M"
hw=cpu      # cpu | jetson | nvidia | apple
hw_detail=""
docker_gpu=0  # can a container use the GPU?
mem_gb=0
vram_mb=0
jetpack=""

mem_total_gb() {
  if [[ $UNAME_S == Darwin ]] && have sysctl; then
    echo $(($(sysctl -n hw.memsize 2>/dev/null || echo 0) / 1073741824))
    return
  fi
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

mem_gb=$(mem_total_gb)
mem_gb=${mem_gb:-0}
jmodel=$(jetson_model)
if [[ -n $jmodel ]]; then
  hw=jetson
  release=$(head -n1 "$TEGRA_RELEASE" 2>/dev/null || true)
  case "$release" in
    *R36*) jetpack=6 ;;
    *R35*) jetpack=5 ;;
  esac
  hw_detail="$jmodel${jetpack:+ · JetPack $jetpack} · ${mem_gb} GB compartidos"
  if [[ -z $jetpack ]]; then
    hw_problem="$jmodel con L4T no soportado por Ollama en GPU (${release:-desconocido}); hace falta JetPack 5 o 6."
  elif [[ $docker_runtimes != *nvidia* ]]; then
    hw_problem="$jmodel detectada, pero Docker no tiene el runtime 'nvidia' (instala nvidia-container-toolkit / nvidia-jetpack)."
  else
    docker_gpu=1
  fi
elif have "$NVIDIA_SMI" && "$NVIDIA_SMI" -L >/dev/null 2>&1; then
  hw=nvidia
  vram_mb=$("$NVIDIA_SMI" --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null | sort -n | tail -n1 | tr -dc '0-9')
  vram_mb=${vram_mb:-0}
  gpu_name=$("$NVIDIA_SMI" --query-gpu=name --format=csv,noheader 2>/dev/null | head -n1)
  hw_detail="$gpu_name · $((vram_mb / 1024)) GB VRAM"
  if [[ $docker_runtimes == *nvidia* ]]; then
    docker_gpu=1
  else
    hw_problem="GPU NVIDIA ($gpu_name) detectada, pero Docker no puede usarla: instala nvidia-container-toolkit y ejecuta 'sudo nvidia-ctk runtime configure --runtime=docker'."
  fi
elif [[ $UNAME_S == Darwin && $UNAME_M == arm64 ]]; then
  hw=apple
  hw_detail="Apple Silicon${mem_gb:+ · ${mem_gb} GB}"
fi

# ── Where Ollama runs ───────────────────────────────────────────────────
accel=cpu  # none | host | jetson | nvidia | cpu
host_ollama_up() {
  have "$CURL" && lcurl -sf --max-time 2 "$HOST_OLLAMA_URL/api/tags" >/dev/null 2>&1
}

if ((demo)); then
  accel=none
  detail="modo demo / LLM en la nube"
elif ((!force_cpu && use_host)) && host_ollama_up; then
  accel=host
  detail="Ollama ya corre en el host ($HOST_OLLAMA_URL)${hw_detail:+ · $hw_detail}"
elif ((!force_cpu)) && [[ ($hw == jetson || $hw == nvidia) && $docker_gpu -eq 1 ]]; then
  accel=$hw
  detail=$hw_detail
else
  ((force_cpu)) || [[ -z ${hw_problem:-} ]] || warn "${hw_problem} Se usará CPU."
  detail="sin GPU utilizable"
  [[ $mem_gb -gt 0 ]] && detail+=" · ${mem_gb} GB RAM"
  [[ $UNAME_S == Darwin ]] && warn "En macOS Docker no puede usar la GPU de Apple. Instala Ollama nativo (https://ollama.com/download) y vuelve a lanzar este script: lo detectará."
fi

# ── Model ───────────────────────────────────────────────────────────────
# Sized to what will actually run it: the GPU when usable, otherwise RAM/CPU.
parallel=2
uses_gpu=0
[[ $accel == jetson || $accel == nvidia ]] && uses_gpu=1
[[ $accel == host && ($hw == jetson || $hw == nvidia || $hw == apple) ]] && uses_gpu=1
auto_model=""
if [[ $accel != none ]]; then
  auto_model=qwen2.5:3b
  if ((uses_gpu)); then
    case $hw in
      jetson | apple) [[ $mem_gb -gt 12 ]] && auto_model=qwen2.5:7b ;;
      nvidia)
        [[ $vram_mb -ge 7500 ]] && auto_model=qwen2.5:7b
        [[ $vram_mb -ge 12000 ]] && parallel=4
        ;;
    esac
  fi
fi
# An explicit choice wins: --model, then OLLAMA_MODEL from the environment or .env.
env_model=${OLLAMA_MODEL:-}
if [[ -z $env_model && -r $ENV_FILE ]]; then
  env_model=$(sed -n 's/^OLLAMA_MODEL=//p' "$ENV_FILE" | tail -n1 | tr -d '"'"'"' ')
fi
if [[ -z $model && -n $env_model && -n $auto_model ]]; then model=$env_model; fi
model=${model:-$auto_model}
model=${model#ollama/}
alias_name=""
if ((alias_on)) && [[ -n $model && $model != "$DEFAULT_SCENARIO_MODEL" ]]; then
  alias_name=$DEFAULT_SCENARIO_MODEL
fi
# Scenarios that name a cloud model without its API key fall back to this one.
fallback=""
if ((fallback_on)) && [[ -n $model ]]; then fallback="ollama/${alias_name:-$model}"; fi

files=(-f "$ROOT/docker-compose.yml")
profile=()
case $accel in
  nvidia) files+=(-f "$ROOT/docker/compose.nvidia.yml") ;;
  jetson) files+=(-f "$ROOT/docker/compose.jetson.yml") ;;
  host) files+=(-f "$ROOT/docker/compose.host-ollama.yml") ;;
esac
[[ $accel == cpu || $accel == nvidia || $accel == jetson ]] && profile=(--profile ollama)
dc=("$DOCKER" compose "${files[@]}" ${profile[@]+"${profile[@]}"})

export OLLAMA_MODEL=$model OLLAMA_ALIAS=$alias_name OLLAMA_NUM_PARALLEL=$parallel SIMCORE_FALLBACK_MODEL=$fallback
[[ -n $jetpack ]] && export JETSON_JETPACK=$jetpack

# ── Host Ollama helpers ─────────────────────────────────────────────────
host_port() {
  local p=${HOST_OLLAMA_URL##*:}
  p=${p%%/*}
  [[ $p =~ ^[0-9]+$ ]] && echo "$p" || echo 11434
}

# The simcore container reaches the host through Docker's bridge gateway; a
# native Ollama on Linux only listens on 127.0.0.1 unless OLLAMA_HOST says so.
host_gateway() { "$DOCKER" network inspect bridge -f '{{(index .IPAM.Config 0).Gateway}}' 2>/dev/null || true; }

host_reachable_from_containers() {
  [[ $UNAME_S == Linux && -z ${SIMCORE_SKIP_HOST_CHECK:-} ]] || return 0
  local gw image
  gw=$(host_gateway)
  [[ -n $gw ]] || return 0
  lcurl -sf --max-time 3 "http://$gw:$(host_port)/api/tags" >/dev/null 2>&1 && return 0
  # The host-side probe can be fooled (firewalls, odd routing): ask a real
  # container, which is exactly what Simcore will do, when the image exists.
  image="$(basename "$ROOT" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9_-')-simcore"
  if "$DOCKER" image inspect "$image" >/dev/null 2>&1; then
    "$DOCKER" run --rm --add-host host.docker.internal:host-gateway --entrypoint python "$image" -c \
      "import urllib.request; urllib.request.urlopen('http://host.docker.internal:$(host_port)/api/tags', timeout=5)" \
      >/dev/null 2>&1 && return 0
  fi
  return 1
}

# Addresses Ollama is listening on, e.g. "127.0.0.1:11434" or "*:11434".
ollama_listen() {
  have "$SS" || return 0
  "$SS" -ltn 2>/dev/null | awk -v p=":$(host_port)" '$4 ~ p"$" { print $4 }' | sort -u | tr '\n' ' '
}

host_bind_help() {
  local listen env gw
  listen=$(ollama_listen)
  gw=$(host_gateway)
  env=$("$SYSTEMCTL" show ollama -p Environment --value 2>/dev/null || true)
  {
    echo "   Los contenedores no pueden llegar al Ollama del host (probado: http://${gw:-host.docker.internal}:$(host_port))."
    [[ -n $listen ]] && echo "   Ollama escucha en: $listen"
    if [[ -n $listen && $listen != *0.0.0.0* && $listen != *'*'* && $listen != *'[::]'* ]]; then
      echo "   → Sigue escuchando solo en local: el cambio de OLLAMA_HOST no se ha aplicado."
      if [[ $env == *OLLAMA_HOST=* ]]; then
        echo "     systemd tiene $(grep -o 'OLLAMA_HOST=[^ ]*' <<<"$env"), pero Ollama no se ha reiniciado con él."
      else
        echo "     systemd no tiene OLLAMA_HOST. Al editar, las líneas deben ir ENCIMA de"
        echo "     «### Lines below this comment will be discarded»."
      fi
    elif [[ -n $listen ]]; then
      echo "   → Ollama ya escucha en todas las interfaces: probablemente un cortafuegos bloquea"
      echo "     el puerto $(host_port) desde la red de Docker, p. ej.: sudo ufw allow from 172.16.0.0/12 to any port $(host_port)"
      echo "     (si sabes que funciona, salta esta comprobación con SIMCORE_SKIP_HOST_CHECK=1)"
    fi
    echo "   Solución:"
    echo "     sudo systemctl edit ollama"
    echo "       [Service]"
    echo "       Environment=\"OLLAMA_HOST=0.0.0.0:11434\""
    echo "     sudo systemctl daemon-reload && sudo systemctl restart ollama"
    echo "     ss -ltn | grep 11434          # debe mostrar *:11434 o 0.0.0.0:11434"
    echo "   Si lanzas Ollama a mano: OLLAMA_HOST=0.0.0.0:11434 ollama serve"
    echo "   O usa --no-host para levantar Ollama en un contenedor."
  } >&2
}

with_tag() { [[ $1 == *:* ]] && echo "$1" || echo "$1:latest"; }

host_has() {
  local m
  m=$(with_tag "$1")
  lcurl -sf --max-time 5 "$HOST_OLLAMA_URL/api/tags" 2>/dev/null | grep -Eq "\"(name|model)\": *\"${m//./\\.}\""
}

# Uses the ollama CLI when it talks to this server (shows a progress bar), else the HTTP API.
host_cli() { have "$OLLAMA_CLI" && OLLAMA_HOST=$HOST_OLLAMA_URL "$OLLAMA_CLI" "$@"; }

host_pull() {
  local m=$1
  echo "↓ Descargando $m en el Ollama del host (puede tardar unos minutos)…"
  if have "$OLLAMA_CLI"; then
    host_cli pull "$m" || die "No se pudo descargar $m en $HOST_OLLAMA_URL."
  else
    echo "  (sin la CLI de ollama en el PATH: usando la API HTTP, sin barra de progreso)"
    lcurl -sf --max-time 7200 "$HOST_OLLAMA_URL/api/pull" -d "{\"model\":\"$m\",\"stream\":false}" >/dev/null ||
      die "No se pudo descargar $m en $HOST_OLLAMA_URL."
  fi
}

host_alias() {
  local src=$1 dst=$2
  echo "⧉ Publicando $src también como $dst"
  if have "$OLLAMA_CLI"; then
    host_cli cp "$src" "$dst" || die "No se pudo crear el alias $dst."
  else
    lcurl -sf --max-time 60 "$HOST_OLLAMA_URL/api/copy" -d "{\"source\":\"$src\",\"destination\":\"$dst\"}" >/dev/null ||
      die "No se pudo crear el alias $dst."
  fi
}

# Makes sure the model (and the alias the built-in scenarios use) exist.
ensure_model() {
  local m=$1
  if [[ $accel == host ]]; then
    if host_has "$m"; then echo "✓ $m ya está en el Ollama del host"; else host_pull "$m"; fi
    if [[ -n $alias_name ]]; then
      # never replace a real model that already has the alias name
      if host_has "$alias_name"; then echo "✓ $alias_name ya existe en el Ollama del host"; else host_alias "$m" "$alias_name"; fi
    fi
  else
    "${dc[@]}" up -d ollama
    "${dc[@]}" exec -T ollama ollama pull "$m"
    if [[ -n $alias_name ]] && ! "${dc[@]}" exec -T ollama ollama list 2>/dev/null | grep -q "^$alias_name "; then
      "${dc[@]}" exec -T ollama ollama cp "$m" "$alias_name"
    fi
  fi
}

# ── Doctor ──────────────────────────────────────────────────────────────
ok() { printf '  ✓ %s\n' "$*"; }
bad() { printf '  ✗ %s\n' "$*"; problems=$((problems + 1)); }
info() { printf '    %s\n' "$*"; }

doctor() {
  local api="http://localhost:${UI_PORT:-8080}/api"
  problems=0
  echo
  echo "Diagnóstico del LLM"

  # 1. What the running simulation reports (llm_stats comes with every tick).
  local state
  state=$(lcurl -sf --max-time 5 "$api/state" 2>/dev/null || true)
  if [[ -z $state ]]; then
    bad "Simcore no responde en $api (¿está arrancado? ./scripts/simcore-up.sh)"
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
    list=$(lcurl -sf --max-time 5 "$HOST_OLLAMA_URL/api/tags" 2>/dev/null || true)
    if [[ -n $list ]]; then ok "Ollama del host responde en $HOST_OLLAMA_URL"; else bad "Ollama del host no responde en $HOST_OLLAMA_URL"; fi
    if [[ -n $list ]]; then
      if host_reachable_from_containers; then ok "Los contenedores pueden llegar al Ollama del host"
      else bad "Los contenedores NO pueden llegar al Ollama del host"; host_bind_help 2>&1 | sed 's/^/  /'; fi
    fi
  else
    list=$("${dc[@]}" exec -T ollama ollama list 2>/dev/null || true)
    if [[ -n $list ]]; then ok "El contenedor de Ollama responde"; else bad "El contenedor de Ollama no responde (¿arrancaste con --demo? Si no: ./scripts/simcore-up.sh logs ollama)"; fi
  fi
  if [[ -n $list ]]; then
    local want
    for want in ${model:+"$model"} "$DEFAULT_SCENARIO_MODEL"; do
      if grep -q "${want}" <<<"$list"; then ok "Modelo disponible: $want"
      else bad "Falta el modelo $want (./scripts/simcore-up.sh pull)"; fi
    done

    # 3. A real generation, timed, and where the model ended up (GPU/CPU).
    local test_model=${model:-$DEFAULT_SCENARIO_MODEL} start end reply
    start=$(date +%s)
    if [[ $accel == host ]]; then
      reply=$(lcurl -sf --max-time 300 "$HOST_OLLAMA_URL/api/generate" \
        -d "{\"model\":\"$test_model\",\"prompt\":\"Responde solo: hola\",\"stream\":false}" 2>/dev/null || true)
      ps=$(host_cli ps 2>/dev/null || true)
    else
      reply=$("${dc[@]}" exec -T ollama ollama run "$test_model" "Responde solo: hola" 2>/dev/null || true)
      ps=$("${dc[@]}" exec -T ollama ollama ps 2>/dev/null || true)
    fi
    end=$(date +%s)
    if [[ -n $reply ]]; then
      local secs=$((end - start)) agents per_tick
      ok "Respuesta de prueba de $test_model en ${secs} s"
      # Simcore asks every agent at once; Ollama serves $parallel at a time.
      agents=$(grep -o '"memory_summary"' <<<"$state" | wc -l | tr -d ' ' || true)
      if ((agents > 0)); then
        per_tick=$(((agents + parallel - 1) * (secs > 0 ? secs : 1) / parallel))
        info "Con $agents agentes y $parallel peticiones a la vez, cada tick tardará unos ${per_tick} s o más (las decisiones reales son más largas que la prueba)."
      fi
    else bad "$test_model no respondió a una petición de prueba"; fi

    if grep -q "CPU/GPU" <<<"$ps"; then
      bad "El modelo no cabe entero en la GPU (parte en CPU: $(grep -o '[0-9]*%/[0-9]*% CPU/GPU' <<<"$ps" | head -n1)); usa uno más pequeño con --model"
    elif grep -q "GPU" <<<"$ps"; then ok "El modelo está en la GPU: $(grep -o '[0-9]*% *GPU' <<<"$ps" | head -n1)"
    elif [[ -n $ps ]]; then
      if ((uses_gpu)); then bad "El modelo corre en CPU aunque se detectó GPU ($hw): revisa los logs de Ollama (CUDA) y docs/deploy.md"
      else ok "El modelo corre en CPU (no se detectó GPU utilizable)"; fi
    fi
    [[ -n $ps ]] && while IFS= read -r l; do info "$l"; done <<<"$ps"
  fi

  # 4. Recent failures logged by Simcore: failed calls and answers it could not parse.
  local logs fails unparsable
  logs=$("${dc[@]}" logs --since 15m simcore 2>/dev/null || true)
  fails=$(grep "LLM call failed" <<<"$logs" || true)
  unparsable=$(grep "Failed to parse action" <<<"$logs" || true)
  if [[ -n $fails ]]; then
    bad "Simcore registró $(wc -l <<<"$fails" | tr -d ' ') llamadas fallidas en los últimos 15 min. Última:"
    info "$(tail -n1 <<<"$fails" | sed 's/.*LLM call failed: //' | cut -c1-200)"
  else
    ok "Sin llamadas fallidas en los registros de Simcore (15 min)"
  fi
  if [[ -n $unparsable ]]; then
    bad "$(wc -l <<<"$unparsable" | tr -d ' ') respuestas del modelo no tenían el formato que espera Simcore (15 min); esos agentes solo esperan. Última:"
    info "$(tail -n1 <<<"$unparsable" | sed 's/.*Failed to parse action: //' | cut -c1-200)"
    info "Prueba otro modelo: ./scripts/simcore-up.sh pull llama3.2:3b y cámbialo en el editor (✎)."
  else
    ok "Todas las respuestas del modelo tenían el formato correcto (15 min)"
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
  [[ -n $fallback ]] && echo "  Nube:     escenarios con modelos de nube sin clave (gpt-4o-mini…) usan $fallback"
  if [[ $accel == host && $action != pull ]] && ! host_has "$model"; then
    echo "  Aviso:    tu Ollama aún no tiene $model; se descargará al arrancar (o: ./scripts/$(basename "$0") pull)"
  fi
fi
echo "  UI:       http://localhost:${UI_PORT:-8080}"

is_doctor=0
[[ $action == doctor ]] && is_doctor=1
cmd=("${dc[@]}" "${args[@]}")
if ((!is_doctor)) && [[ $action != pull ]]; then
  printf '  Comando:  '
  [[ -n $model ]] && printf 'OLLAMA_MODEL=%s OLLAMA_ALIAS=%s OLLAMA_NUM_PARALLEL=%s ' "$model" "$alias_name" "$parallel"
  [[ -n $jetpack ]] && printf 'JETSON_JETPACK=%s ' "$jetpack"
  printf '%q ' "${cmd[@]}"
  echo
fi

((dry_run)) && exit 0
cd "$ROOT"
me="./scripts/$(basename "$0")"

if ((is_doctor)); then
  doctor
  exit $?
fi

if [[ $action == pull ]]; then
  [[ $accel != none ]] || die "Con --demo no hay Ollama local donde descargar modelos."
  [[ ${#args[@]} -gt 1 ]] && model=${args[1]#ollama/}
  [[ $model == "$DEFAULT_SCENARIO_MODEL" ]] && alias_name=""
  ensure_model "$model"
  exit 0
fi

# In host mode there are no ollama containers: explain instead of failing.
if [[ $accel == host ]] && [[ " ${args[*]:1} " == *" ollama "* || " ${args[*]:1} " == *" ollama-pull "* ]]; then
  echo
  echo "Ollama corre en el host, no en un contenedor, así que no hay servicio 'ollama' ni 'ollama-pull'."
  echo "  Logs de Ollama:      journalctl -u ollama -f      (Linux con systemd)"
  echo "  Modelos cargados:    ollama ps"
  echo "  Descargar el modelo: $me pull [modelo]"
  exit 0
fi

if [[ $accel == host && $action == up ]]; then
  host_reachable_from_containers || { host_bind_help; die "Arréglalo y vuelve a lanzar el script."; }
  [[ -n $model ]] && ensure_model "$model"
fi

if ((default_up && !foreground)); then
  "${cmd[@]}"
  echo
  echo "✔ En marcha en segundo plano: http://localhost:${UI_PORT:-8080}"
  echo "  Logs:         $me logs -f            (Ctrl+C solo deja de mirarlos)"
  if [[ ${profile[*]-} == *ollama* ]]; then
    echo "  Modelo:       $me logs -f ollama-pull   (la primera vez descarga $model)"
  elif [[ $accel == host ]]; then
    echo "  Ollama:       journalctl -u ollama -f · ollama ps   (corre en el host)"
  fi
  echo "  Diagnóstico:  $me doctor"
  echo "  Parar:        $me down"
  exit 0
fi
exec "${cmd[@]}"
