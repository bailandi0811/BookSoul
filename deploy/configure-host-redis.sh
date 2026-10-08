#!/usr/bin/env bash
set -euo pipefail
umask 077

helper_path="${1:?Pass the absolute redis-hardening.mjs path}"
project_dir="${2:?Pass the verified BookSoul server working directory}"
redis_conf=/etc/redis/redis.conf
redis_acl=/etc/redis/booksoul-users.acl
app_env="$project_dir/.env"
changes_applied=0
old_app_stopped=0
redis_restart_attempted=0
backup_dir=''
password_file=''
hash_file=''
candidate_conf=''
candidate_acl=''
candidate_env=''
local_url_file=''
container_url_file=''

cleanup_secrets() {
  for secret_file in \
    "$password_file" \
    "$hash_file" \
    "$candidate_env" \
    "$local_url_file" \
    "$container_url_file"
  do
    if [ -n "$secret_file" ] && [ -f "$secret_file" ]; then
      rm -- "$secret_file"
    fi
  done
}

recover() {
  result=$?
  trap - EXIT
  if [ "$result" -ne 0 ] && [ "$changes_applied" = 1 ]; then
    printf 'Redis 加固检查失败，正在恢复原配置\n'
    if sudo cp -a "$backup_dir/redis.conf" "$redis_conf" && \
       sudo cp -a "$backup_dir/app.env" "$app_env"; then
      if sudo test -e "$redis_acl" || sudo test -L "$redis_acl"; then
        sudo rm -- "$redis_acl"
      fi
      if [ "$redis_restart_attempted" = 1 ]; then
        sudo systemctl restart redis-server.service || true
      fi
      if [ "$old_app_stopped" = 1 ]; then
        sudo systemctl restart booksoul.service || true
      fi
      if sudo systemctl is-active --quiet redis-server.service && \
         sudo systemctl is-active --quiet booksoul.service && \
         [ "$(redis-cli -h 127.0.0.1 -p 6379 --raw PING 2>/dev/null)" = PONG ]; then
        printf '原 Redis 配置与旧 API 已恢复\n'
      else
        printf '自动恢复未完全通过，请保持旧 Nginx 并立即人工检查服务\n'
      fi
    else
      printf '恢复原配置失败，请停止后续操作并人工检查备份\n'
    fi
  fi
  cleanup_secrets
  exit "$result"
}
trap recover EXIT

[ "${helper_path#/}" != "$helper_path" ]
[ "${project_dir#/}" != "$project_dir" ]
[ -f "$helper_path" ]
[ -f "$app_env" ]
[ "$(systemctl show booksoul.service -p WorkingDirectory --value)" = "$project_dir" ]
sudo systemctl is-active --quiet redis-server.service
sudo systemctl is-active --quiet booksoul.service
curl -fsS http://127.0.0.1:3000/ >/dev/null

[ "$(stat -c '%a:%U:%G' "$app_env")" = '600:admin:admin' ]
[ "$(sudo stat -c '%a:%U:%G' "$redis_conf")" = '640:redis:redis' ]
if sudo test -e "$redis_acl" || sudo test -L "$redis_acl"; then
  printf '目标 ACL 文件已存在，停止操作，避免覆盖\n'
  exit 1
fi

redis_network="$(sudo docker network inspect booksoul_application --format '{{.Driver}}|{{.Internal}}|{{range .IPAM.Config}}{{.Subnet}}|{{.Gateway}}{{end}}')"
[ "$redis_network" = 'bridge|false|172.30.0.0/24|172.30.0.1' ] || {
  printf 'Docker 应用网络与已核对目标不一致\n'
  exit 1
}
ip -4 addr show docker0 | grep -q 'inet 172.17.0.1/16 '

[ "$(redis-cli -h 127.0.0.1 -p 6379 --raw PING)" = PONG ]
[ "$(redis-cli -h 127.0.0.1 -p 6379 --raw DBSIZE)" = 0 ]
[ "$(redis-cli -h 127.0.0.1 -p 6379 --raw ACL USERS)" = default ]
[ "$(redis-cli -h 127.0.0.1 -p 6379 --raw ACL WHOAMI)" = default ]
[ -z "$(redis-cli -h 127.0.0.1 -p 6379 --raw CONFIG GET aclfile | sed -n '2p')" ]

busy_count="$(sudo -u postgres psql -X -v ON_ERROR_STOP=1 -At -d booksoul -c "SELECT (SELECT count(*) FROM public.\"IngestionJob\" WHERE status IN ('QUEUED','RUNNING')) + (SELECT count(*) FROM public.\"AgentRun\" WHERE status='RUNNING');")"
[ "$busy_count" = 0 ] || {
  printf '存在待处理索引或 Agent 任务，停止操作\n'
  exit 1
}

operator_uid="$(id -u)"
operator_gid="$(id -g)"
backup_dir="$(mktemp -d "$HOME/booksoul-redis-backup.XXXXXXXX")"
chmod 700 "$backup_dir"
sudo cp -a "$redis_conf" "$backup_dir/redis.conf"
cp -a "$app_env" "$backup_dir/app.env"
sudo install -m 600 -o "$operator_uid" -g "$operator_gid" \
  "$redis_conf" "$backup_dir/redis.conf.input"

