# -*- coding: utf-8 -*-
"""由帛书老子原文生成逐字拼音数据（JS）。

用法:
  python gen_pinyin.py            # 生成 js/data/daodejing.js
  python gen_pinyin.py audit      # 输出多音字审计表，供人工校正
"""
import json
import os
import re
import sys
from collections import OrderedDict, defaultdict

from pypinyin import Style, lazy_pinyin, pinyin

BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, "laozi_boshu.txt")
OUT = os.path.join(BASE, "..", "js", "data", "daodejing.js")

# ---------------------------------------------------------------------------
# 人工校正表
# 1) PHRASE_OVERRIDE: 词/短语级，最长优先匹配，值为该短语逐字拼音列表
# 2) CHAR_DEFAULT: 字级默认读音（当短语表未命中时生效）
# ---------------------------------------------------------------------------
PHRASE_OVERRIDE = {
    # 夫 fú（发语词）
    "夫唯": ["fú", "wéi"], "夫何": ["fú", "hé"], "夫礼者": ["fú", "lǐ", "zhě"],
    "夫两": ["fú", "liǎng"], "夫代": ["fú", "dài"], "夫兵者": ["fú", "bīng", "zhě"],
    "夫乐杀人": ["fú", "lè", "shā", "rén"], "夫慈": ["fú", "cí"], "夫皆": ["fú", "jiē"],
    "夫物": ["fú", "wù"], "夫莫之爵": ["fú", "mò", "zhī", "jué"],
    "夫是以": ["fú", "shì", "yǐ"], "夫天道": ["fú", "tiān", "dào"],
    "夫大制": ["fú", "dà", "zhì"], "夫孰敢": ["fú", "shú", "gǎn"],
    "夫亦将知止": ["fú", "yì", "jiāng", "zhī", "zhǐ"],
    "夫将不辱": ["fú", "jiāng", "bù", "rǔ"],
    "夫可以": ["fú", "kě", "yǐ"],
    # 知 / 智
    "知者弗言": ["zhì", "zhě", "fú", "yán"], "知者不博": ["zhì", "zhě", "bù", "bó"],
    "知者希": ["zhī", "zhě", "xī"], "知者": ["zhì", "zhě"],
    "以知知邦": ["yǐ", "zhì", "zhī", "bāng"], "以不知知邦": ["yǐ", "bù", "zhì", "zhī", "bāng"],
    "知不知": ["zhī", "bù", "zhī"], "不知知": ["bù", "zhī", "zhī"],
    "自知": ["zì", "zhī"], "知常": ["zhī", "cháng"], "知人者": ["zhī", "rén", "zhě"],
    "知和": ["zhī", "hé"], "知止": ["zhī", "zhǐ"], "知足": ["zhī", "zú"],
    "知雄": ["zhī", "xióng"], "知荣": ["zhī", "róng"], "知白": ["zhī", "bái"],
    "莫之能知": ["mò", "zhī", "néng", "zhī"], "不我知": ["bù", "wǒ", "zhī"],
    "无知": ["wú", "zhī"], "多知": ["duō", "zhī"], "其知": ["qí", "zhì"],
    "以其知": ["yǐ", "qí", "zhì"],
    # 为 wéi / wèi
    "为腹而不为目": ["wèi", "fù", "ér", "bù", "wèi", "mù"],
    "有以为": ["yǒu", "yǐ", "wéi"], "无以为": ["wú", "yǐ", "wéi"],
    "为无为": ["wéi", "wú", "wéi"], "为学者": ["wéi", "xué", "zhě"],
    "为道者": ["wéi", "dào", "zhě"], "为天下": ["wéi", "tiān", "xià"],
    "为雌": ["wéi", "cí"], "为器": ["wéi", "qì"], "为目": ["wèi", "mù"],
    "为腹": ["wèi", "fù"], "为人": ["wèi", "rén"], "为奇": ["wéi", "qí"],
    "为下": ["wéi", "xià"], "为大": ["wéi", "dà"], "为客": ["wéi", "kè"],
    "为主": ["wéi", "zhǔ"], "为士": ["wéi", "shì"], "为成事长": ["wéi", "chéng", "shì", "zhǎng"],
    "为天下先": ["wéi", "tiān", "xià", "xiān"], "为天下正": ["wéi", "tiān", "xià", "zhèng"],
    "为天下贵": ["wéi", "tiān", "xià", "guì"], "为天下牧": ["wéi", "tiān", "xià", "mù"],
    "为天下溪": ["wéi", "tiān", "xià", "xī"], "为天下谷": ["wéi", "tiān", "xià", "gǔ"],
    "为天下式": ["wéi", "tiān", "xià", "shì"], "为天下浑心": ["wéi", "tiān", "xià", "hún", "xīn"],
    "为百谷王": ["wéi", "bǎi", "gǔ", "wáng"], "为国": ["wéi", "guó"],
    "为道": ["wéi", "dào"], "为学": ["wéi", "xué"], "为文": ["wéi", "wén"],
    "为官": ["wéi", "guān"], "为妖": ["wéi", "yāo"], "为奇": ["wéi", "qí"],
    "为无为也": ["wéi", "wú", "wéi", "yě"], "为而弗争": ["wéi", "ér", "fú", "zhēng"],
    "为而弗恃": ["wéi", "ér", "fú", "shì"], "为而弗有": ["wéi", "ér", "fú", "yǒu"],
    # 长 cháng / zhǎng
    "长之": ["zhǎng", "zhī"], "长而弗宰": ["zhǎng", "ér", "fú", "zǎi"],
    "长且久": ["cháng", "qiě", "jiǔ"], "长生久视": ["cháng", "shēng", "jiǔ", "shì"],
    "长短": ["cháng", "duǎn"], "长久": ["cháng", "jiǔ"], "长其德": ["cháng", "qí", "dé"],
    "其德乃长": ["qí", "dé", "nǎi", "cháng"], "不敢为天下先": ["bù", "gǎn", "wéi", "tiān", "xià", "xiān"],
    "成事长": ["chéng", "shì", "zhǎng"], "能长": ["néng", "zhǎng"],
    "自矜者不长": ["zì", "jīn", "zhě", "bù", "zhǎng"],
    "弗矜故能长": ["fú", "jīn", "gù", "néng", "zhǎng"],
    # 强 qiáng / qiǎng
    "强行": ["qiǎng", "xíng"], "坚强": ["jiān", "qiáng"], "兵强": ["bīng", "qiáng"],
    "木强": ["mù", "qiáng"], "守柔曰强": ["shǒu", "róu", "yuē", "qiáng"],
    "心使气曰强": ["xīn", "shǐ", "qì", "yuē", "qiáng"], "强梁": ["qiáng", "liáng"],
    "强其骨": ["qiáng", "qí", "gǔ"], "强于天下": ["qiáng", "yú", "tiān", "xià"],
    "弱之胜强": ["ruò", "zhī", "shèng", "qiáng"], "柔弱胜强": ["róu", "ruò", "shèng", "qiáng"],
    "或强或羸": ["huò", "qiáng", "huò", "léi"], "强则": ["qiáng", "zé"],
    # 重 zhòng / chóng
    "重积德": ["chóng", "jī", "dé"], "重为轻根": ["zhòng", "wéi", "qīng", "gēn"],
    "重死": ["zhòng", "sǐ"], "辎重": ["zī", "zhòng"], "民弗重": ["mín", "fú", "zhòng"],
    "厚其": ["hòu", "qí"],
    # 行 xíng
    "行无行": ["xíng", "wú", "xíng"], "行于大道": ["xíng", "yú", "dà", "dào"],
    "行妨": ["xíng", "fáng"], "尊行": ["zūn", "xíng"], "先行": ["xiān", "xíng"],
    # 乐 lè / yuè
    "乐与饵": ["yuè", "yǔ", "ěr"], "乐杀人": ["lè", "shā", "rén"],
    "乐推": ["lè", "tuī"], "乐其俗": ["lè", "qí", "sú"], "乐之": ["lè", "zhī"],
    # 好 hǎo / hào
    "好静": ["hào", "jìng"], "好还": ["hào", "huán"], "好径": ["hào", "jìng"],
    # 恶 è / wù
    "恶已": ["è", "yǐ"], "美与恶": ["měi", "yǔ", "è"], "所恶": ["suǒ", "wù"],
    "物或恶之": ["wù", "huò", "wù", "zhī"], "天之所恶": ["tiān", "zhī", "suǒ", "wù"],
    "天下之所恶": ["tiān", "xià", "zhī", "suǒ", "wù"], "众人之所恶": ["zhòng", "rén", "zhī", "suǒ", "wù"],
    "不恶": ["bù", "wù"], "而恶": ["ér", "wù"],
    # 见 jiàn / xiàn
    "自见": ["zì", "xiàn"], "见素抱朴": ["xiàn", "sù", "bào", "pǔ"],
    "不见可欲": ["bù", "xiàn", "kě", "yù"], "见小曰明": ["jiàn", "xiǎo", "yuē", "míng"],
    "不见其后": ["bù", "jiàn", "qí", "hòu"], "不见其首": ["bù", "jiàn", "qí", "shǒu"],
    "不足见": ["bù", "zú", "jiàn"], "视之而弗见": ["shì", "zhī", "ér", "fú", "jiàn"],
    "不欲见贤": ["bù", "yù", "xiàn", "xián"], "不自见": ["bù", "zì", "xiàn"],
    "不见而明": ["bù", "jiàn", "ér", "míng"],
    # 数 shù / shǔ / shuò
    "善数": ["shàn", "shǔ"], "数穷": ["shù", "qióng"], "数誉无誉": ["shuò", "yù", "wú", "yù"],
    # 属 / 朝 / 被 / 号
    "有所属": ["yǒu", "suǒ", "shǔ"], "属耳目": ["shǔ", "ěr", "mù"],
    "朝甚除": ["cháo", "shèn", "chú"], "不终朝": ["bù", "zhōng", "zhāo"],
    "被褐": ["pī", "hè"], "不被甲兵": ["bù", "pī", "jiǎ", "bīng"],
    "终日号": ["zhōng", "rì", "háo"], "号而": ["háo", "ér"],
    # 畜 / 间 / 载 / 冲 / 谷
    "德畜之": ["dé", "xù", "zhī"], "畜之": ["xù", "zhī"], "兼畜人": ["jiān", "xù", "rén"],
    "无间": ["wú", "jiàn"], "天地之间": ["tiān", "dì", "zhī", "jiān"],
    "载营魄": ["zài", "yíng", "pò"], "道冲": ["dào", "chōng"], "冲气": ["chōng", "qì"],
    "谷神": ["gǔ", "shén"], "百谷王": ["bǎi", "gǔ", "wáng"], "小谷": ["xiǎo", "gǔ"],
    "上德如谷": ["shàng", "dé", "rú", "gǔ"], "旷呵其若谷": ["kuàng", "hē", "qí", "ruò", "gǔ"],
    # 远 / 少 / 与 / 遗 / 施 / 咳 / 朘
    "远徙": ["yuǎn", "xǐ"], "远矣": ["yuǎn", "yǐ"], "不远": ["bù", "yuǎn"],
    "少私": ["shǎo", "sī"], "少则得": ["shǎo", "zé", "dé"], "大小多少": ["dà", "xiǎo", "duō", "shǎo"],
    "相与": ["xiāng", "yǔ"], "弗与": ["fú", "yǔ"], "与善": ["yǔ", "shàn"],
    "予善天": ["yǔ", "shàn", "tiān"], "既以予人": ["jì", "yǐ", "yǔ", "rén"],
    "恒与善人": ["héng", "yǔ", "shàn", "rén"], "无争与": ["wú", "zhēng", "yú"],
    "自遗咎": ["zì", "yí", "jiù"], "唯施是畏": ["wéi", "shī", "shì", "wèi"],
    "未咳": ["wèi", "hái"], "朘怒": ["zuī", "nù"], "兕虎": ["sì", "hǔ"],
    # 将/丧/相/屏
    "将欲": ["jiāng", "yù"], "将以": ["jiāng", "yǐ"], "将建": ["jiāng", "jiàn"],
    "偏将军": ["piān", "jiāng", "jūn"], "上将军": ["shàng", "jiāng", "jūn"],
    "丧事": ["sāng", "shì"], "丧礼": ["sāng", "lǐ"],
    "相望": ["xiāng", "wàng"], "相闻": ["xiāng", "wén"], "相去": ["xiāng", "qù"],
    "相若": ["xiāng", "ruò"], "相生": ["xiāng", "shēng"], "相成": ["xiāng", "chéng"],
    "相形": ["xiāng", "xíng"], "相盈": ["xiāng", "yíng"], "相和": ["xiāng", "hé"],
    "相随": ["xiāng", "suí"], "相合": ["xiāng", "hé"], "不相伤": ["bù", "xiāng", "shāng"],
    "不相往来": ["bù", "xiāng", "wǎng", "lái"],
    # 其它
    "无名之朴": ["wú", "míng", "zhī", "pǔ"], "朴虽小": ["pǔ", "suī", "xiǎo"],
    "复归于朴": ["fù", "guī", "yú", "pǔ"], "若朴": ["ruò", "pǔ"], "抱朴": ["bào", "pǔ"],
    "绳绳": ["shéng", "shéng"], "屯屯": ["zhūn", "zhūn"], "闷闷": ["mèn", "mèn"],
    "察察": ["chá", "chá"], "缺缺": ["quē", "quē"], "沌沌": ["dùn", "dùn"],
    "歙歙": ["xī", "xī"], "恢恢": ["huī", "huī"], "芸芸": ["yún", "yún"],
    "熙熙": ["xī", "xī"], "昭昭": ["zhāo", "zhāo"], "昏昏": ["hūn", "hūn"],
    "绵绵": ["mián", "mián"], "橐籥": ["tuó", "yuè"], "埏埴": ["shān", "zhí"],
    "卅辐": ["sà", "fú"], "户牖": ["hù", "yǒu"], "玄牝": ["xuán", "pìn"],
    "玄鉴": ["xuán", "jiàn"], "刍狗": ["chú", "gǒu"], "不谷": ["bù", "gǔ"],
    "禄禄": ["lù", "lù"], "硌硌": ["luò", "luò"], "稽式": ["jī", "shì"],
    "左契": ["zuǒ", "qì"], "司契": ["sī", "qì"], "司彻": ["sī", "chè"],
    "大匠斫": ["dà", "jiàng", "zhuó"], "盗竽": ["dào", "yú"], "赍财": ["jī", "cái"],
    "絜有知": ["jié", "yǒu", "zhī"], "关籥": ["guān", "yuè"], "社稷": ["shè", "jì"],
    "受邦之诟": ["shòu", "bāng", "zhī", "gòu"], "牝牡": ["pìn", "mǔ"],
    "蜂虿虺蛇": ["fēng", "chài", "huǐ", "shé"], "攫鸟": ["jué", "niǎo"],
    "朘": ["zuī"], "嗄": ["shà"], "兕": ["sì"], "憯": ["cǎn"], "诎": ["qū"],
    "绌": ["chù"], "隅": ["yú"], "渝": ["yú"], "褒": ["bāo"], "堇": ["jǐn"],
    "铦": ["xiān"], "隳": ["huī"], "羸": ["léi"], "忒": ["tè"], "翕": ["xī"],
    "阖": ["hé"], "涤": ["dí"], "疵": ["cī"], "抟": ["tuán"], "毂": ["gǔ"],
    "皦": ["jiǎo"], "徼": ["jiào"], "惚恍": ["hū", "huǎng"], "忽恍": ["hū", "huǎng"],
    "几于道": ["jī", "yú", "dào"], "不肖": ["bù", "xiào"], "繟": ["chǎn"],
    "坦而善谋": ["tǎn", "ér", "shàn", "móu"], "无适": ["wú", "shì"],
    "执一": ["zhí", "yī"], "得一": ["dé", "yī"], "执今之道": ["zhí", "jīn", "zhī", "dào"],
    "执左契": ["zhí", "zuǒ", "qì"], "执无兵": ["zhí", "wú", "bīng"],
    "执之者失之": ["zhí", "zhī", "zhě", "shī", "zhī"],
    "利器": ["lì", "qì"], "利器不": ["lì", "qì", "bù"],
    "烹小鲜": ["pēng", "xiǎo", "xiān"], "莅天下": ["lì", "tiān", "xià"],
    "悲哀莅之": ["bēi", "āi", "lì", "zhī"], "啬": ["sè"], "柢": ["dǐ"],
    "毋": ["wú"], "弗": ["fú"], "曷": ["hé"], "兮": ["xī"], "呵": ["hē"],
    "案有": ["àn", "yǒu"], "仍": ["réng"], "攘臂": ["rǎng", "bì"],
    "无敌": ["wú", "dí"], "敌": ["dí"], "省": ["xǐng"],
    # —— 审计后补正 ——
    "万乘之王": ["wàn", "shèng", "zhī", "wáng"], "万乘": ["wàn", "shèng"],
    "音声之相和": ["yīn", "shēng", "zhī", "xiāng", "hè"],
    "相和也": ["xiāng", "hè", "yě"],
    "揣而锐之": ["chuǎi", "ér", "ruì", "zhī"],
    "燕处则超若": ["yàn", "chǔ", "zé", "chāo", "ruò"],
    "以丧礼处之": ["yǐ", "sāng", "lǐ", "chǔ", "zhī"],
    "塞其兑": ["sè", "qí", "duì"],
    "以为学父": ["yǐ", "wéi", "xué", "fù"],
}

