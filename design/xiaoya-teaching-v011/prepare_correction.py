"""Normalize an approved semantic correction, keeping the generated master intact."""
import hashlib
import json
import shutil
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent
SOURCE = Path('C:/Users/Jam/.codex/generated_images/019ff4f9-dc2f-7a61-8f79-b108371098e5/exec-bf33696d-ee03-46b2-8169-dfb8d0ad7eba.png')
PROMPT = "Use case: precise-object-edit. 任务：只修正参考图中“不客气 / You're welcome”的教学动作含义，输出一张7:5横向完整绘本插画，不要上下两张，不要拼图。参考图是编辑目标，也是已批准的角色与手撕纸艺术风格标准。背景保留温暖奶油纸底。小芽仍在左，暖棕色小熊仍在右。关键修正：苹果已经赠送完成，小熊独自把这唯一一个红苹果抱在自己身体的右侧身旁，苹果与小芽之间有清楚的空隙。小熊感激地看向小芽。小芽两手均完全不接触苹果，一只手空手自然摊开掌心温和回应“不客气”，另一只空手自然放低；动作轻松友善，不是正在递苹果也不是向熊索要苹果。掌心和手臂结构合理，彼此身体不交叠。保留原角色身份与比例：小芽浅柔绿梨形圆身体，头顶恰好两片深灰绿叶片、豆眼、陶杏色脸颊、短肢、无服装；熊暖棕圆耳、奶油口鼻与肚皮。保留原图2–3层哑光手撕纸拼贴、克制纤维和弱阴影，低细节，大形体，精致幼儿绘本。配色只延续雾林茶奶：#EFEADF奶油底，#CCD4BD浅灰绿，#344B45深墨绿，#749986鼠尾草绿，#D08D6C陶杏；红苹果仅为语义局部色。适合APP幼儿英语学习的清晰场景，不添加装饰、场景道具、文字、字母、符号、边框、水印、UI。归约细节，灭高频冗余。"
PROMPT_EN = "Use case: precise-object-edit. Correct only the meaning of the You're welcome teaching illustration. One complete horizontal 7:5 scene, not a collage. Preserve the approved Xiaoya and bear identities and matte torn-paper collage. Xiaoya is on the left; the warm brown bear on the right holds the single red apple alone beside its body. A clear gap separates the apple and Xiaoya. The gift has already been received. Xiaoya's hands are both empty, one palm gently open in response and the other lowered; neither hand touches the apple. This is not giving the apple, asking for it, or thanking. Xiaoya has a pale green pear-shaped body, exactly two dark sage leaves, bean eyes, clay cheeks, short limbs, and no clothes. Bear has round ears and cream muzzle and belly. Warm cream paper background, two or three matte paper layers, restrained fibers and weak shadows. Palette #EFEADF, #CCD4BD, #344B45, #749986, #D08D6C; red apple is a local semantic color only. No text, letters, symbols, frame, watermark, UI or decorative props. Reduce detail and eliminate high-frequency redundancy."

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    original = ROOT / 'hello-youre-welcome-paper-v2.png'
    runtime = ROOT / 'hello-youre-welcome-paper-v2.webp'
    shutil.copy2(SOURCE, original)
    assert sha(SOURCE) == sha(original)
    with Image.open(original) as image:
        source_size = list(image.size)
        normalized = ImageOps.fit(image.convert('RGB'), (980, 700), method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))
        normalized.save(runtime, 'WEBP', quality=88, method=6)
    with Image.open(runtime) as check:
        assert check.size == (980, 700)
    record = {
        'batch': 'v03a-teaching-correction', 'study_id': '610f2d54d7e6',
        'key': 'hello-youre-welcome', 'meaning': '不客气：苹果已赠送完成，熊单独持有；小芽空手回应。',
        'generator': 'Built-in image_gen.imagegen', 'model': 'Not exposed by tool',
        'style_id': 'handdraw-273', 'palette_id': 'tea-milk',
        'prompt': PROMPT, 'prompt_en': PROMPT_EN,
        'reference': '../v03-teaching/cards/hello-youre-welcome-paper-v1.png',
        'generated_source': str(SOURCE), 'source_dimensions': source_size,
        'original': original.name, 'original_sha256': sha(original),
        'runtime': runtime.name, 'width': 980, 'height': 700,
        'bytes': runtime.stat().st_size, 'sha256': sha(runtime),
        'opaque_background': True,
        'processing': 'Byte-identical generated PNG master. Center-fit crop to 7:5 and Lanczos resize to 980x700; RGB WebP quality88 method6. No stretching, repainting or background removal.',
        'status': 'Semantic correction delivered; user acceptance pending',
    }
    (ROOT / 'manifest.json').write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({k: record[k] for k in ('runtime', 'width', 'height', 'bytes', 'sha256')}, ensure_ascii=False))

if __name__ == '__main__':
    main()
