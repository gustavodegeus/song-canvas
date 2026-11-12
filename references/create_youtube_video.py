#!/usr/bin/env python3
"""Make a YouTube music video with a FIXED background and ink on the notebook.

Usage:
  python create_youtube_video.py --audio "Nova Cancao.mp3" --title "Nova Canção" --motif heart
  python create_youtube_video.py --audio "Nova Cancao.mp3" --title "Nova Canção" --motif heart --only-art

Requirements: Python 3, Pillow, numpy, opencv-python; ffmpeg and ffprobe installed for MP4.
The title and doodle are composited on the notebook; the rest of the image is unchanged.
"""
import argparse
import math
import os
from pathlib import Path
import shutil
import subprocess
import sys
import unicodedata

try:
    import cv2
    import numpy as np
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    raise SystemExit("Install dependencies: pip install pillow numpy opencv-python")

HERE = Path(__file__).resolve().parent
MASTER = HERE / '01_MASTER_CADERNO_VAZIO.png'
INK = (49, 24, 15, 232)
RED = (166, 36, 18, 230)


def get_font(size):
    font_locations = [
        '/usr/share/fonts/opentype/urw-base35/Z003-MediumItalic.otf',
        '/usr/share/fonts/opentype/urw-base35/P052-Italic.otf',
        '/usr/share/fonts/truetype/lato/Lato-BoldItalic.ttf',
        '/usr/share/fonts/truetype/dejavu/DejaVuSerif-BoldItalic.ttf',
        '/Library/Fonts/Apple Chancery.ttf',
        '/System/Library/Fonts/Supplemental/Apple Chancery.ttf',
    ]
    for p in font_locations:
        if Path(p).exists():
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def draw_curve(d, points, fill=RED, width=8):
    # Smooth hand-drawn strokes from sampled quadratic Bézier curves.
    if len(points) == 3:
        a,b,c = points
        pixels = []
        for i in range(60):
            t = i / 59
            pixels.append(((1-t)**2*a[0] + 2*(1-t)*t*b[0] + t*t*c[0],
                           (1-t)**2*a[1] + 2*(1-t)*t*b[1] + t*t*c[1]))
        d.line(pixels, fill=fill, width=width, joint='curve')
    else:
        d.line(points, fill=fill, width=width, joint='curve')


def draw_heart(d, x, y):
    for off in [0, 3]:
        col = RED if off == 0 else (180,50,25,100)
        p = [(x-85,y-10),(x-94,y-80),(x-15,y-104),(x,y-50),
             (x+20,y-105),(x+96,y-70),(x+83,y-10),(x,y+90),(x-85,y-10)]
        d.line(p, fill=col, width=8 if off == 0 else 3, joint='curve')
    for dx,dy in [(-125,0),(125,0),(-115,-70),(113,-72)]:
        d.line([(x+dx,y+dy),(x+dx*1.18,y+dy*1.22)],fill=RED,width=6)


def draw_stones(d, x,y):
    for i,(rx,ry,yy) in enumerate([(130,42,y+70),(108,33,y+5),(80,28,y-52),(47,20,y-96)]):
        d.ellipse((x-rx,yy-ry,x+rx,yy+ry),outline=INK,width=7)
        d.arc((x-rx+12,yy-ry+8,x+rx-30,yy+ry-10),185,345,fill=RED,width=4)
    d.arc((x-150,y+75,x+160,y+116),190,345,fill=INK,width=5)


def draw_chain(d,x,y):
    # Two separated chain sections with break sparks.
    for dx in (-150,-82,82,150):
        yy=y+15 if abs(dx)==150 else y-15
        d.ellipse((x+dx-46,yy-22,x+dx+46,yy+22),outline=INK,width=11)
    for ang in range(0,360,45):
        rr=35; rr2=80
        a=math.radians(ang)
        d.line([(x+rr*math.cos(a),y+rr*math.sin(a)),(x+rr2*math.cos(a),y+rr2*math.sin(a))],fill=RED,width=6)


def draw_sun(d,x,y):
    d.arc((x-120,y-90,x+120,y+150),180,360,fill=RED,width=10)
    for j in range(3):
        yy=y+35+j*20
        draw_curve(d,[(x-150,yy),(x,yy+13),(x+150,yy)],fill=INK,width=6)
    for deg in range(200,341,25):
        a=math.radians(deg)
        d.line([(x+140*math.cos(a),y+20+140*math.sin(a)),
                (x+180*math.cos(a),y+20+180*math.sin(a))],fill=RED,width=6)


