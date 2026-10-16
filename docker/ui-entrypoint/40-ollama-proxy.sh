#!/bin/sh
# Lets the editor list the models installed in Ollama: GET /ollama/api/tags is
# proxied (read-only) to $OLLAMA_URL. The name is resolved per request through
# Docker's DNS, so the ollama container may start later or not at all (the page
# then just offers free text); names only in /etc/hosts (host.docker.internal)
# are pinned here because nginx's resolver does not read that file.
set -eu
out=/etc/nginx/ollama.inc
url=${OLLAMA_URL:-}
if [ -z "$url" ]; then
  echo 'location = /ollama/api/tags { return 404; }' >"$out"
  exit 0
fi
hostport=${url#*://}
hostport=${hostport%%/*}
host=${hostport%:*}
port=${hostport##*:}
[ "$port" = "$hostport" ] && port=11434
ip=$(awk -v h="$host" '$0 !~ /^#/ { for (i = 2; i <= NF; i++) if ($i == h) { print $1; exit } }' /etc/hosts)
cat >"$out" <<CONF
location = /ollama/api/tags {
  resolver 127.0.0.11 valid=10s ipv6=off;
  set \$ollama_upstream http://${ip:-$host}:$port;
  proxy_pass \$ollama_upstream/api/tags;
  proxy_connect_timeout 3s;
  proxy_read_timeout 10s;
}
CONF
echo "ollama-proxy: /ollama/api/tags -> http://${ip:-$host}:$port"
