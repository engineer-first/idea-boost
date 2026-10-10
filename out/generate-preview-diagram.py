#!/usr/bin/env python3
"""Generate editable diagrams; embed/validate with the supplied Cloudflare skill."""
import argparse
import html
import json
from pathlib import Path
import re
import subprocess
import sys
import xml.etree.ElementTree as ET


def page(document, identifier, name):
    diagram = ET.SubElement(document, "diagram", id=identifier, name=name)
    model = ET.SubElement(diagram, "mxGraphModel", grid="1", gridSize="10", page="0", background="#ffffff")
    root = ET.SubElement(model, "root")
    ET.SubElement(root, "mxCell", id="0")
    ET.SubElement(root, "mxCell", id="1", parent="0")
    return root


def node(root, identifier, label, x, y, width, height, parent="1", icon=None, boundary=False, fill="#ffffff", stroke="#455a64"):
    if boundary:
        style = f"rounded=0;html=0;fillColor={fill};strokeColor={stroke};strokeWidth=2;verticalAlign=top;align=left;spacing=20;fontSize=16;whiteSpace=wrap;"
    elif icon:
        style = f"cfIcon={icon};verticalLabelPosition=bottom;verticalAlign=top;align=center;labelWidth=200;html=0;fontSize=14;whiteSpace=wrap;fontColor=#23303d;"
    else:
        style = f"rounded=1;html=0;fillColor={fill};strokeColor={stroke};strokeWidth=1.5;fontSize=14;whiteSpace=wrap;spacing=12;"
    cell = ET.SubElement(root, "mxCell", id=identifier, value=label, vertex="1", parent=parent, style=style)
    ET.SubElement(cell, "mxGeometry", x=str(x), y=str(y), width=str(width), height=str(height), **{"as": "geometry"})


def edge(root, identifier, source, target, label, points=None, dashed=False, exits="exitX=1;exitY=0.5;entryX=0;entryY=0.5;", label_position="0", offset_y=-12):
    style = "edgeStyle=orthogonalEdgeStyle;rounded=0;html=0;endArrow=block;endFill=1;strokeColor=#455a64;strokeWidth=1.5;fontSize=13;labelBackgroundColor=none;align=center;verticalAlign=bottom;exitPerimeter=0;entryPerimeter=0;"
    style += exits
    if dashed:
        style += "dashed=1;strokeColor=#77828c;"
    cell = ET.SubElement(root, "mxCell", id=identifier, value=label, edge="1", parent="1", source=source, target=target, style=style)
    geometry = ET.SubElement(cell, "mxGeometry", relative="1", x=str(label_position), **{"as": "geometry"})
    ET.SubElement(geometry, "mxPoint", x="0", y=str(offset_y), **{"as": "offset"})
    if points:
        array = ET.SubElement(geometry, "Array", **{"as": "points"})
        for x, y in points:
            ET.SubElement(array, "mxPoint", x=str(x), y=str(y))


