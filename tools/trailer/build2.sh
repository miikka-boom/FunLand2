#!/bin/bash
# Render the edit, mix and normalise the sound, and encode the trailer.
set -euo pipefail
cd "$(dirname "$0")"
rm -rf edit2 && python3 -I edit2.py edit2
python3 -I mix2.py mix2.wav
ffmpeg -hide_banner -nostats -i mix2.wav -af loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json -f null - 2> ln2.txt
read -r MI MTP MLRA MTH OFF < <(python3 -I -c "
import json,re
t=open('ln2.txt').read(); j=json.loads(t[t.index('{'):t.rindex('}')+1])
print(j['input_i'], j['input_tp'], j['input_lra'], j['input_thresh'], j['target_offset'])")
# Plain gain to -14 LUFS integrated, then a peak limiter at -1.5 dBFS that only the blast reaches.
G=$(python3 -I -c "print(round(-14 - float('$MI'), 2))")
ffmpeg -v error -y -i mix2.wav -af "volume=${G}dB,alimiter=limit=0.668:attack=3:release=80:level=disabled" -ar 48000 mix2-norm.wav
ffmpeg -v error -y -framerate 30 -i edit2/f%04d.jpg -i mix2-norm.wav -map 0:v -map 1:a \
  -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p -profile:v high -tune film \
  -c:a aac -b:a 256k -t 30 -movflags +faststart we-left-ben-coop-trailer.mp4
ffprobe -v error -show_entries format=duration,size:stream=codec_name,width,height,r_frame_rate,nb_frames -of compact we-left-ben-coop-trailer.mp4
ffmpeg -v info -i we-left-ben-coop-trailer.mp4 -af ebur128 -f null - 2>&1 | grep -E "^\s+(I|LRA|Peak):" | head -3 || true
