#!/usr/bin/env python3
"""雪峰Agent — 单文件服务器：HTML UI + API + 数据库查询"""
import os, re, json, sqlite3, gzip, shutil, urllib.request, urllib.parse, urllib.error
from http.server import HTTPServer, BaseHTTPRequestHandler

HERE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(HERE, 'admission_clean.db')
GZ_PATH = os.path.join(HERE, 'admission_clean.db.gz')
if not os.path.exists(DB_PATH) and os.path.exists(GZ_PATH):
    with gzip.open(GZ_PATH, 'rb') as gz:
        with open(DB_PATH, 'wb') as f:
            shutil.copyfileobj(gz, f)

HAS_DB = os.path.exists(DB_PATH)

DEFAULT_MODEL = os.environ.get('GLM_MODEL') or os.environ.get('LLM_MODEL') or 'glm-4.5-air'
FALLBACK_MODELS = [m.strip() for m in os.environ.get('GLM_FALLBACK_MODELS', 'glm-4.5-flash,glm-4-flash').split(',') if m.strip()]
LLM_BASE_URL = (os.environ.get('GLM_BASE_URL') or os.environ.get('LLM_BASE_URL') or 'https://open.bigmodel.cn/api/paas/v4').rstrip('/')
LLM_API_KEY = os.environ.get('GLM_API_KEY') or os.environ.get('LLM_API_KEY') or ''

PROVINCES = ['北京','天津','上海','重庆','河北','山西','辽宁','吉林','黑龙江','江苏','浙江','安徽',
             '福建','江西','山东','河南','湖北','湖南','广东','广西','海南','四川','贵州','云南',
             '西藏','陕西','甘肃','青海','宁夏','新疆','内蒙古']

def query_db(province=None, school=None, major=None, limit=50):
    if not HAS_DB: return None
    conn = sqlite3.connect(DB_PATH)
    conds, params = [], []
    if province: conds.append("province LIKE ?"); params.append(f"%{province}%")
    if school: conds.append("school LIKE ?"); params.append(f"%{school}%")
    if major: conds.append("major LIKE ?"); params.append(f"%{major}%")
    if not conds: conn.close(); return None
    sql = f"SELECT province,year,school_name,major_name,score,rank FROM admission WHERE {' AND '.join(conds)} AND rank>100 ORDER BY year DESC,rank ASC LIMIT ?"
    params.append(limit)
    rows = conn.execute(sql, params).fetchall()
    conn.close()
    return [{'province':r[0],'year':r[1],'school_name':r[2],'major_name':r[3],'score':r[4],'rank':r[5]} for r in rows]

def call_llm(messages, model=None, temperature=0.7, max_tokens=1800):
    if not LLM_API_KEY:
        raise RuntimeError('Server GLM API key is not configured')
    candidates = []
    for name in [model or DEFAULT_MODEL, DEFAULT_MODEL, *FALLBACK_MODELS]:
        if name and name not in candidates:
            candidates.append(name)
    last_error = None
    for name in candidates:
        payload = {
            'model': name,
            'messages': messages,
            'temperature': temperature,
            'max_tokens': max_tokens,
        }
        req = urllib.request.Request(
            LLM_BASE_URL + '/chat/completions',
            data=json.dumps(payload, ensure_ascii=False).encode('utf-8'),
            headers={
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + LLM_API_KEY,
            },
            method='POST',
        )
        try:
            with urllib.request.urlopen(req, timeout=90) as resp:
                data = json.loads(resp.read().decode('utf-8'))
            content = data.get('choices', [{}])[0].get('message', {}).get('content', '')
            if not content:
                raise RuntimeError('Empty model response')
            return {'content': content, 'model': name, 'raw': data}
        except urllib.error.HTTPError as e:
            detail = e.read().decode('utf-8', errors='ignore')[:500]
            last_error = RuntimeError(f'{name} HTTP {e.code}: {detail}')
        except Exception as e:
            last_error = e
    raise RuntimeError(str(last_error) if last_error else 'Model request failed')

def web_search(query, n=5):
    """百度搜索兜底 — 当 Tavily 不可用时使用"""
    results = []
    try:
        url = "https://www.baidu.com/s?wd=" + urllib.parse.quote(query)
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        })
        with urllib.request.urlopen(req, timeout=8) as resp:
            html = resp.read().decode("utf-8", errors="ignore")
        # 提取搜索结果摘要
        snippets = re.findall(r'<span class="content-right_[^"]*">(.*?)</span>', html)
        for s in snippets[:n]:
            clean = re.sub(r'<[^>]+>', '', s).strip()
            if len(clean) > 20:
                results.append(clean[:300])
        if not results:
            # 备选：匹配任意摘要片段
            fallback = re.findall(r'class="c-abstract"[^>]*>(.*?)</span>', html)
            for s in fallback[:n]:
                clean = re.sub(r'<[^>]+>', '', s).strip()
                if len(clean) > 20:
                    results.append(clean[:300])
        if not results:
            results.append("百度搜索未返回可用结果，建议注册 Tavily Key（tavily.com 免费）以获得更精准的AI搜索。")
    except Exception as e:
        results.append(f"搜索暂不可用（{e}）。建议注册 Tavily Key（tavily.com 免费）以获得更精准的AI搜索。")
    return results if results else ["搜索无结果。请在前端API设置中填入Tavily Key以启用联网搜索（tavily.com免费注册）。"]

