#!/bin/bash
# Run only in an empty disposable Linux environment as root.
set -euo pipefail
reuse=false
if [ "${1:-}" = --reuse ]; then reuse=true; shift; fi
bundle=$(realpath "$1")
modules=$(realpath "$2")
caddy=$(realpath "$3")
test "$(id -u)" = 0
if "$reuse"; then
  test -f /opt/cloudworld/.disposable-portal-lab
  if systemctl is-active --quiet cloudworld-portal.service || systemctl is-active --quiet cloudworld-portal-projector.service; then
    echo 'Stop the lab services before reusing the installation.'
    exit 1
  fi
else
  for target in /opt/cloudworld /var/lib/cloudworld-portal /etc/cloudworld /run/systemd/system/cloudworld-portal.service /run/systemd/system/cloudworld-portal-projector.service; do
    test ! -e "$target" || { echo "Existing installation at $target"; exit 1; }
  done
  if id cloudworld >/dev/null 2>&1 || id cloudworld-portal >/dev/null 2>&1; then
    echo 'Existing service accounts. Use an empty disposable environment.'
    exit 1
  fi
  useradd --system --user-group --no-create-home --shell /usr/sbin/nologin cloudworld
  useradd --system --user-group --no-create-home --shell /usr/sbin/nologin cloudworld-portal
fi
mkdir -p /opt/cloudworld /etc/cloudworld
tar --no-same-owner -xzf "$bundle" -C /opt/cloudworld
mkdir -p /opt/cloudworld/node_modules
cp -a "$modules/." /opt/cloudworld/node_modules/
cp "$caddy" /opt/cloudworld/caddy-lab
chmod 755 /opt/cloudworld/caddy-lab
chmod 755 /opt/cloudworld
find /opt/cloudworld -path /opt/cloudworld/runtime -prune -o -exec chmod go-w {} +
touch /opt/cloudworld/.disposable-portal-lab
cd /opt/cloudworld
install -d -o cloudworld -g cloudworld -m 700 runtime
systemd-tmpfiles --create deploy/linux/cloudworld-portal.conf
printf '%s\n' 'CW_PORTAL_ORIGIN=https://localhost:28443' > /etc/cloudworld/portal.env
cp deploy/linux/cloudworld-portal.service deploy/linux/cloudworld-portal-projector.service /run/systemd/system/
systemd-analyze verify /run/systemd/system/cloudworld-portal.service /run/systemd/system/cloudworld-portal-projector.service
runuser -u cloudworld -- node --input-type=module <<'NODE'
import fs from 'node:fs';
import {onboard} from './service.mjs';
import {PortalAccounts} from './portal.mjs';
if(!fs.existsSync('runtime/lab-login.private.json')){
  onboard('lab');
  const account=await new PortalAccounts().save('lab',{username:'operator',name:'Lab user'});
  fs.writeFileSync('runtime/lab-login.private.json',JSON.stringify(account),{mode:0o600});
}else{
  const accounts=new PortalAccounts();
  await accounts.save('lab',{id:accounts.users('lab')[0].id,enabled:true});
}
NODE
openssl req -x509 -newkey rsa:2048 -nodes -keyout runtime/lab.key -out runtime/lab.crt -days 1 -subj /CN=localhost -addext subjectAltName=DNS:localhost >/dev/null 2>&1
cat > runtime/Caddyfile.lab <<'CADDY'
{
 admin off
}
https://localhost:28443 {
 bind 127.0.0.1
 tls /opt/cloudworld/runtime/lab.crt /opt/cloudworld/runtime/lab.key
 reverse_proxy 127.0.0.1:8100
}
CADDY
./caddy-lab validate --config runtime/Caddyfile.lab --adapter caddyfile >/dev/null
./caddy-lab run --config runtime/Caddyfile.lab --adapter caddyfile > runtime/proxy.private.log 2>&1 &
proxy_pid=$!
cleanup() {
  kill "$proxy_pid" 2>/dev/null || true
  wait "$proxy_pid" 2>/dev/null || true
  systemctl stop cloudworld-portal.service cloudworld-portal-projector.service || true
  rm -f /run/systemd/system/cloudworld-portal.service /run/systemd/system/cloudworld-portal-projector.service
  systemctl daemon-reload
}
trap cleanup EXIT
systemctl daemon-reload
systemctl start cloudworld-portal.service
if runuser -u cloudworld-portal -- test -r runtime/lab-login.private.json; then echo 'Portal can read operator data'; exit 1; fi
if runuser -u cloudworld-portal -- test -w service.mjs; then echo 'Portal can write source'; exit 1; fi
if runuser -u cloudworld-portal -- test -r /run/docker.sock; then echo 'Portal can access Docker'; exit 1; fi
NODE_EXTRA_CA_CERTS=/opt/cloudworld/runtime/lab.crt node scripts/Test-LinuxPortalHttps.mjs
echo 'Linux service and HTTPS laboratory passed. Services stopped by cleanup.'
