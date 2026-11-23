#!/bin/bash
# Render the edit, mix and normalise the sound, and encode the trailer.
set -euo pipefail
cd "$(dirname "$0")"
rm -rf edit && python3 -I edit.py edit
python3 -I mix.py mix.wav
ffmpeg -hide_banner -nostats -i mix.wav -af loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json -f null - 2> ln.txt
read -r MI MTP MLRA MTH OFF < <(python3 -I -c "
import json,re
t=open('ln.txt').read(); j=json.loads(t[t.index('{'):t.rindex('}')+1])
print(j['input_i'], j['input_tp'], j['input_lra'], j['input_thresh'], j['target_offset'])")
# Plain gain to -14 LUFS integrated, then a peak limiter at -1.5 dBFS that only the blast reaches.
G=$(python3 -I -c "print(round(-14 - float('$MI'), 2))")
ffmpeg -v error -y -i mix.wav -af "volume=${G}dB,alimiter=limit=0.84:attack=3:release=80:level=disabled" -ar 48000 mix-norm.wav
ffmpeg -v error -y -framerate 30 -i edit/f%04d.jpg -i mix-norm.wav -map 0:v -map 1:a \
  -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p -profile:v high -tune film \
  -c:a aac -b:a 192k -t 30 -movflags +faststart we-left-ben-trailer.mp4
ffprobe -v error -show_entries format=duration,size:stream=codec_name,width,height,r_frame_rate,nb_frames -of compact we-left-ben-trailer.mp4
ffmpeg -v info -i we-left-ben-trailer.mp4 -af ebur128 -f null - 2>&1 | grep -E "^\s+(I|LRA|Peak):" | head -3 || true
