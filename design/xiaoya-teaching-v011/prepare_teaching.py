"""Derive teaching cards from archived generated sheets; never repaint artwork."""
import hashlib
import json
import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
RECORD = json.loads((ROOT / 'generation-record.json').read_text(encoding='utf-8'))
MEANINGS = {
    'hello-everyone': '大家好：小芽向两位朋友招手',
    'hello-morning': '早上好：窗边醒来，清晨太阳',
    'hello-youre-welcome': '不客气：小芽给予苹果后回应小熊',
    'hello-sorry': '对不起：小芽为碰倒小熊积木道歉',
    'hello-okay': '没关系：小芽安慰为碰倒积木道歉的小熊',
    'hello-goodbye': '再见：小熊离开，小芽挥手告别',
    'bed-night': '晚安：月亮窗前的睡前时刻',
    'hello-welcome': '初次见面问好：两位朋友在花园握手',
    'hello-excuse': '打扰一下：礼貌向正在阅读的小熊示意',
    'outside-ready': '准备好出发：鞋子和背包已就绪',
    'family-come': '过来：小芽招手邀请小熊靠近自己',
    'food-eat': '开饭：准备好的饭桌边邀请伙伴用餐',
    'food-hungry': '我饿了：期待食物，并非腹痛',
    'feelings-happy': '我很开心：和朋友一起玩耍',
    'feelings-tired': '我累了：白天玩耍后的休息',
    'play-turn': '轮到我：小熊滑完，小芽准备接着玩',
    'play-your-turn': '轮到你：邀请小熊放下一块积木',
    'play-can-do': '我能做到：拿着尚未放下的最后一块拼图',
    'play-did-it': '我做到了：拼图已完成',
    'play-good-job': '你做得好：赞扬小熊完成的积木塔',
    'play-again': '再试一次：重新搭建积木',
}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    for folder in ('originals', 'cards', 'runtime', 'alternates', 'checks'):
        (ROOT / folder).mkdir(exist_ok=True)
    assets, sources = [], []
    for sheet in RECORD['sheets']:
        source = Path(sheet['source'])
        archived = ROOT / 'originals' / f"sheet-{sheet['index'] + 1:02d}.png"
        shutil.copy2(source, archived)
        assert sha(source) == sha(archived), source
        sources.append({'index': sheet['index'], 'file': archived.relative_to(ROOT).as_posix(), 'sha256': sha(archived), 'generated_source': str(source)})
        with Image.open(archived) as original:
            assert original.size == (1049, 1499), original.size
            split = original.height // 2
            for position, key in enumerate(sheet['keys']):
                top, bottom = ((0, split) if position == 0 else (split, original.height))
                # At most one edge pixel removed from each half for exact 7:5 ratio.
                height = round(original.width * 5 / 7)
                y = top + max(0, (bottom - top - height) // 2)
                crop = (0, y, original.width, min(y + height, bottom))
                card = original.crop(crop).convert('RGB')
                if key is None:
                    card.save(ROOT / 'alternates' / 'play-again-alt.png')
                    continue
                png = ROOT / 'cards' / f'{key}-paper-v1.png'
                webp = ROOT / 'runtime' / f'{key}-paper-v1.webp'
                card.save(png)
                runtime = card.resize((980, 700), Image.Resampling.LANCZOS)
                runtime.save(webp, 'WEBP', quality=88, method=6)
                with Image.open(webp) as check:
                    assert check.size == (980, 700)
                assets.append({
                    'key': key, 'meaning': MEANINGS[key],
                    'card': png.relative_to(ROOT).as_posix(),
                    'runtime': webp.relative_to(ROOT).as_posix(),
                    'width': 980, 'height': 700, 'bytes': webp.stat().st_size,
                    'sha256': sha(webp), 'card_sha256': sha(png),
                    'source_sheet': sheet['index'], 'source_crop': list(crop),
                    'opaque_background': True,
                    'multi_frame_in_app': key in ('hello-sorry', 'hello-okay', 'play-again'),
                })
    assert len(assets) == 21 and len({a['key'] for a in assets}) == 21
    assert set(MEANINGS) == {a['key'] for a in assets}
    manifest = {
        'batch': RECORD['batch'], 'study_id': RECORD['study_id'],
        'generator': RECORD['generator'], 'style_id': RECORD['style_id'],
        'palette_id': RECORD['palette_id'], 'sources': sources,
        'processing': 'Byte-identical source archive; split sheet at horizontal midpoint; remove <=1 edge pixel for 7:5; RGB PNG masters; Lanczos 980x700; WebP quality88 method6. No repainting or background removal.',
        'presentation_notes': RECORD['presentation_notes'],
        'total_runtime_bytes': sum(a['bytes'] for a in assets),
        'assets': assets,
    }
    (ROOT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    contact = Image.new('RGB', (900, 7 * 250), '#EFEADF')
    draw = ImageDraw.Draw(contact)
    font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 16)
    for index, asset in enumerate(assets):
        with Image.open(ROOT / asset['runtime']) as card:
            card.thumbnail((288, 206))
            x, y = (index % 3) * 300 + 6, (index // 3) * 250 + 6
            contact.paste(card, (x, y))
            draw.text((x, y + 210), asset['key'], font=font, fill='#344B45')
    contact.save(ROOT / 'checks' / 'teaching-contact.jpg', quality=92)
    print(json.dumps({'assets': len(assets), 'source_sha_matches': len(sources), 'runtime_bytes': manifest['total_runtime_bytes'], 'contact': str(ROOT / 'checks' / 'teaching-contact.jpg')}, ensure_ascii=False))


if __name__ == '__main__':
    main()
