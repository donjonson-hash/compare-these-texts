"""Reproduce offline color-emoji PNG module from pinned upstream inputs."""
from pathlib import Path
from io import BytesIO
import argparse,base64,hashlib,json,sys
import fontTools
from fontTools.ttLib import TTFont
import PIL
from PIL import Image
import uharfbuzz as hb
FONT_SHA='72a635cb3d2f3524c51620cdde406b217204e8a6a06c6a096ff8ed4b5fd6e27b'
UNICODE_SHA='1d8a944f88d7952f7ef7c5167fef3c67995bcae24543949710231b03a201acda'
p=argparse.ArgumentParser();p.add_argument('--font',required=True);p.add_argument('--emoji-test',required=True);p.add_argument('--output',required=True);p.add_argument('--size',type=int,default=72);args=p.parse_args()
assert fontTools.__version__=='4.61.1' and PIL.__version__=='12.3.0' and hb.__version__=='0.52.0','Use pinned generator dependencies'
font_bytes=Path(args.font).read_bytes();unicode_bytes=Path(args.emoji_test).read_bytes()
assert hashlib.sha256(font_bytes).hexdigest()==FONT_SHA
assert hashlib.sha256(unicode_bytes).hexdigest()==UNICODE_SHA
f=TTFont(BytesIO(font_bytes),recalcTimestamp=False);glyph_order=f.getGlyphOrder();bitmaps=f['CBDT'].strikeData[0]
assert len(f['CBLC'].strikes)==1 and f['CBLC'].strikes[0].bitmapSizeTable.flags==1
shaper=hb.Font(hb.Face(font_bytes));candidates=[]
for line in unicode_bytes.decode().splitlines():
 line=line.partition('#')[0].strip()
 if not line:continue
 code,status=[v.strip() for v in line.split(';')]
 cps=[int(v,16) for v in code.split()]
 if 0xfe0e in cps:continue
 key='-'.join(f'{v:x}' for v in cps if v!=0xfe0f)
 candidates.append((status!='fully-qualified',key,''.join(map(chr,cps))))
sequences={};images=[];image_ids={};missing=[]
for _,key,text in sorted(candidates):
 if key in sequences:continue
 buf=hb.Buffer();buf.add_str(text);buf.guess_segment_properties();hb.shape(shaper,buf)
 glyphs=buf.glyph_infos
 if len(glyphs)!=1 or glyphs[0].codepoint==0:missing.append(key);continue
 glyph=bitmaps.get(glyph_order[glyphs[0].codepoint])
 if glyph is None:missing.append(key);continue
 assert type(glyph).__name__=='cbdt_bitmap_format_17'
 m=glyph.metrics;assert m.Advance>0
 im=Image.open(BytesIO(glyph.imageData));im.thumbnail((args.size,args.size),Image.Resampling.NEAREST)
 png=BytesIO();im.save(png,format='PNG',optimize=True);data=png.getvalue()
 item={'png':base64.b64encode(data).decode(),'left':m.BearingX/m.Advance,'bottom':(m.BearingY-m.height)/m.Advance,'width':m.width/m.Advance,'height':m.height/m.Advance}
 identity=hashlib.sha256(json.dumps(item,sort_keys=True).encode()).hexdigest()
 if identity not in image_ids:image_ids[identity]=len(images);images.append(item)
 sequences[key]=image_ids[identity]
module='// Generated offline color glyphs. See COLOR-EMOJI-SOURCE.md and licenses.\nexport default '+json.dumps({'sequences':dict(sorted(sequences.items())),'images':images},separators=(',',':'),ensure_ascii=True)+';\n'
Path(args.output).write_text(module)
print(json.dumps({'sequences':len(sequences),'images':len(images),'png_bytes':sum(len(base64.b64decode(i['png'])) for i in images),'module_bytes':len(module.encode()),'sha256':hashlib.sha256(module.encode()).hexdigest(),'missing':sorted(set(missing))}))
