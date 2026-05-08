#!/usr/bin/env python3
"""
Render HTML dashboard from JSON score data
"""
import json
import sys
from pathlib import Path

def render_dashboard(json_path: str, template_path: str, output_path: str):
    # Load JSON data
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # Load template
    with open(template_path, 'r', encoding='utf-8') as f:
        html = f.read()

    meta = data['meta']
    total = data['total']
    grade = data['grade']
    grade_color = data['grade_color']
    cats = data['categories']

    # Replace header
    html = html.replace('GrowthNote · AI-Readiness Map', f"{meta['repo']} · AI-Readiness Map")
    html = html.replace('GrowthNote — AI 준비도 지도', f"{meta['repo']} — AI 준비도 지도")
    html = html.replace('점수 측정 <strong>2026-04-28</strong>', f"점수 측정 <strong>{meta['scored_at']}</strong>")
    html = html.replace('브랜치 <strong>feat/1-blog</strong>', f"브랜치 <strong>{meta['git_branch']}</strong>")
    html = html.replace('모듈 <strong>4</strong> · 컨텍스트 파일 <strong>8</strong>',
                       f"모듈 <strong>{meta['modules_total']}</strong> · 컨텍스트 파일 <strong>{meta['context_files_total']}</strong>")

    # Replace score hero
    html = html.replace('<span class="num">32</span>', f'<span class="num">{total}</span>')

    # Grade badge
    grade_map = {
        'AI-Native': 'green',
        'AI-Ready': 'green',
        'AI-Assisted': 'amber',
        'AI-Fragile': 'amber',
        'AI-Hostile': 'red'
    }
    grade_css_color = grade_map.get(grade, 'amber')

    old_badge = '''<span class="grade-badge" style="background: var(--red-soft); color: var(--red)">
              <span class="grade-dot" style="background: var(--red)"></span> AI-Hostile · 에이전트 비친화
            </span>'''
    new_badge = f'''<span class="grade-badge" style="background: var(--{grade_css_color}-soft); color: var(--{grade_css_color})">
              <span class="grade-dot" style="background: var(--{grade_css_color})"></span> {grade}
            </span>'''
    html = html.replace(old_badge, new_badge)

    # Description - find weakest 2 categories
    cat_scores = [(k, v['score'], v['max']) for k, v in cats.items()]
    cat_scores_sorted = sorted(cat_scores, key=lambda x: x[1]/x[2] if x[2] > 0 else 0)
    weak1, weak2 = cat_scores_sorted[0], cat_scores_sorted[1]

    old_desc = '''7개 카테고리 · 가중치 차등 (A 15 · B 20 · C 20 · D 15 · E 15
            · F 10 · G 5). 가장 약한 영역은 <strong>C 암묵지 외부화
            (2/20)</strong> 와 <strong>D 의존성 매핑 (2/15)</strong>.
            <strong>컨텍스트 파일에 존재하지 않는 경로 27건</strong>이
            E1 검증 항목을 무너뜨리는 핵심 원인.'''

    new_desc = f'''7개 카테고리 평가. 최약점은 <strong>{weak1[0]} {cats[weak1[0]]['name']} ({weak1[1]}/{weak1[2]})</strong>과
            <strong>{weak2[0]} {cats[weak2[0]]['name']} ({weak2[1]}/{weak2[2]})</strong>.
            {cats['B']['findings'][0] if cats['B']['findings'] else ''}.
            {cats['C']['findings'][0] if cats['C']['findings'] else ''}.'''

    html = html.replace(old_desc, new_desc)

    # Mini stats
    html = html.replace('<div class="v">3 / 4</div>',
                       f"<div class=\"v\">{cats['A']['evidence']['covered_modules']} / {cats['A']['evidence']['core_modules']}</div>")
    html = html.replace('<div class="k">잘못된 경로</div>\n              <div class="v" style="color: var(--red)">27</div>',
                       f"<div class=\"k\">잘못된 경로</div>\n              <div class=\"v\" style=\"color: var(--green)\">{cats['E']['evidence']['ref_broken']}</div>")
    html = html.replace('<div class="k">300줄 초과 파일</div>\n              <div class="v">20</div>',
                       f"<div class=\"k\">300줄 초과 파일</div>\n              <div class=\"v\" style=\"color: var(--amber)\">{meta['large_files_300plus']}</div>")

    # Categories bars - need to replace all 7 rows
    # This is complex, so we'll build the new rows section
    bars_html = []
    cat_order = ['A', 'B', 'C', 'D', 'E', 'F', 'G']

    for cat_key in cat_order:
        cat = cats[cat_key]
        score = cat['score']
        max_score = cat['max']
        ratio = score / max_score if max_score > 0 else 0
        width = int(ratio * 100)

        bar_class = 'bar-good' if ratio >= 0.75 else ('bar-warn' if ratio >= 0.5 else 'bar-bad')

        findings_text = cat['findings'][0] if cat['findings'] else '—'

        row = f'''          <div class="rule-row">
            <div class="idx">{cat_key}</div>
            <div>
              <div class="title">{cat['name']}</div>
              <div class="sub">
                {findings_text[:120]}
              </div>
            </div>
            <div class="bar {bar_class}">
              <span style="width: {width}%"></span>
            </div>
            <div class="num">{score}/{max_score}</div>
          </div>'''
        bars_html.append(row)

    # Find and replace the categories section (between rules-head and map-section)
    # For simplicity, we'll just replace the specific patterns

    # Action items - top 5
    actions_html = []
    for i, action in enumerate(data['actions'][:5], 1):
        effort_color = {'S': 'green', 'M': 'amber', 'L': 'red'}.get(action['effort'], 'amber')
        action_html = f'''            <li>
              <div class="head">
                <span class="tag tag-cat">{action['category']}</span>
                <span class="tag tag-effort">{action['effort']} · {action['effort_hours']}hr</span>
                {action['title']}
              </div>
              <div class="note">
                {action['impact']}
              </div>
            </li>'''
        actions_html.append(action_html)

    # Write output
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html)

    print(f"Dashboard rendered: {output_path}")

if __name__ == '__main__':
    if len(sys.argv) != 4:
        print("Usage: render_dashboard.py <json_path> <template_path> <output_path>")
        sys.exit(1)

    render_dashboard(sys.argv[1], sys.argv[2], sys.argv[3])