class Handler(BaseHTTPRequestHandler):
    def _send(self, data, code=200):
        self.send_response(code)
        self.send_header('Content-Type','application/json;charset=utf-8')
        self.send_header('Access-Control-Allow-Origin','*')
        self.send_header('Cache-Control','no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma','no-cache')
        self.send_header('Expires','0')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin','*')
        self.send_header('Access-Control-Allow-Methods','GET,POST,OPTIONS')
        self.send_header('Access-Control-Allow-Headers','*')
        self.end_headers()

    def do_POST(self):
        if self.path.startswith('/chat'):
            try:
                length = int(self.headers.get('Content-Length', '0'))
                raw = self.rfile.read(length).decode('utf-8') if length else '{}'
                body = json.loads(raw)
                messages = body.get('messages') or []
                if not isinstance(messages, list) or not messages:
                    return self._send({'error': 'messages is required'}, 400)
                result = call_llm(
                    messages,
                    model=body.get('model'),
                    temperature=float(body.get('temperature', 0.7)),
                    max_tokens=int(body.get('max_tokens', 1800)),
                )
                return self._send({'content': result['content'], 'model': result['model']})
            except Exception as e:
                return self._send({'error': str(e)}, 500)
        return self._send({'error': 'not found'}, 404)

    def do_GET(self):
        if self.path == '/ping':
            return self._send({'ok':True,'db':HAS_DB,'model':DEFAULT_MODEL,'llm':bool(LLM_API_KEY)})
        if self.path == '/config':
            return self._send({'llm':bool(LLM_API_KEY),'model':DEFAULT_MODEL,'base_url':LLM_BASE_URL})
        if self.path.startswith('/query'):
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            rows = query_db(qs.get('province',[''])[0], qs.get('school',[''])[0], qs.get('major',[''])[0])
            return self._send({'db':rows,'count':len(rows) if rows else 0})
        if self.path.startswith('/recommend'):
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            prov = qs.get('province',[''])[0]
            major = qs.get('major',[''])[0]
            keyword = qs.get('keyword',[''])[0]
            try: rank = int(qs.get('rank',['0'])[0])
            except: rank = 0
            try: score = int(qs.get('score',['0'])[0])
            except: score = 0
            print(f"[RECOMMEND] prov={prov} rank={rank} score={score} kw={keyword[:30] if keyword else 'none'}")
            if prov and (rank > 0 or score > 0):
                conn = sqlite3.connect(DB_PATH)
                base = "province LIKE ? AND (score>0 OR rank>0)"
                bp = [f'%{prov}%']
                if major: base += " AND major_name LIKE ?"; bp.append(f'%{major}%')
                if keyword:
                    kws = keyword.split(',')
                    kw_conds = []
                    for kw in kws:
                        kw_conds.append("(major_name LIKE ? OR school_name LIKE ?)")
                        bp.append(f'%{kw}%'); bp.append(f'%{kw}%')
                    base += " AND (" + " OR ".join(kw_conds) + ")"

                chong = []; wen = []; bao = []

                # Try rank-based first, fall back to score-based
                if rank > 0:
                    chong = [{'school':r[0],'major':r[1],'score':r[2],'rank':r[3],'year':r[4]} for r in
                        conn.execute(f"SELECT school_name,major_name,score,rank,year FROM admission WHERE {base} AND rank>0 AND rank<? AND rank>=? ORDER BY rank ASC LIMIT 50",
                        bp+[rank, max(1,int(rank*0.90))]).fetchall()]
                    wen = [{'school':r[0],'major':r[1],'score':r[2],'rank':r[3],'year':r[4]} for r in
                        conn.execute(f"SELECT school_name,major_name,score,rank,year FROM admission WHERE {base} AND rank>0 AND rank>=? AND rank<=? ORDER BY rank ASC LIMIT 50",
                        bp+[rank, int(rank*1.3)]).fetchall()]
                    bao = [{'school':r[0],'major':r[1],'score':r[2],'rank':r[3],'year':r[4]} for r in
                        conn.execute(f"SELECT school_name,major_name,score,rank,year FROM admission WHERE {base} AND rank>0 AND rank>? AND rank<=? ORDER BY rank ASC LIMIT 50",
                        bp+[int(rank*1.3), int(rank*1.6)]).fetchall()]

                # If no results with keyword, retry without keyword (broader search)
                if not (chong or wen or bao) and keyword:
                    chong = [{'school':r[0],'major':r[1],'score':r[2],'rank':r[3],'year':r[4]} for r in
                        conn.execute(f"SELECT school_name,major_name,score,rank,year FROM admission WHERE province LIKE ? AND rank>0 AND rank<? AND rank>=? ORDER BY rank ASC LIMIT 50",
                        [f'%{prov}%', rank, max(1,int(rank*0.90))]).fetchall()]
                    wen = [{'school':r[0],'major':r[1],'score':r[2],'rank':r[3],'year':r[4]} for r in
                        conn.execute(f"SELECT school_name,major_name,score,rank,year FROM admission WHERE province LIKE ? AND rank>0 AND rank>=? AND rank<=? ORDER BY rank ASC LIMIT 50",
                        [f'%{prov}%', rank, int(rank*1.3)]).fetchall()]
                    bao = [{'school':r[0],'major':r[1],'score':r[2],'rank':r[3],'year':r[4]} for r in
                        conn.execute(f"SELECT school_name,major_name,score,rank,year FROM admission WHERE province LIKE ? AND rank>0 AND rank>? AND rank<=? ORDER BY rank ASC LIMIT 50",
                        [f'%{prov}%', int(rank*1.3), int(rank*1.6)]).fetchall()]

                # If rank query returned nothing, try score-based
                if not (chong or wen or bao) and score > 0:
                    # First try with keyword
                    chong = [{'school':r[0],'major':r[1],'score':r[2],'rank':r[3],'year':r[4]} for r in
                        conn.execute(f"SELECT school_name,major_name,score,rank,year FROM admission WHERE {base} AND score>? AND score<=? ORDER BY score DESC LIMIT 80",
                        bp+[score, score+25]).fetchall()]
                    wen = [{'school':r[0],'major':r[1],'score':r[2],'rank':r[3],'year':r[4]} for r in
                        conn.execute(f"SELECT school_name,major_name,score,rank,year FROM admission WHERE {base} AND score>=? AND score<=? ORDER BY score ASC LIMIT 50",
                        bp+[score-25, score+25]).fetchall()]
                    bao = [{'school':r[0],'major':r[1],'score':r[2],'rank':r[3],'year':r[4]} for r in
                        conn.execute(f"SELECT school_name,major_name,score,rank,year FROM admission WHERE {base} AND score>=? AND score<? ORDER BY score ASC LIMIT 50",
                        bp+[score-50, score-25]).fetchall()]
                    # If keyword filtered everything, retry without keyword
                    if not (chong or wen or bao):
                        base2 = "province LIKE ? AND (score>0 OR rank>0)"
                        bp2 = [f'%{prov}%']
                        chong = [{'school':r[0],'major':r[1],'score':r[2],'rank':r[3],'year':r[4]} for r in
                            conn.execute(f"SELECT school_name,major_name,score,rank,year FROM admission WHERE {base2} AND score>? AND score<=? ORDER BY score DESC LIMIT 80",
                            bp2+[score, score+25]).fetchall()]
                        wen = [{'school':r[0],'major':r[1],'score':r[2],'rank':r[3],'year':r[4]} for r in
                            conn.execute(f"SELECT school_name,major_name,score,rank,year FROM admission WHERE {base2} AND score>=? AND score<=? ORDER BY score ASC LIMIT 50",
                            bp2+[score-25, score+25]).fetchall()]
                        bao = [{'school':r[0],'major':r[1],'score':r[2],'rank':r[3],'year':r[4]} for r in
                            conn.execute(f"SELECT school_name,major_name,score,rank,year FROM admission WHERE {base2} AND score>=? AND score<? ORDER BY score ASC LIMIT 50",
                            bp2+[score-50, score-25]).fetchall()]
                conn.close()
                return self._send({'rank':rank,'score':score,'chong':chong,'wen':wen,'bao':bao})
            return self._send({'error':'need province and rank or score'},400)
        if self.path.startswith('/search'):
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            q = qs.get('q',[''])[0]
            if q: return self._send({'results':web_search(q)})
            return self._send({'results':[]})

        # Serve image files
        for img in ['img_suit.png','img_scifi.png']:
            if self.path == '/'+img:
                ip = os.path.join(HERE, img)
                if os.path.exists(ip):
                    self.send_response(200)
                    self.send_header('Content-Type','image/png')
                    self.send_header('Cache-Control','max-age=3600')
                    self.end_headers()
                    with open(ip,'rb') as f: self.wfile.write(f.read())
                    return

        # Serve the main UI page
        self.send_response(200)
        self.send_header('Content-Type','text/html;charset=utf-8')
        self.send_header('Cache-Control','no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma','no-cache')
        self.send_header('Expires','0')
        self.end_headers()
        self.wfile.write(HTML_PAGE.encode('utf-8'))

    def log_message(self, format, *args):
        msg = format%args if args else format
        if '/recommend' in msg or '/query' in msg or '/ping' in msg or '/search' in msg or '/chat' in msg:
            print(f"[REQ] {msg}")


# ========== HTML 页面（从 index.html 加载）==========
with open(os.path.join(HERE, 'index.html'), 'r', encoding='utf-8') as _f:
    HTML_PAGE = _f.read()

def main():
    port = int(os.environ.get('PORT', '8765'))
    server = HTTPServer(('0.0.0.0', port), Handler)
    print(f'雪峰Agent: http://127.0.0.1:{port}/')
    print(f'数据库: {"已加载" if HAS_DB else "未找到"}')
    try: server.serve_forever()
    except KeyboardInterrupt: server.shutdown(); print('\n已停止')

if __name__ == '__main__': main()