def build():
    document = ET.Element("mxfile", host="app.diagrams.net", version="24.7.17")
    current = page(document, "current-config", "開始時：本番リポジトリ設定")
    node(current, "cf", "Cloudflare Network", 300, 170, 1180, 650, boundary=True, stroke="#f6821f")
    node(current, "browser", "利用者のブラウザ", 40, 405, 190, 80, fill="#f4f7fb")
    node(current, "google", "Google\n本人ログイン", 410, 20, 180, 90, fill="#f4f7fb")
    node(current, "app", "Workers\nidea-flow-app\nNext.js / OpenNext", 190, 240, 64, 64, parent="cf", icon="workers")
    node(current, "api", "Workers\nidea-flow-api\n認可・ルーム入口", 530, 240, 64, 64, parent="cf", icon="workers")
    node(current, "db", "D1\nidea-flow-lobby\n横断検索・権限・投影", 880, 150, 64, 64, parent="cf", icon="d1")
    node(current, "room", "Durable Objects\nRoomDO\nルームごとの共有状態", 880, 390, 64, 64, parent="cf", icon="durable-objects")
    edge(current, "browser-app", "browser", "app", "HTTPS\nideaboost.dev")
    edge(current, "app-google", "app", "google", "Google OIDC", points=[(522, 135), (500, 135)], exits="exitX=0.5;exitY=0;entryX=0.5;entryY=1;", offset_y=-5)
    edge(current, "app-api", "app", "api", "/api/*・WebSocket転送\nService Binding: API_WORKER")
    edge(current, "api-db", "api", "db", "SQL / DB binding: DB", points=[(1040, 442), (1040, 352)])
    edge(current, "api-room", "api", "room", "ROOM_DO namespace binding", points=[(1040, 442), (1040, 592)])
    edge(current, "room-db", "room", "db", "保全後の非同期投影", points=[(1380, 592), (1380, 352)], dashed=True, exits="exitX=1;exitY=0.5;entryX=1;entryY=0.5;", offset_y=-5)

    planned = page(document, "preview-plan", "準備中：Preview専用構成・未公開")
    node(planned, "cf", "Cloudflare Network", 280, 185, 1370, 850, boundary=True, stroke="#f6821f")
    node(planned, "apps", "PRごと：App Workers Preview", 285, 75, 360, 585, parent="cf", boundary=True, fill="#f1f6ff", stroke="#6494c8")
    node(planned, "shared", "Preview全体で共有：本番とは別リソース", 715, 75, 615, 585, parent="cf", boundary=True, fill="#f0faf5", stroke="#65a27e")
    node(planned, "browser", "許可したメンバー\nブラウザ", 30, 515, 190, 90, fill="#f4f7fb")
    node(planned, "google", "Google\n本人ログイン", 315, 20, 180, 90, fill="#f4f7fb")
    node(planned, "access", "Access\nGoogle・メール許可", 105, 340, 64, 64, parent="cf", icon="access")
    node(planned, "app-a", "Workers Preview\nPR A の App\nAccess JWTを検証", 145, 115, 64, 64, parent="apps", icon="workers")
    node(planned, "app-b", "Workers Preview\nPR B の App\nAccess JWTを検証", 145, 355, 64, 64, parent="apps", icon="workers")
    node(planned, "api", "Workers\nidea-boost-preview-api\n品質確認済みdevelop", 100, 235, 64, 64, parent="shared", icon="workers")
    node(planned, "db", "D1\nidea-boost-preview-lobby\n本番D1と分離", 415, 125, 64, 64, parent="shared", icon="d1")
    node(planned, "rooms", "PreviewRoomDO namespace", 325, 345, 265, 200, parent="shared", boundary=True, fill="#ffffff", stroke="#65a27e")
    node(planned, "room", "Durable Objects\nルームごとの共有状態", 100, 60, 64, 64, parent="rooms", icon="durable-objects")
    node(planned, "prod", "本番 App / API / D1 / RoomDO\n接続しない別リソース", 670, 690, 410, 100, parent="cf", fill="#f5f5f5", stroke="#737373")
    edge(planned, "browser-access", "browser", "access", "HTTPS\nPreview URL")
    edge(planned, "access-google", "access", "google", "Google認証", points=[(417, 140), (405, 140)], exits="exitX=0.5;exitY=0;entryX=0.5;entryY=1;", offset_y=-5)
    edge(planned, "access-a", "access", "app-a", "許可済み本人\nAccess JWT", points=[(510, 557), (510, 407)])
    edge(planned, "access-b", "access", "app-b", "許可済み本人\nAccess JWT", points=[(510, 557), (510, 647)])
    edge(planned, "app-a-api", "app-a", "api", "/api/*・WSを転送\nAPI_WORKER binding", points=[(935, 407), (935, 527)])
    edge(planned, "app-b-api", "app-b", "api", "/api/*・WSを転送\nAPI_WORKER binding", points=[(935, 647), (935, 527)])
    edge(planned, "api-db", "api", "db", "SQL / DB binding: DB", points=[(1270, 527), (1270, 417)])
    edge(planned, "api-room", "api", "room", "ROOM_DO namespace binding", points=[(1270, 527), (1270, 697)], label_position="0.5")
    return document


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--skill-dir", type=Path, required=True, help="Directory containing cloudflare-drawio-diagram/SKILL.md")
    args = parser.parse_args()
    output = Path(__file__).resolve().parent / "architecture.drawio"
    document = build()
    ET.indent(document, space="  ")
    ET.ElementTree(document).write(output, encoding="utf-8", xml_declaration=True)
    helper = args.skill_dir / "scripts" / "drawio.py"
    for command in ("embed", "validate"):
        subprocess.run([sys.executable, str(helper), command, str(output)], check=True)
    report = output.parent / "preview-report.html"
    if report.exists():
        configuration = {"xml": output.read_text(), "page": 1, "toolbar": "pages lightbox", "toolbar-nohide": True, "auto-fit": True, "max-height": 730, "center": True, "border": 16, "dark-mode": "light", "editable": False, "check-visible-state": False}
        markup = report.read_text()
        attribute = 'data-mxgraph="' + html.escape(json.dumps(configuration, ensure_ascii=False), quote=True) + '"'
        markup = re.sub(r'data-mxgraph="[^"]*"', lambda match: attribute, markup, count=1)
        report.write_text(markup)
    print(output)


if __name__ == "__main__":
    main()