CHAR_DEFAULT = {
    "夫": "fú", "为": "wéi", "知": "zhī", "长": "cháng", "强": "qiáng",
    "重": "zhòng", "行": "xíng", "乐": "lè", "好": "hǎo", "恶": "è",
    "见": "jiàn", "数": "shù", "属": "shǔ", "朝": "cháo", "被": "bèi",
    "号": "hào", "畜": "xù", "间": "jiān", "载": "zài", "冲": "chōng",
    "谷": "gǔ", "远": "yuǎn", "少": "shǎo", "与": "yǔ", "遗": "yí",
    "施": "shī", "将": "jiāng", "丧": "sāng", "相": "xiāng", "朴": "pǔ",
    "曾": "céng", "藏": "cáng", "处": "chǔ", "斗": "dòu", "更": "gēng",
    "奇": "qí", "几": "jī", "藉": "jiè", "累": "lěi", "量": "liàng",
    "辟": "pì", "予": "yǔ", "折": "zhé", "正": "zhèng", "中": "zhōng",
    "难": "nán", "易": "yì", "分": "fēn", "教": "jiào", "胜": "shèng",
    "空": "kōng", "得": "dé", "要": "yào", "衣": "yī", "食": "shí",
    # —— 审计后补正 ——
    "薄": "bó", "诘": "jié", "似": "sì", "塞": "sè", "处": "chǔ",
    "子": "zǐ", "应": "yìng", "父": "fù", "王": "wáng", "舍": "shě",
    "华": "huá", "央": "yāng", "量": "liàng", "屏": "bǐng",
}

