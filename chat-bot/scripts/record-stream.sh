#!/usr/bin/env bash
# Records a room's audio while the bot is in it: data/<room>/recordings/stream-<UTC time>.aac, the
# stream's own AAC copied as it is (no re-encoding). It asks room-feed for the stream's signed URL
# (`GET /api/rooms/<room>/stream`, as the speech service does), starts a new file whenever the
# stream drops and comes back, and stops within 5 s of the bot exiting.
# Usage, from chat-bot/: scripts/record-stream.sh <room>
set -u
room=${1:?usage: scripts/record-stream.sh <room>}
cd "$(dirname "$0")/.."
dir=data/$room/recordings
mkdir -p "$dir"

bot_running() { pgrep -f "src/main.ts .*--room $room" >/dev/null; }
stream_url() {
  curl -s "localhost:${ROOM_FEED_PORT:-8757}/api/rooms/$room/stream" | sed -nE 's/.*"url":"([^"]+)".*/\1/p'
}

while bot_running; do
  url=$(stream_url)
  if [ -n "$url" ]; then
    out=$dir/stream-$(date -u +%Y%m%d-%H%M%SZ).aac
    echo "recording $out"
    ffmpeg -nostdin -loglevel error -i "$url" -vn -c:a copy "$out" &
    ffmpeg=$!
    while kill -0 "$ffmpeg" 2>/dev/null && bot_running; do sleep 5; done
    kill "$ffmpeg" 2>/dev/null
    wait "$ffmpeg"
    # A drop that left nothing behind isn't worth keeping.
    [ -s "$out" ] || rm -f "$out"
  fi
  sleep 10
done
echo "the bot has exited, recording stopped"