password_file="$backup_dir/.password"
hash_file="$backup_dir/.password.sha256"
candidate_conf="$backup_dir/redis.conf.candidate"
candidate_acl="$backup_dir/booksoul-users.acl.candidate"
candidate_env="$backup_dir/app.env.candidate"
local_url_file="$backup_dir/.local-url"
container_url_file="$backup_dir/.container-url"

openssl rand -hex 32 >"$password_file"
tr -d '\n' <"$password_file" | sha256sum | awk '{print $1}' >"$hash_file"

node "$helper_path" harden-config \
  "$backup_dir/redis.conf.input" "$candidate_conf"
node "$helper_path" build-acl "$hash_file" "$candidate_acl"
node "$helper_path" rewrite-env \
  "$app_env" "$password_file" "$candidate_env" \
  "$local_url_file" "$container_url_file"

grep -qx 'bind 127.0.0.1 -::1 172.17.0.1' "$candidate_conf"
grep -qx 'aclfile /etc/redis/booksoul-users.acl' "$candidate_conf"
grep -qx 'user default off' "$candidate_acl"
grep -q '^user booksoul on #[a-f0-9]\{64\} ' "$candidate_acl"
[ "$(grep -c '^REDIS_URL=' "$candidate_env")" = 1 ]

changes_applied=1
sudo install -m 640 -o redis -g redis "$candidate_acl" "$redis_acl"
sudo install -m 640 -o redis -g redis "$candidate_conf" "$redis_conf"
install -m 600 "$candidate_env" "$app_env"

printf '备份和候选配置已核对，正在短暂停止旧 API 并重启 Redis\n'
sudo systemctl stop booksoul.service
old_app_stopped=1
redis_restart_attempted=1
sudo systemctl restart redis-server.service
sudo systemctl is-active --quiet redis-server.service

redis_password="$(tr -d '\n' <"$password_file")"
[ "$(REDISCLI_AUTH="$redis_password" redis-cli --user booksoul -h 127.0.0.1 -p 6379 --raw PING)" = PONG ]
unauthenticated_result="$(redis-cli -h 127.0.0.1 -p 6379 --raw PING 2>&1 || true)"
case "$unauthenticated_result" in
  *NOAUTH*) ;;
  *) printf '未认证连接没有被拒绝\n'; exit 1 ;;
esac
permission_result="$(REDISCLI_AUTH="$redis_password" redis-cli --user booksoul -h 127.0.0.1 -p 6379 --raw CONFIG GET bind 2>&1 || true)"
case "$permission_result" in
  *NOPERM*) ;;
  *) printf 'ACL 仍允许管理命令\n'; exit 1 ;;
esac
[ "$(REDISCLI_AUTH="$redis_password" redis-cli --user booksoul -h 127.0.0.1 -p 6379 --raw EVAL "redis.call('SET', KEYS[1], '1', 'PX', 10000); return redis.call('DEL', KEYS[1])" 1 'booksoul:{agent-admission}:deployment-check')" = 1 ]

redis_listeners="$(sudo ss -H -lnt | awk '$4 ~ /:6379$/ {print $4}')"
printf '%s\n' "$redis_listeners" | grep -qx '127.0.0.1:6379'
printf '%s\n' "$redis_listeners" | grep -qx '172.17.0.1:6379'
printf '%s\n' "$redis_listeners" | while IFS= read -r listener; do
  case "$listener" in
    '127.0.0.1:6379'|'172.17.0.1:6379'|'[::1]:6379'|'::1:6379') ;;
    *) printf '发现意外 Redis 监听地址：%s\n' "$listener"; exit 1 ;;
  esac
done

sudo systemctl start booksoul.service
for attempt in $(seq 1 30); do
  if sudo systemctl is-active --quiet booksoul.service && \
     curl -fsS http://127.0.0.1:3000/ >/dev/null 2>&1; then
    break
  fi
  [ "$attempt" -lt 30 ] || {
    printf '旧 API 未在时限内恢复\n'
    exit 1
  }
  sleep 1
done

container_redis_url="$(tr -d '\n' <"$container_url_file")"
printf 'REDIS_URL=%s\n' "$container_redis_url" |
sudo docker run --rm \
  --network booksoul_application \
  --add-host host.docker.internal:host-gateway \
  --env-file /dev/stdin \
  --entrypoint node \
  booksoul-api:release-001 \
  -e '
const { createClient } = require("redis");
const client = createClient({ url: process.env.REDIS_URL, socket: { connectTimeout: 5000 } });
client.on("error", () => {});
(async () => {
  await client.connect();
  const result = await client.eval(
    "redis.call(\"SET\", KEYS[1], \"1\", \"PX\", 10000); return redis.call(\"DEL\", KEYS[1])",
    { keys: ["booksoul:{agent-admission}:container-check"], arguments: [] },
  );
  if (Number(result) !== 1) throw new Error("unexpected result");
  await client.quit();
  console.log("容器 Redis 认证与受限 EVAL 检查通过");
})().catch(() => {
  console.error("容器 Redis 检查失败");
  process.exit(1);
});
'
unset container_redis_url redis_password

[ "$(tr -d '\n' <"$password_file" | wc -c)" = 64 ]
cleanup_secrets
trap - EXIT
printf 'Redis 加固完成；旧 API 与容器连接检查均通过\n'
printf '备份目录已保留，未执行数据库迁移或启动新 API\n'