# —— 普通话变调：一 / 不 ——
_TONE_MARK = {}
for _t, _chars in enumerate("āēīōūǖ áéíóúǘ ǎěǐǒǔǚ àèìòùǜ".split(), start=1):
    for _c in _chars:
        _TONE_MARK[_c] = _t


def tone_of(py):
    """由带调拼音推断声调数字 1-4，无声调符号返回 0。"""
    t = 0
    for c in py:
        if c in _TONE_MARK:
            t = _TONE_MARK[c]
    return t


def apply_tone_sandhi(final):
    """一：去声前读 yí，其它声调前读 yì，句末读 yī。
       不：去声前读 bú，其余读 bù。"""
    han = [i for i, (ch, _) in enumerate(final) if re.match(r"[\u4e00-\u9fff]", ch)]
    pos = {i: k for k, i in enumerate(han)}
    for k, i in pos.items():
        ch, py = final[i]
        if ch == "一":
            nxt = han[k + 1] if k + 1 < len(han) else None
            if nxt is None:
                py = "yī"
            else:
                py = "yí" if tone_of(final[nxt][1]) == 4 else "yì"
        elif ch == "不":
            nxt = han[k + 1] if k + 1 < len(han) else None
            if nxt is not None and tone_of(final[nxt][1]) == 4:
                py = "bú"
            else:
                py = "bù"
        final[i] = (ch, py)
    return final