def draw_mountain(d,x,y):
    d.line([(x-160,y+100),(x-55,y-30),(x+10,y+37),(x+105,y-90),(x+170,y+100)],fill=INK,width=8,joint='curve')
    d.ellipse((x+92,y-150,x+120,y-120),outline=INK,width=6)
    d.line([(x+108,y-118),(x+108,y-54)],fill=INK,width=7)
    d.line([(x+107,y-103),(x+55,y-145)],fill=INK,width=7)
    d.line([(x+107,y-103),(x+152,y-146)],fill=INK,width=7)
    for dx in [-130,-80,-30,40,85,130]:
        d.line([(x+dx,y+117),(x+dx+20,y+120)],fill=RED,width=4)


def draw_drums(d,x,y):
    for dx,dy in [(-75,12),(65,-2)]:
        d.rounded_rectangle((x+dx-54,y+dy-67,x+dx+54,y+dy+95),radius=14,outline=INK,width=8)
        d.ellipse((x+dx-56,y+dy-78,x+dx+56,y+dy-43),outline=INK,width=8)
        for xx in [-30,0,30]:
            d.line([(x+dx+xx,y+dy-42),(x+dx+xx,y+dy+81)],fill=RED,width=4)
    for dx,dy in [(-170,-130),(157,-130)]:
        d.ellipse((x+dx,y+dy-4,x+dx+14,y+dy+6),fill=INK)
        d.line([(x+dx+13,y+dy),(x+dx+13,y+dy-45)],fill=INK,width=5)


def draw_town(d,x,y):
    for off,height in [(-140,75),(-65,102),(20,132),(100,95)]:
        d.rectangle((x+off-35,y+110-height,x+off+30,y+110),outline=INK,width=6)
        d.polygon([(x+off-44,y+110-height),(x+off-3,y+80-height),(x+off+35,y+110-height)],outline=INK)
        for yy in [y+100-height+30,y+100-height+60]:
            if yy < y+93:
                d.rectangle((x+off-11,yy,x+off+3,yy+18),outline=RED,width=3)
    d.line([(x-185,y+114),(x+178,y+114)],fill=INK,width=6)


def draw_traveler(d,x,y):
    # Winding path toward a sunset; simple line illustration.
    draw_curve(d,[(x-135,y+115),(x+130,y+85),(x+120,y-45)],fill=INK,width=7)
    draw_curve(d,[(x-40,y+115),(x+184,y+100),(x+127,y-45)],fill=INK,width=6)
    d.ellipse((x+105,y-123,x+148,y-80),outline=RED,width=5)
    d.ellipse((x-92,y-74,x-57,y-38),outline=INK,width=6)
    d.line([(x-75,y-38),(x-75,y+45)],fill=INK,width=8)
    d.line([(x-74,y+35),(x-105,y+94)],fill=INK,width=7)
    d.line([(x-74,y+35),(x-41,y+95)],fill=INK,width=7)
    d.line([(x-78,y-19),(x-117,y+11)],fill=INK,width=7)
    d.line([(x-78,y-17),(x-41,y+10)],fill=INK,width=7)
    d.rounded_rectangle((x-130,y-33,x-92,y+30),radius=8,outline=RED,width=6)


def draw_music(d,x,y):
    d.line([(x-60,y+60),(x-60,y-95),(x+75,y-128),(x+75,y+22)],fill=INK,width=9)
    d.ellipse((x-128,y+30,x-59,y+75),fill=INK)
    d.ellipse((x+7,y-11,x+75,y+38),fill=INK)
    for ang in [-140,-115,-60,-36]:
        a=math.radians(ang)
        d.line([(x+160*math.cos(a),y+160*math.sin(a)),(x+208*math.cos(a),y+208*math.sin(a))],fill=RED,width=5)

DRAW = {
    'heart': draw_heart, 'love':draw_heart,
    'balance':draw_stones, 'stones':draw_stones,
    'chains':draw_chain, 'fear':draw_chain,
    'sunset':draw_sun, 'life':draw_sun, 'beach':draw_sun,
    'mountain':draw_mountain, 'courage':draw_mountain,
    'drums':draw_drums, 'swing':draw_drums,
    'town':draw_town, 'home':draw_town,
    'traveler':draw_traveler, 'journey':draw_traveler,
    'music':draw_music,
}


