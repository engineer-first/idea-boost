from pathlib import Path
import xml.etree.ElementTree as E
from urllib.parse import quote
from html import escape
rootdir=Path(__file__).resolve().parents[1]
import argparse
parser=argparse.ArgumentParser()
parser.add_argument('--skill-dir', type=Path, required=True)
skill=parser.parse_args().skill_dir
p=rootdir/'out/architecture.drawio'; tree=E.parse(p); root=tree.getroot()
d=root.findall('diagram')[1]; d.set('name','移行先：PR全体のPreview・実公開は未確認'); d.clear();d.set('id','preview-plan');d.set('name','移行先：PR全体のPreview・実公開は未確認')
g=E.SubElement(d,'mxGraphModel',grid='1',gridSize='10',page='0'); cells=E.SubElement(g,'root');E.SubElement(cells,'mxCell',id='0');E.SubElement(cells,'mxCell',id='1',parent='0')
svg=['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1740 820" role="img"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10Z" fill="#40556a"/></marker></defs><rect width="1740" height="820" fill="white"/>']
font='font-family="system-ui, -apple-system, Hiragino Sans, sans-serif" fill="#23303d"'
def text(x,y,label,size=14,anchor='middle'):
 for i,line in enumerate(label.split('\n')): svg.append(f'<text x="{x}" y="{y+i*(size+6)}" font-size="{size}" text-anchor="{anchor}" {font}>{escape(line)}</text>')
def node(id,label,x,y,w,h,icon=None,container=False,fill='white'):
 style='rounded=0;html=0;whiteSpace=wrap;fontSize=14;'
 if icon:
  style+=f'cfIcon={icon};verticalLabelPosition=bottom;verticalAlign=top;align=center;labelWidth=230;'
 else: style+=f'fillColor={fill};strokeColor=#8da3b8;strokeWidth=2;'
 if container: style+='verticalAlign=top;align=left;spacing=16;'
 c=E.SubElement(cells,'mxCell',id=id,value=label,vertex='1',parent='1',style=style)
 E.SubElement(c,'mxGeometry',x=str(x),y=str(y),width=str(w),height=str(h),attrib={'as':'geometry'})
 if icon:
  data=(skill/'assets/icons'/f'{icon}.svg').read_text()
  svg.append(f'<image x="{x}" y="{y}" width="{w}" height="{h}" href="data:image/svg+xml,{quote(data,safe="")}"/>')
  text(x+w/2,y+h+22,label)
 else:
  svg.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}" stroke="#8da3b8" stroke-width="2"/>')
  text(x+18 if container else x+w/2,y+30 if container else y+h/2-5,label,16 if container else 14,'start' if container else 'middle')
def edge(id,src,tgt,label,points,tx,ty):
 c=E.SubElement(cells,'mxCell',id=id,value=label,edge='1',parent='1',source=src,target=tgt,style='edgeStyle=orthogonalEdgeStyle;rounded=0;html=0;endArrow=block;strokeColor=#40556a;strokeWidth=1.5;fontSize=12;')
 geo=E.SubElement(c,'mxGeometry',relative='1',attrib={'as':'geometry'});arr=E.SubElement(geo,'Array',attrib={'as':'points'})
 for x,y in points[1:-1]:E.SubElement(arr,'mxPoint',x=str(x),y=str(y))
 svg.append('<polyline points="'+' '.join(f'{x},{y}' for x,y in points)+'" fill="none" stroke="#40556a" stroke-width="2" marker-end="url(#arrow)"/>')
 text(tx,ty,label,12)
node('cf','Cloudflare Network',250,150,1450,650,container=True)
node('pr-a','PR A：画面・API・保存先を分離',625,255,475,480,container=True,fill='#f1f6ff')
node('pr-b','PR B：画面・API・保存先を分離',1150,255,500,480,container=True,fill='#f0faf5')
node('browser','許可したメンバー\nブラウザ',20,430,185,80)
node('google','Google\n本人ログイン',320,15,170,80)
node('access','Access\nGoogle・メール許可',355,435,64,64,icon='access')
for k,offset in [('a',0),('b',535)]:
 node('app-'+k,f'Workers Preview\nPR {k.upper()} / App + API',700+offset,420,64,64,icon='workers')
 node('db-'+k,f'D1\nPR {k.upper()} 専用',935+offset,320,64,64,icon='d1')
 node('room-'+k,f'Durable Objects\nPR {k.upper()} 専用 / PreviewRoomDO',935+offset,565,64,64,icon='durable-objects')
 edge('api-db-'+k,'app-'+k,'db-'+k,'SQL / DB binding: DB',[(764+offset,452),(850+offset,452),(850+offset,352),(935+offset,352)],840+offset,332)
 edge('api-room-'+k,'app-'+k,'room-'+k,'ROOM_DO namespace binding',[(764+offset,452),(850+offset,452),(850+offset,597),(935+offset,597)],850+offset,575)
edge('browser-access','browser','access','HTTPS',[(205,467),(355,467)],225,444)
text(303,444,'Preview URL',12)
edge('access-google','access','google','Google認証',[(419,467),(535,467),(535,55),(490,55)],535,130)
edge('access-a','access','app-a','Access JWT\n本人確認',[(419,467),(570,467),(570,452),(700,452)],591,405)
edge('access-b','access','app-b','Access JWT / 本人確認',[(419,467),(555,467),(555,220),(1125,220),(1125,452),(1235,452)],930,208)
svg.append('</svg>')
tree.write(p,encoding='utf-8',xml_declaration=True)
(rootdir/'docs/site/pr-preview/preview-architecture.svg').write_text(''.join(svg))
print('Updated editable draw.io page and separate report SVG; actual draw.io render unavailable')