SENT_SPLIT = re.compile(r"[。！？；]")


def load_source():
    parts = []
    cur = None
    with open(SRC, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            if line.startswith("#PART"):
                cur = {"part": line.split(None, 1)[1], "chapters": []}
                parts.append(cur)
                continue
            no, title, text = line.split("|", 2)
            cur["chapters"].append({"no": int(no), "title": title, "text": text})
    return parts


def split_sentences(text):
    out, buf = [], ""
    for ch in text:
        buf += ch
        if ch in "。！？；":
            if buf.strip():
                out.append(buf.strip())
            buf = ""
    if buf.strip():
        out.append(buf.strip())
    return out


def annotate(sentence):
    """返回 [(char, pinyin_or_empty)]"""
    sentence = sentence
    result = []
    for ch in sentence:
        if re.match(r"[\u4e00-\u9fff]", ch):
            one = lazy_pinyin(ch, style=Style.TONE)
            auto = one[0] if one else ""
            result.append((ch, CHAR_DEFAULT.get(ch) or auto))
        else:
            result.append((ch, ""))
    # 短语覆盖
    s = sentence
    for phrase in sorted(PHRASE_OVERRIDE.keys(), key=len, reverse=True):
        val = PHRASE_OVERRIDE[phrase]
        start = 0
        while True:
            idx = s.find(phrase, start)
            if idx < 0:
                break
            for k, p in enumerate(val):
                if idx + k < len(result) and result[idx + k][0]:
                    result[idx + k] = (result[idx + k][0], p)
            start = idx + 1
    # 字级默认
    final = []
    for ch, p in result:
        if re.match(r"[\u4e00-\u9fff]", ch):
            if not p:
                p = CHAR_DEFAULT.get(ch) or lazy_pinyin(ch, style=Style.TONE)[0]
            final.append((ch, p))
        else:
            final.append((ch, ""))
    return apply_tone_sandhi(final)


def build():
    parts = load_source()
    data = []
    total_sent = 0
    for p in parts:
        chapters = []
        for c in p["chapters"]:
            sents = split_sentences(c["text"])
            total_sent += len(sents)
            chapters.append({
                "no": c["no"], "title": c["title"], "text": c["text"],
                "sent": [{"t": s, "p": [pp for _, pp in annotate(s)]} for s in sents],
            })
        data.append({"part": p["part"], "chapters": chapters})
    return data, total_sent


def audit():
    parts = load_source()
    chars = defaultdict(list)
    for p in parts:
        for c in p["chapters"]:
            for ch in c["text"]:
                if re.match(r"[\u4e00-\u9fff]", ch):
                    chars[ch].append(c["text"])
    rows = []
    for ch in sorted(chars):
        readings = pinyin(ch, heteronym=True, style=Style.TONE)[0]
        if len(readings) > 1:
            auto = lazy_pinyin(ch, style=Style.TONE)[0]
            rows.append((ch, "/".join(readings), auto, len(chars[ch])))
    for ch, rd, auto, cnt in rows:
        print(f"{ch}\t{rd}\t自动={auto}\t次数={cnt}")
    print(f"\n多音字总数: {len(rows)}")


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "audit":
        audit()
        return
    data, total = build()
    js = (
        "// 自动生成，请勿手改。源文件: tools/laozi_boshu.txt，生成脚本: tools/gen_pinyin.py\n"
        "window.DAO_DE_JING = " + json.dumps(data, ensure_ascii=False) + ";\n"
    )
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(js)
    print(f"已生成 {OUT}")
    print(f"部: {len(data)}，总句数: {total}")
    for p in data:
        print(f"  {p['part']}: {len(p['chapters'])} 章")


if __name__ == "__main__":
    main()