def make_art(master: Path, title: str, motif: str, output: Path):
    base = Image.open(master).convert('RGBA')
    # Draw ONLY in an inset quadrilateral inside the existing notebook page.
    w,h=1000,600
    art = Image.new('RGBA',(w,h),(0,0,0,0))
    d=ImageDraw.Draw(art)
    tokens=title.strip().split()
    fontsize=141
    font=get_font(fontsize)
    def width_of(s):
        box=d.textbbox((0,0),s,font=font)
        return box[2]-box[0]
    if width_of(title)>890:
        best=None
        for i in range(1,len(tokens)):
            a=' '.join(tokens[:i]);b=' '.join(tokens[i:])
            imbalance=max(len(a),len(b))
            if best is None or imbalance<best[0]:best=(imbalance,a,b)
        lines=[best[1],best[2]] if best else [title]
    else:
        lines=[title]
    if len(lines)==2:
        fontsize=123
        font=get_font(fontsize)
        y0=34
        for line in lines:
            while width_of(line)>910 and fontsize>77:
                fontsize-=3; font=get_font(fontsize)
            d.text((w/2,y0),line,font=font,fill=INK,anchor='mt',stroke_width=1,stroke_fill=INK)
            y0 += 134
        under_y=320
        icon_y=451
    else:
        while width_of(title)>930 and fontsize>82:
            fontsize-=3; font=get_font(fontsize)
        d.text((w/2,55),title,font=font,fill=INK,anchor='mt',stroke_width=1,stroke_fill=INK)
        under_y=229
        icon_y=385
    draw_curve(d,[(130,under_y),(520,under_y-30),(870,under_y)],fill=RED,width=11)
    drawing=DRAW.get(motif,DRAW['music'])
    drawing(d,500,icon_y)
    # Image has x/y notebook perspective; transform ink overlay without modifying scene.
    src=np.float32([[0,0],[w,0],[w,h],[0,h]])
    dst=np.float32([[1000,520],[1582,531],[1480,940],[835,948]])
    matrix=cv2.getPerspectiveTransform(src,dst)
    rgba=np.asarray(art)
    warped=cv2.warpPerspective(rgba,matrix,(base.width,base.height),flags=cv2.INTER_CUBIC,
                                borderMode=cv2.BORDER_CONSTANT,borderValue=(0,0,0,0))
    merged=Image.alpha_composite(base,Image.fromarray(warped,'RGBA')).convert('RGB')
    output.parent.mkdir(parents=True,exist_ok=True)
    merged.save(output,quality=98)
    return output


def make_mp4(audio: Path, art: Path, mp4: Path):
    exe=shutil.which('ffmpeg')
    if exe is None:
        raise SystemExit('ffmpeg is required to produce MP4: install it or ask ChatGPT to render the video.')
    cmd=[exe,'-hide_banner','-loglevel','error','-y',
         '-loop','1','-framerate','24','-i',str(art),'-i',str(audio),
         '-map','0:v:0','-map','1:a:0','-vf','scale=1920:1080:flags=lanczos',
         '-c:v','libx264','-preset','veryfast','-tune','stillimage','-crf','22','-r','24',
         '-pix_fmt','yuv420p','-c:a','aac','-b:a','256k',
         '-shortest','-movflags','+faststart',str(mp4)]
    subprocess.run(cmd,check=True)
    return mp4


def main():
    p=argparse.ArgumentParser(description='Generate song-cover art and YouTube-ready MP4.')
    p.add_argument('--audio',type=Path,help='MP3 file (required unless --only-art)')
    p.add_argument('--title',required=True,help='Exact song title to write on notebook')
    p.add_argument('--motif',default='music',choices=sorted(DRAW.keys()),help='A song-related drawing')
    p.add_argument('--master',type=Path,default=MASTER,help='Blank master image')
    p.add_argument('--output',type=Path,default=Path.cwd(),help='Output folder')
    p.add_argument('--only-art',action='store_true',help='Create cover PNG without MP4')
    args=p.parse_args()
    if not args.only_art and (not args.audio or not args.audio.exists()):
        p.error('A valid --audio MP3 file is required for MP4. Use --only-art to preview.')
    slug=''.join(c if c.isalnum() else '_' for c in unicodedata.normalize('NFKD',args.title) if not unicodedata.combining(c)).strip('_')
    folder=args.output
    art=make_art(args.master,args.title,args.motif,folder/(slug+'_Artwork.png'))
    print('ARTWORK:',art)
    if not args.only_art:
        video=make_mp4(args.audio,art,folder/(slug+'_YouTube.mp4'))
        print('MP4:',video)

if __name__=='__main__':main()
