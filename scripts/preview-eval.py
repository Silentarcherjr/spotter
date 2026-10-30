# Render a contact sheet directly to stdout; no extracted frame is written to disk.
import subprocess, io, base64, sys
from PIL import Image, ImageDraw
video=sys.argv[1]; seconds=[float(x) for x in sys.argv[2:]]
single=len(seconds)==1
out=Image.new('RGB', (1280,742) if single else (960,200*((len(seconds)+2)//3)), '#101820');draw=ImageDraw.Draw(out)
for i,t in enumerate(seconds):
    raw=subprocess.check_output(['ffmpeg','-hide_banner','-loglevel','error','-ss',str(t),'-i',video,'-frames:v','1','-vf','scale=1280:-2','-f','image2pipe','-vcodec','png','pipe:1'])
    frame=Image.open(io.BytesIO(raw));frame.thumbnail((1280,720) if single else (320,175));x=(i%3)*320;y=(i//3)*200
    out.paste(frame,(x,y+22));draw.text((x+5,y+3),f'{t:g} s',fill='white')
buffer=io.BytesIO();out.save(buffer,format='JPEG',quality=45);sys.stdout.write(base64.b64encode(buffer.getvalue()).decode())
